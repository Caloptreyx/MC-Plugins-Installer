//! `/mcplugins/verify`: compares the hash of one file in `plugins/` with the hash its source
//! published, so a download or manual upload can be checked before it is put in place. Only the
//! verdict is returned, never the hash itself.

use serde::Deserialize;
use shared::State;
use utoipa::ToSchema;
use utoipa_axum::{router::OpenApiRouter, routes};

#[derive(ToSchema, Deserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum Algorithm {
    Sha1,
    Sha256,
    Sha512,
    Curseforge,
}

impl Algorithm {
    fn wings(self) -> wings_api::Algorithm {
        match self {
            Algorithm::Sha1 => wings_api::Algorithm::Sha1,
            Algorithm::Sha256 => wings_api::Algorithm::Sha256,
            Algorithm::Sha512 => wings_api::Algorithm::Sha512,
            Algorithm::Curseforge => wings_api::Algorithm::Curseforge,
        }
    }
}

/// Whether `name` is a temporary upload name: `.mcpi-upload-` + 8 to 32 letters or digits + `.tmp`.
fn is_upload_name(name: &str) -> bool {
    name.strip_prefix(super::plugins::UPLOAD_PREFIX)
        .and_then(|rest| rest.strip_suffix(".tmp"))
        .is_some_and(|token| {
            (8..=32).contains(&token.len()) && token.bytes().all(|b| b.is_ascii_alphanumeric())
        })
}

/// Whether `name` is a single file name inside `plugins/` that may be checked: a plugin jar
/// (`.jar` or `.jar.disabled`, no leading dot) or a temporary upload.
fn is_verifiable_name(name: &str) -> bool {
    if name.is_empty()
        || name.chars().count() > 255
        || name == "."
        || name == ".."
        || name.contains(['/', '\\'])
        || name.chars().any(char::is_control)
    {
        return false;
    }

    let lower = name.to_ascii_lowercase();
    let jar = !name.starts_with('.') && (lower.ends_with(".jar") || lower.ends_with(".jar.disabled"));
    jar || is_upload_name(name)
}

/// Compares hashes: hex case-insensitively, CurseForge fingerprints as numbers.
fn hashes_match(algorithm: Algorithm, actual: &str, expected: &str) -> bool {
    let (actual, expected) = (actual.trim(), expected.trim());
    match algorithm {
        Algorithm::Curseforge => matches!(
            (actual.parse::<u64>(), expected.parse::<u64>()),
            (Ok(actual), Ok(expected)) if actual == expected
        ),
        Algorithm::Sha1 | Algorithm::Sha256 | Algorithm::Sha512 => {
            !actual.is_empty() && actual.eq_ignore_ascii_case(expected)
        }
    }
}

mod post {
    use super::Algorithm;
    use axum::http::StatusCode;
    use garde::Validate;
    use serde::{Deserialize, Serialize};
    use shared::{
        ApiError, GetState,
        models::{server::GetServer, user::GetPermissionManager},
        response::{ApiResponse, ApiResponseResult},
    };
    use utoipa::ToSchema;

    /// Checks per user and minute; one runs after every install.
    const LIMIT: u64 = 30;

    #[derive(ToSchema, Validate, Deserialize)]
    pub struct Payload {
        /// File name inside `plugins/`.
        #[garde(length(chars, min = 1, max = 255))]
        #[schema(max_length = 255)]
        file: compact_str::CompactString,
        #[garde(skip)]
        algorithm: Algorithm,
        /// Hex hash, or the CurseForge fingerprint as a decimal number.
        #[garde(length(chars, min = 1, max = 128))]
        #[schema(max_length = 128)]
        expected: String,
    }

    #[derive(ToSchema, Serialize)]
    struct Response {
        /// `false` also when the file doesn't exist.
        matches: bool,
    }

