//! `/mcplugins/plugins`: the jars in `plugins/` with their hashes, computed by Wings in batches.

use shared::State;
use utoipa_axum::{router::OpenApiRouter, routes};

pub const PLUGINS_DIRECTORY: &str = "plugins";
const DISABLED_SUFFIX: &str = ".disabled";
/// Prefix of the temporary names manual uploads are written to before they are checked.
pub const UPLOAD_PREFIX: &str = ".mcpi-upload-";

/// Whether `name` is a plugin jar, enabled (`.jar`) or disabled (`.jar.disabled`).
fn is_plugin_file(name: &str) -> bool {
    let name = name.to_ascii_lowercase();
    name.ends_with(".jar") || name.ends_with(".jar.disabled")
}

fn is_disabled(name: &str) -> bool {
    name.to_ascii_lowercase().ends_with(DISABLED_SUFFIX)
}

/// Files an interrupted version switch or upload left behind.
fn is_leftover(name: &str) -> bool {
    name.to_ascii_lowercase().ends_with(".jar.backup") || name.starts_with(UPLOAD_PREFIX)
}

/// Sorts enabled and disabled copies of a plugin next to each other.
fn sort_key(name: &str) -> String {
    let mut key = name.to_lowercase();
    if key.ends_with(DISABLED_SUFFIX) {
        key.truncate(key.len() - DISABLED_SUFFIX.len());
    }
    key
}

pub fn plugin_path(file_name: &str) -> compact_str::CompactString {
    compact_str::format_compact!("{PLUGINS_DIRECTORY}/{file_name}")
}

/// The hash Wings reported for `file_name`, whether it echoed the path as sent or normalized it.
pub fn find_fingerprint<'a>(
    fingerprints: impl IntoIterator<Item = (&'a compact_str::CompactString, &'a compact_str::CompactString)>,
    file_name: &str,
) -> Option<compact_str::CompactString> {
    let path = plugin_path(file_name);
    let mut fallback = None;
    for (key, hash) in fingerprints {
        if *key == path {
            return Some(hash.clone());
        }
        if fallback.is_none() && key.rsplit('/').next() == Some(file_name) {
            fallback = Some(hash.clone());
        }
    }
    fallback
}

mod get {
    use super::{find_fingerprint, plugin_path};
    use crate::{common::CACHE_PREFIX, wings::list_directory};
    use futures_util::StreamExt;
    use serde::Serialize;
    use shared::{
        ApiError, GetState,
        models::{server::GetServer, user::GetPermissionManager},
        response::{ApiResponse, ApiResponseResult},
    };
    use utoipa::ToSchema;

    const MAX_PAGES: u64 = 50;
    const FINGERPRINT_CHUNK: usize = 50;
    /// Wings fingerprint requests in flight at once.
    const FINGERPRINT_CONCURRENCY: usize = 3;
    /// Seconds a file's hash is cached for; the key includes its size and modification time.
    const HASH_CACHE_TTL: u64 = 24 * 60 * 60;
    /// Listings per user and minute.
    const LIMIT: u64 = 30;

    #[derive(Clone, Copy)]
    enum Hash {
        Sha1,
        Sha256,
        CurseForge,
    }

    impl Hash {
        const ALL: [Hash; 3] = [Hash::Sha1, Hash::Sha256, Hash::CurseForge];

        fn algorithm(self) -> wings_api::Algorithm {
            match self {
                Hash::Sha1 => wings_api::Algorithm::Sha1,
                Hash::Sha256 => wings_api::Algorithm::Sha256,
                Hash::CurseForge => wings_api::Algorithm::Curseforge,
            }
        }

        fn name(self) -> &'static str {
            match self {
                Hash::Sha1 => "sha1",
                Hash::Sha256 => "sha256",
                Hash::CurseForge => "curseforge",
            }
        }

