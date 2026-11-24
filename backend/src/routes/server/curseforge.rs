//! `/mcplugins/curseforge/...`: CurseForge lookups. Every route checks the permission first,
//! then counts against the user's rate limit.

use shared::{State, models::user::PermissionManager, response::ApiResponse};
use utoipa_axum::{router::OpenApiRouter, routes};

/// Requests per user and minute for browsing CurseForge.
const BROWSE_LIMIT: u64 = 120;
/// Requests per user and minute for identifying jars; each one can name 500 fingerprints.
const FINGERPRINT_LIMIT: u64 = 10;

/// Checks the permission and the rate limit; no CurseForge key is needed yet.
async fn guard(
    state: &State,
    permissions: &PermissionManager,
    bucket: &str,
    hits: u64,
) -> Result<(), ApiResponse> {
    permissions.has_server_permission(super::READ_PERMISSION)?;
    super::ratelimit(state, permissions, bucket, hits).await
}

/// The CurseForge key, failing when CurseForge is not configured.
async fn api_key(state: &State) -> Result<String, ApiResponse> {
    crate::settings::curseforge_key(state)
        .await?
        .ok_or_else(|| {
            ApiResponse::error("CurseForge is not configured on this panel")
                .with_status(axum::http::StatusCode::SERVICE_UNAVAILABLE)
        })
}

mod status {
    use serde::Serialize;
    use shared::{
        ApiError, GetState,
        models::user::GetPermissionManager,
        response::{ApiResponse, ApiResponseResult},
    };
    use utoipa::ToSchema;

    #[derive(ToSchema, Serialize)]
    struct Response {
        /// Whether CurseForge can be used as a plugin source.
        curseforge: bool,
    }

    #[utoipa::path(get, path = "/", responses(
        (status = OK, body = inline(Response)),
        (status = UNAUTHORIZED, body = ApiError),
        (status = TOO_MANY_REQUESTS, body = ApiError),
    ), params(("server" = uuid::Uuid, description = "The server ID")))]
    pub async fn route(state: GetState, permissions: GetPermissionManager) -> ApiResponseResult {
        super::guard(&state, &permissions, "curseforge", super::BROWSE_LIMIT).await?;

        ApiResponse::new_serialized(Response {
            curseforge: crate::settings::curseforge_key(&state).await?.is_some(),
        })
        .ok()
    }
}

mod search {
    use crate::curseforge::{SearchQuery, SortMode, model::PluginSummary};
    use axum::{extract::Query, http::StatusCode};
    use garde::Validate;
    use serde::{Deserialize, Serialize};
    use shared::{
        ApiError, GetState,
        models::{Pagination, user::GetPermissionManager},
        response::{ApiResponse, ApiResponseResult},
    };
    use utoipa::{IntoParams, ToSchema};

    fn default_per_page() -> i64 {
        18
    }

    #[derive(ToSchema, IntoParams, Validate, Deserialize)]
    #[into_params(parameter_in = Query)]
    pub struct Params {
        #[garde(range(min = 1))]
        #[serde(default = "Pagination::default_page")]
        page: i64,
        #[garde(range(min = 1, max = 50))]
        #[serde(default = "default_per_page")]
        per_page: i64,
        #[garde(length(chars, max = 128))]
        query: Option<String>,
        #[garde(length(chars, max = 32))]
        game_version: Option<String>,
        #[garde(length(chars, max = 32))]
        category: Option<String>,
        #[garde(skip)]
        #[serde(default)]
        sort: SortMode,
    }

    #[derive(ToSchema, Serialize)]
    struct Response {
        #[schema(inline)]
        plugins: Pagination<PluginSummary>,
    }

    fn filled(value: Option<String>) -> Option<String> {
        value
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
    }

