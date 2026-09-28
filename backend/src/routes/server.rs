//! `/api/client/servers/{server}/mcplugins/curseforge/...`: CurseForge lookups for the plugin
//! pages. They are gated on the same permission as the pages themselves.

use shared::{State, models::user::PermissionManager, response::ApiResponse};
use utoipa_axum::{router::OpenApiRouter, routes};

const PERMISSION: &str = "files.read-content";

/// Checks access and returns the CurseForge key, failing when CurseForge is not configured.
async fn authorize(state: &State, permissions: &PermissionManager) -> Result<String, ApiResponse> {
    permissions.has_server_permission(PERMISSION)?;
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
    ), params(("server" = uuid::Uuid, description = "The server ID")))]
    pub async fn route(state: GetState, permissions: GetPermissionManager) -> ApiResponseResult {
        permissions.has_server_permission(super::PERMISSION)?;

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
        (status = SERVICE_UNAVAILABLE, body = ApiError),
    ), params(("server" = uuid::Uuid, description = "The server ID"), Params))]
    pub async fn route(
        state: GetState,
        permissions: GetPermissionManager,
        Query(params): Query<Params>,
    ) -> ApiResponseResult {
        if let Err(errors) = shared::utils::validate_data(&params) {
            return ApiResponse::new_serialized(ApiError::new_strings_value(errors))
                .with_status(StatusCode::BAD_REQUEST)
                .ok();
        }

        let key = super::authorize(&state, &permissions).await?;
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
        (status = SERVICE_UNAVAILABLE, body = ApiError),
    ), params(("server" = uuid::Uuid, description = "The server ID")))]
    pub async fn route(state: GetState, permissions: GetPermissionManager) -> ApiResponseResult {
        let key = super::authorize(&state, &permissions).await?;
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
        let key = super::authorize(&state, &permissions).await?;
        let id = crate::curseforge::parse_id(&project)?;
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
        let key = super::authorize(&state, &permissions).await?;
        let id = crate::curseforge::parse_id(&project)?;
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
        #[garde(length(max = 1000))]
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
        (status = SERVICE_UNAVAILABLE, body = ApiError),
    ), params(("server" = uuid::Uuid, description = "The server ID")), request_body = inline(Payload))]
    pub async fn route(
        state: GetState,
        permissions: GetPermissionManager,
        shared::Payload(data): shared::Payload<Payload>,
    ) -> ApiResponseResult {
        if let Err(errors) = shared::utils::validate_data(&data) {
            return ApiResponse::new_serialized(ApiError::new_strings_value(errors))
                .with_status(StatusCode::BAD_REQUEST)
                .ok();
        }

        let key = super::authorize(&state, &permissions).await?;
        let matches = crate::curseforge::match_fingerprints(&key, &data.fingerprints).await?;

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
