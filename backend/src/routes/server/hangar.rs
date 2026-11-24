//! `/mcplugins/hangar/...`: Hangar lookups. Every route checks the permission first, then counts
//! against the user's rate limit.

use axum::http::StatusCode;
use shared::{State, models::user::PermissionManager, response::ApiResponse};
use utoipa_axum::{router::OpenApiRouter, routes};

/// Requests per user and minute for browsing Hangar.
const BROWSE_LIMIT: u64 = 120;

async fn guard(state: &State, permissions: &PermissionManager) -> Result<(), ApiResponse> {
    permissions.has_server_permission(super::READ_PERMISSION)?;
    super::ratelimit(state, permissions, "hangar", BROWSE_LIMIT).await
}

/// Rejects anything but a numeric id or a slug before it goes into a Hangar URL.
fn project_ref(project: &str) -> Result<&str, ApiResponse> {
    if crate::hangar::is_valid_project_ref(project) {
        Ok(project)
    } else {
        Err(ApiResponse::error("invalid Hangar project").with_status(StatusCode::NOT_FOUND))
    }
}

mod search {
    use crate::hangar::{SearchQuery, SortMode, model::HangarSummary, model::Platform};
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
        #[garde(range(min = 1, max = 10_000))]
        #[serde(default = "Pagination::default_page")]
        page: i64,
        #[garde(range(min = 1, max = 25))]
        #[serde(default = "default_per_page")]
        per_page: i64,
        #[garde(length(chars, max = 128))]
        query: Option<String>,
        #[garde(skip)]
        #[serde(default)]
        platform: Platform,
        #[garde(length(chars, max = 32))]
        game_version: Option<String>,
        #[garde(length(chars, max = 64))]
        category: Option<String>,
        #[garde(skip)]
        #[serde(default)]
        sort: SortMode,
        #[garde(skip)]
        #[serde(default)]
        folia: bool,
    }

    #[derive(ToSchema, Serialize)]
    struct Response {
        #[schema(inline)]
        plugins: Pagination<HangarSummary>,
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
    ), params(("server" = uuid::Uuid, description = "The server ID"), Params))]
    pub async fn route(
        state: GetState,
        permissions: GetPermissionManager,
        Query(params): Query<Params>,
    ) -> ApiResponseResult {
        super::guard(&state, &permissions).await?;

        if let Err(errors) = shared::utils::validate_data(&params) {
            return ApiResponse::new_serialized(ApiError::new_strings_value(errors))
                .with_status(StatusCode::BAD_REQUEST)
                .ok();
        }

        let plugins = crate::hangar::search(
            &state,
            SearchQuery {
                query: filled(params.query),
                platform: params.platform,
                game_version: filled(params.game_version),
                category: filled(params.category),
                sort: params.sort,
                folia: params.folia,
                page: params.page,
                per_page: params.per_page,
            },
        )
        .await?;

        ApiResponse::new_serialized(Response { plugins }).ok()
    }
}

mod project {
    use crate::hangar::model::HangarProject;
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
        project: HangarProject,
    }

    #[utoipa::path(get, path = "/", responses(
        (status = OK, body = inline(Response)),
        (status = UNAUTHORIZED, body = ApiError),
        (status = NOT_FOUND, body = ApiError),
        (status = TOO_MANY_REQUESTS, body = ApiError),
    ), params(
        ("server" = uuid::Uuid, description = "The server ID"),
        ("project" = String, description = "The Hangar project ID or slug", example = "ViaVersion"),
    ))]
    pub async fn route(
        state: GetState,
        permissions: GetPermissionManager,
        Path((_server, project)): Path<(String, String)>,
    ) -> ApiResponseResult {
        super::guard(&state, &permissions).await?;

        let project = crate::hangar::project(&state, super::project_ref(&project)?).await?;

        ApiResponse::new_serialized(Response { project }).ok()
    }
}

mod versions {
    use crate::hangar::model::HangarVersion;
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
        versions: Vec<HangarVersion>,
    }

    #[utoipa::path(get, path = "/", responses(
        (status = OK, body = inline(Response)),
        (status = UNAUTHORIZED, body = ApiError),
        (status = NOT_FOUND, body = ApiError),
        (status = TOO_MANY_REQUESTS, body = ApiError),
    ), params(
        ("server" = uuid::Uuid, description = "The server ID"),
        ("project" = String, description = "The Hangar project ID or slug", example = "ViaVersion"),
    ))]
    pub async fn route(
        state: GetState,
        permissions: GetPermissionManager,
        Path((_server, project)): Path<(String, String)>,
    ) -> ApiResponseResult {
        super::guard(&state, &permissions).await?;

        let versions = crate::hangar::versions(&state, super::project_ref(&project)?).await?;

        ApiResponse::new_serialized(Response { versions }).ok()
    }
}

pub fn router(state: &State) -> OpenApiRouter<State> {
    let leaf = |router: OpenApiRouter<State>| router.with_state(state.clone());

    OpenApiRouter::new()
        .nest(
            "/search",
            leaf(OpenApiRouter::new().routes(routes!(search::route))),
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