    #[utoipa::path(get, path = "/", responses(
        (status = OK, body = inline(Response)),
        (status = BAD_REQUEST, body = ApiError),
        (status = UNAUTHORIZED, body = ApiError),
        (status = TOO_MANY_REQUESTS, body = ApiError),
        (status = SERVICE_UNAVAILABLE, body = ApiError),
    ), params(("server" = uuid::Uuid, description = "The server ID"), Params))]
    pub async fn route(
        state: GetState,
        permissions: GetPermissionManager,
        Query(params): Query<Params>,
    ) -> ApiResponseResult {
        super::guard(&state, &permissions, "curseforge", super::BROWSE_LIMIT).await?;

        if let Err(errors) = shared::utils::validate_data(&params) {
            return ApiResponse::new_serialized(ApiError::new_strings_value(errors))
                .with_status(StatusCode::BAD_REQUEST)
                .ok();
        }

        let key = super::api_key(&state).await?;
        let category = filled(params.category)
            .map(|category| crate::curseforge::parse_id(&category))
            .transpose()?;

        let plugins = crate::curseforge::search(
            &state,
            &key,
            SearchQuery {
                query: filled(params.query),
                game_version: filled(params.game_version),
                category,
                sort: params.sort,
                page: params.page,
                per_page: params.per_page,
            },
        )
        .await?;

        ApiResponse::new_serialized(Response { plugins }).ok()
    }
}

mod categories {
    use crate::curseforge::model::Category;
    use serde::Serialize;
    use shared::{
        ApiError, GetState,
        models::user::GetPermissionManager,
        response::{ApiResponse, ApiResponseResult},
    };
    use utoipa::ToSchema;

    #[derive(ToSchema, Serialize)]
    struct Response {
        #[schema(inline)]
        categories: Vec<Category>,
    }

    #[utoipa::path(get, path = "/", responses(
        (status = OK, body = inline(Response)),
        (status = UNAUTHORIZED, body = ApiError),
        (status = TOO_MANY_REQUESTS, body = ApiError),
        (status = SERVICE_UNAVAILABLE, body = ApiError),
    ), params(("server" = uuid::Uuid, description = "The server ID")))]
    pub async fn route(state: GetState, permissions: GetPermissionManager) -> ApiResponseResult {
        super::guard(&state, &permissions, "curseforge", super::BROWSE_LIMIT).await?;

        let key = super::api_key(&state).await?;
        let categories = crate::curseforge::categories(&state, &key).await?;

        ApiResponse::new_serialized(Response { categories }).ok()
    }
}

mod project {
    use crate::curseforge::model::PluginProject;
    use axum::extract::Path;
    use serde::Serialize;
    use shared::{
        ApiError, GetState,
        models::user::GetPermissionManager,
        response::{ApiResponse, ApiResponseResult},
    };
    use utoipa::ToSchema;

    #[derive(ToSchema, Serialize)]
    struct Response {
        #[schema(inline)]
        project: PluginProject,
    }

    #[utoipa::path(get, path = "/", responses(
        (status = OK, body = inline(Response)),
        (status = UNAUTHORIZED, body = ApiError),
        (status = NOT_FOUND, body = ApiError),
        (status = TOO_MANY_REQUESTS, body = ApiError),
        (status = SERVICE_UNAVAILABLE, body = ApiError),
    ), params(
        ("server" = uuid::Uuid, description = "The server ID"),
        ("project" = String, description = "The CurseForge project ID", example = "31043"),
    ))]
    pub async fn route(
        state: GetState,
        permissions: GetPermissionManager,
        Path((_server, project)): Path<(String, String)>,
    ) -> ApiResponseResult {
        super::guard(&state, &permissions, "curseforge", super::BROWSE_LIMIT).await?;

        let id = crate::curseforge::parse_id(&project)?;
        let key = super::api_key(&state).await?;
        let project = crate::curseforge::project(&state, &key, id).await?;

        ApiResponse::new_serialized(Response { project }).ok()
    }
}

mod versions {
    use crate::curseforge::model::PluginVersion;
    use axum::extract::Path;
    use serde::Serialize;
    use shared::{
        ApiError, GetState,
        models::user::GetPermissionManager,
        response::{ApiResponse, ApiResponseResult},
    };
    use utoipa::ToSchema;

