//! `/api/client/servers/{server}/mcplugins/...`: plugin source lookups (CurseForge, Hangar), the
//! installed plugin list and the hash check run after every install.

use shared::{State, models::user::PermissionManager, response::ApiResponse};
use utoipa_axum::router::OpenApiRouter;

mod curseforge;
mod hangar;
mod plugins;
mod verify;

/// Browsing sources and listing plugins needs no more than seeing the file list.
const READ_PERMISSION: &str = "files.read";

/// Counts a request against the user's per-minute limit for `bucket`.
async fn ratelimit(
    state: &State,
    permissions: &PermissionManager,
    bucket: &str,
    hits: u64,
) -> Result<(), ApiResponse> {
    state
        .cache
        .ratelimit(
            format!("mcplugins/{bucket}"),
            hits,
            60,
            permissions.user_uuid().to_string(),
        )
        .await
}

pub fn router(state: &State) -> OpenApiRouter<State> {
    OpenApiRouter::new()
        .nest("/curseforge", curseforge::router(state))
        .nest("/hangar", hangar::router(state))
        .nest("/plugins", plugins::router(state))
        .nest("/verify", verify::router(state))
        .with_state(state.clone())
}