    #[utoipa::path(post, path = "/", responses(
        (status = OK, body = inline(Response)),
        (status = BAD_REQUEST, body = ApiError),
        (status = UNAUTHORIZED, body = ApiError),
        (status = NOT_FOUND, body = ApiError),
        (status = TOO_MANY_REQUESTS, body = ApiError),
        (status = BAD_GATEWAY, body = ApiError),
    ), params(
        (
            "server" = uuid::Uuid,
            description = "The server ID",
            example = "123e4567-e89b-12d3-a456-426614174000",
        ),
    ), request_body = inline(Payload))]
    pub async fn route(
        state: GetState,
        permissions: GetPermissionManager,
        mut server: GetServer,
        shared::Payload(data): shared::Payload<Payload>,
    ) -> ApiResponseResult {
        permissions.has_server_permission("files.create")?;
        super::super::ratelimit(&state, &permissions, "verify", LIMIT).await?;

        if let Err(errors) = shared::utils::validate_data(&data) {
            return ApiResponse::new_serialized(ApiError::new_strings_value(errors))
                .with_status(StatusCode::BAD_REQUEST)
                .ok();
        }
        if !super::is_verifiable_name(&data.file) {
            return ApiResponse::error("invalid plugin file name")
                .with_status(StatusCode::BAD_REQUEST)
                .ok();
        }

        let path = super::super::plugins::plugin_path(&data.file);
        if server.is_ignored(path.as_str(), false) {
            return ApiResponse::error("file not found")
                .with_status(StatusCode::NOT_FOUND)
                .ok();
        }

        let client = server
            .node
            .fetch_cached(&state.database)
            .await?
            .api_client(&state.database)
            .await?;

        let query = wings_api::servers_server_files_fingerprints::get::Query {
            algorithm: Some(data.algorithm.wings()),
            files: Some(vec![path]),
            ignored: server.0.subuser_ignored_files.clone(),
            ..Default::default()
        };
        let fingerprints = match client
            .get_servers_server_files_fingerprints(server.uuid, &query)
            .await
        {
            Ok(response) => response.fingerprints,
            Err(wings_api::client::ApiHttpError::Http(StatusCode::NOT_FOUND, _)) => {
                return ApiResponse::new_serialized(Response { matches: false }).ok();
            }
            Err(err) => {
                tracing::warn!(server = %server.uuid, "failed to fingerprint a plugin: {err:?}");
                return ApiResponse::error("the node could not check the file")
                    .with_status(StatusCode::BAD_GATEWAY)
                    .ok();
            }
        };

        let matches = super::super::plugins::find_fingerprint(&fingerprints, &data.file)
            .is_some_and(|actual| super::hashes_match(data.algorithm, &actual, &data.expected));

        ApiResponse::new_serialized(Response { matches }).ok()
    }
}

pub fn router(state: &State) -> OpenApiRouter<State> {
    OpenApiRouter::new()
        .routes(routes!(post::route))
        .with_state(state.clone())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plugin_jars_and_upload_names_can_be_checked() {
        for name in [
            "WorldEdit.jar",
            "WorldEdit.JAR",
            "WorldEdit.jar.disabled",
            "WorldEdit.Jar.Disabled",
            ".mcpi-upload-abcd1234.tmp",
            ".mcpi-upload-ABCDEFGHijklmnop0123456789abcdef.tmp",
        ] {
            assert!(is_verifiable_name(name), "{name} should be accepted");
        }
        for name in [
            "",
            ".",
            "..",
            "../WorldEdit.jar",
            "sub/WorldEdit.jar",
            "sub\\WorldEdit.jar",
            ".WorldEdit.jar",
            "WorldEdit\n.jar",
            "WorldEdit.zip",
            "WorldEdit.jar.backup",
            ".mcpi-upload-abc.tmp",
            ".mcpi-upload-abcd1234.jar",
            ".mcpi-upload-abcd-1234.tmp",
            ".mcpi-upload-abcdefghijklmnopqrstuvwxyz0123456.tmp",
            &format!("{}.jar", "a".repeat(252)),
        ] {
            assert!(!is_verifiable_name(name), "{name:?} should be rejected");
        }
    }

    #[test]
    fn hex_hashes_compare_case_insensitively() {
        assert!(hashes_match(Algorithm::Sha1, "abcdef01", "ABCDEF01"));
        assert!(hashes_match(Algorithm::Sha512, "abc", "abc"));
        assert!(!hashes_match(Algorithm::Sha256, "abc", "abd"));
        assert!(!hashes_match(Algorithm::Sha1, "", ""));
    }

    #[test]
    fn curseforge_fingerprints_compare_as_numbers() {
        assert!(hashes_match(Algorithm::Curseforge, "3000000000", "3000000000"));
        assert!(hashes_match(Algorithm::Curseforge, "42", "042"));
        assert!(!hashes_match(Algorithm::Curseforge, "42", "43"));
        assert!(!hashes_match(Algorithm::Curseforge, "42", "forty-two"));
    }
}