    #[derive(ToSchema, Serialize)]
    struct Response {
        #[schema(inline)]
        versions: Vec<PluginVersion>,
    }

    #[utoipa::path(get, path = "/", responses(
        (status = OK, body = inline(Response)),
        (status = UNAUTHORIZED, body = ApiError),
        (status = NOT_FOUND, body = ApiError),
        (status = TOO_MANY_REQUESTS, body = ApiError),
        (status = SERVICE_UNAVAILABLE, body = ApiError),
    ), params(
        ("server" = uuid::Uuid, description = "The server ID"),
        ("project" = String, description = "The CurseForge project ID", example = "31043"),
    ))]
    pub async fn route(
        state: GetState,
        permissions: GetPermissionManager,
        Path((_server, project)): Path<(String, String)>,
    ) -> ApiResponseResult {
        super::guard(&state, &permissions, "curseforge", super::BROWSE_LIMIT).await?;

        let id = crate::curseforge::parse_id(&project)?;
        let key = super::api_key(&state).await?;
        let versions = crate::curseforge::versions(&state, &key, id).await?;

        ApiResponse::new_serialized(Response { versions }).ok()
    }
}

mod fingerprints {
    use crate::curseforge::FingerprintMatch;
    use axum::http::StatusCode;
    use garde::Validate;
    use serde::{Deserialize, Serialize};
    use shared::{
        ApiError, GetState,
        models::user::GetPermissionManager,
        response::{ApiResponse, ApiResponseResult},
    };
    use utoipa::ToSchema;

    #[derive(ToSchema, Validate, Deserialize)]
    pub struct Payload {
        /// CurseForge (murmur2) fingerprints of plugin jars.
        #[garde(length(max = 500))]
        #[schema(max_items = 500)]
        fingerprints: Vec<u64>,
    }

    #[derive(ToSchema, Serialize)]
    struct Response {
        #[schema(inline)]
        matches: Vec<FingerprintMatch>,
    }

    #[utoipa::path(post, path = "/", responses(
        (status = OK, body = inline(Response)),
        (status = BAD_REQUEST, body = ApiError),
        (status = UNAUTHORIZED, body = ApiError),
        (status = TOO_MANY_REQUESTS, body = ApiError),
        (status = SERVICE_UNAVAILABLE, body = ApiError),
    ), params(("server" = uuid::Uuid, description = "The server ID")), request_body = inline(Payload))]
    pub async fn route(
        state: GetState,
        permissions: GetPermissionManager,
        shared::Payload(data): shared::Payload<Payload>,
    ) -> ApiResponseResult {
        super::guard(
            &state,
            &permissions,
            "curseforge/fingerprints",
            super::FINGERPRINT_LIMIT,
        )
        .await?;

        if let Err(errors) = shared::utils::validate_data(&data) {
            return ApiResponse::new_serialized(ApiError::new_strings_value(errors))
                .with_status(StatusCode::BAD_REQUEST)
                .ok();
        }

        let key = super::api_key(&state).await?;
        let matches =
            crate::curseforge::match_fingerprints(&state, &key, &data.fingerprints).await?;

        ApiResponse::new_serialized(Response { matches }).ok()
    }
}

pub fn router(state: &State) -> OpenApiRouter<State> {
    let leaf = |router: OpenApiRouter<State>| router.with_state(state.clone());

    OpenApiRouter::new()
        .nest(
            "/status",
            leaf(OpenApiRouter::new().routes(routes!(status::route))),
        )
        .nest(
            "/search",
            leaf(OpenApiRouter::new().routes(routes!(search::route))),
        )
        .nest(
            "/categories",
            leaf(OpenApiRouter::new().routes(routes!(categories::route))),
        )
        .nest(
            "/fingerprints",
            leaf(OpenApiRouter::new().routes(routes!(fingerprints::route))),
        )
        .nest(
            "/projects/{project}",
            leaf(OpenApiRouter::new().routes(routes!(project::route)).nest(
                "/versions",
                leaf(OpenApiRouter::new().routes(routes!(versions::route))),
            )),
        )
        .with_state(state.clone())
}