        fn slot(self, file: &mut InstalledFile) -> &mut Option<compact_str::CompactString> {
            match self {
                Hash::Sha1 => &mut file.sha1,
                Hash::Sha256 => &mut file.sha256,
                Hash::CurseForge => &mut file.curseforge,
            }
        }
    }

    #[derive(ToSchema, Serialize)]
    struct InstalledFile {
        file_name: compact_str::CompactString,
        enabled: bool,
        size: u64,
        modified: chrono::DateTime<chrono::Utc>,
        /// Lowercase hex SHA-1.
        sha1: Option<compact_str::CompactString>,
        /// Lowercase hex SHA-256.
        sha256: Option<compact_str::CompactString>,
        /// CurseForge (murmur2) fingerprint as a decimal string.
        curseforge: Option<compact_str::CompactString>,
    }

    #[derive(ToSchema, Serialize)]
    struct Response {
        plugins: Vec<InstalledFile>,
        /// Backups and temporary uploads left behind by an interrupted switch or upload.
        leftovers: Vec<compact_str::CompactString>,
        /// Whether hashes were computed (needs `files.read-content`).
        hashed: bool,
    }

    fn cache_key(server: uuid::Uuid, hash: Hash, file: &InstalledFile) -> String {
        format!(
            "{CACHE_PREFIX}::hash::{server}::{}::{}::{}::{}",
            hash.name(),
            file.size,
            file.modified.timestamp_micros(),
            file.file_name
        )
    }

    #[utoipa::path(get, path = "/", responses(
        (status = OK, body = inline(Response)),
        (status = UNAUTHORIZED, body = ApiError),
        (status = TOO_MANY_REQUESTS, body = ApiError),
    ), params(
        (
            "server" = uuid::Uuid,
            description = "The server ID",
            example = "123e4567-e89b-12d3-a456-426614174000",
        ),
    ))]
    pub async fn route(
        state: GetState,
        permissions: GetPermissionManager,
        mut server: GetServer,
    ) -> ApiResponseResult {
        permissions.has_server_permission(super::super::READ_PERMISSION)?;
        super::super::ratelimit(&state, &permissions, "plugins", LIMIT).await?;

        let hashed = permissions
            .has_server_permission("files.read-content")
            .is_ok();

        if server.is_ignored(super::PLUGINS_DIRECTORY, true) {
            return ApiResponse::new_serialized(Response {
                plugins: Vec::new(),
                leftovers: Vec::new(),
                hashed,
            })
            .ok();
        }

        let client = server
            .node
            .fetch_cached(&state.database)
            .await?
            .api_client(&state.database)
            .await?;

        let entries = list_directory(
            &client,
            server.uuid,
            super::PLUGINS_DIRECTORY,
            server.0.subuser_ignored_files.clone(),
            MAX_PAGES,
        )
        .await?
        .unwrap_or_default();

        let mut plugins = Vec::new();
        let mut leftovers = Vec::new();
        for entry in entries {
            if !entry.file
                || entry.directory
                || server.is_ignored(plugin_path(&entry.name).as_str(), false)
            {
                continue;
            }
            if super::is_leftover(&entry.name) {
                leftovers.push(entry.name);
            } else if super::is_plugin_file(&entry.name) {
                plugins.push(InstalledFile {
                    enabled: !super::is_disabled(&entry.name),
                    file_name: entry.name,
                    size: entry.size,
                    modified: entry.modified.to_utc(),
                    sha1: None,
                    sha256: None,
                    curseforge: None,
                });
            }
        }
        plugins.sort_by_cached_key(|plugin| {
            (super::sort_key(&plugin.file_name), plugin.file_name.clone())
        });
        leftovers.sort_by_cached_key(|name| name.to_lowercase());

        if hashed {
            // Hashes Wings computed earlier for the same name, size and modification time.
            let mut missing: Vec<(Hash, Vec<usize>)> = Vec::new();
            for hash in Hash::ALL {
                let lookups = plugins.iter().map(|plugin| {
                    let key = cache_key(server.uuid, hash, plugin);
                    let cache = &state.cache;
                    async move { cache.get::<compact_str::CompactString>(&key).await }
                });
                let cached = futures_util::future::join_all(lookups).await;

                let mut uncached = Vec::new();
                for (index, value) in cached.into_iter().enumerate() {
                    match value {
                        Ok(Some(value)) => *hash.slot(&mut plugins[index]) = Some(value),
                        Ok(None) => uncached.push(index),
                        Err(err) => {
                            tracing::warn!("failed to read a cached plugin hash: {err:#}");
                            uncached.push(index);
                        }
                    }
                }
                for chunk in uncached.chunks(FINGERPRINT_CHUNK) {
                    missing.push((hash, chunk.to_vec()));
                }
            }

            let ignored = &server.0.subuser_ignored_files;
            let (client, server_uuid, plugins_ref) = (&client, server.uuid, &plugins);
            let results: Vec<_> = futures_util::stream::iter(missing)
                .map(|(hash, indices)| {
                    let query = wings_api::servers_server_files_fingerprints::get::Query {
                        algorithm: Some(hash.algorithm()),
                        files: Some(
                            indices
                                .iter()
                                .map(|index| plugin_path(&plugins_ref[*index].file_name))
                                .collect(),
                        ),
                        ignored: ignored.clone(),
                        ..Default::default()
                    };

                    async move {
                        let result = client
                            .get_servers_server_files_fingerprints(server_uuid, &query)
                            .await;
                        (hash, indices, result)
                    }
                })
                .buffer_unordered(FINGERPRINT_CONCURRENCY)
                .collect()
                .await;

            for (hash, indices, result) in results {
                let fingerprints = match result {
                    Ok(response) => response.fingerprints,
                    Err(err) => {
                        tracing::warn!(
                            server = %server.uuid,
                            algorithm = hash.name(),
                            "failed to fingerprint plugins: {err:?}"
                        );
                        continue;
                    }
                };

                for index in indices {
                    let plugin = &mut plugins[index];
                    let Some(value) = find_fingerprint(&fingerprints, &plugin.file_name) else {
                        continue;
                    };
                    let key = cache_key(server.uuid, hash, plugin);
                    if let Err(err) = state.cache.set(&key, HASH_CACHE_TTL, &value).await {
                        tracing::warn!("failed to cache a plugin hash: {err:#}");
                    }
                    *hash.slot(plugin) = Some(value);
                }
            }
        }

        ApiResponse::new_serialized(Response {
            plugins,
            leftovers,
            hashed,
        })
        .ok()
    }
}

pub fn router(state: &State) -> OpenApiRouter<State> {
    OpenApiRouter::new()
        .routes(routes!(get::route))
        .with_state(state.clone())
}

#[cfg(test)]
mod tests {
    use super::*;
    use compact_str::CompactString;

    #[test]
    fn plugin_files_are_jars_in_any_case() {
        for name in ["a.jar", "B.JAR", "c.jar.disabled", "D.Jar.DISABLED"] {
            assert!(is_plugin_file(name), "{name} should be listed");
        }
        for name in ["a.zip", "a.jar.backup", "config.yml", "a.disabled"] {
            assert!(!is_plugin_file(name), "{name} should not be listed");
        }
        assert!(is_disabled("D.Jar.DISABLED"));
        assert!(!is_disabled("a.jar"));
    }

    #[test]
    fn leftovers_are_backups_and_temporary_uploads() {
        assert!(is_leftover("WorldEdit.jar.backup"));
        assert!(is_leftover("WorldEdit.JAR.BACKUP"));
        assert!(is_leftover(".mcpi-upload-abcdef12.tmp"));
        assert!(!is_leftover("WorldEdit.jar"));
        assert!(!is_leftover("backup.jar"));
        assert!(!is_leftover(".mcpi-other"));
    }

    #[test]
    fn disabled_copies_sort_next_to_enabled_ones() {
        assert_eq!(sort_key("WorldEdit.jar.disabled"), "worldedit.jar");
        assert_eq!(sort_key("WorldEdit.jar"), "worldedit.jar");
    }

    #[test]
    fn fingerprints_are_found_by_path_or_file_name() {
        let hashes = [
            (CompactString::from("plugins/b.jar"), CompactString::from("2")),
            (CompactString::from("/plugins/a.jar"), CompactString::from("1")),
            (CompactString::from("plugins/a.jar"), CompactString::from("3")),
        ];
        let pairs = || hashes.iter().map(|(key, value)| (key, value));
        assert_eq!(find_fingerprint(pairs(), "a.jar").as_deref(), Some("3"));
        assert_eq!(find_fingerprint(pairs(), "b.jar").as_deref(), Some("2"));
        assert_eq!(find_fingerprint(pairs().take(2), "a.jar").as_deref(), Some("1"));
        assert_eq!(find_fingerprint(pairs(), "c.jar"), None);
    }
}
