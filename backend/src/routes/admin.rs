//! `/api/admin/extensions/dev.caloptreyx.mcplugins/...`: settings and CurseForge key checks.

use shared::State;
use utoipa_axum::{router::OpenApiRouter, routes};

/// Settings as shown to administrators; the CurseForge API key is write-only.
#[derive(utoipa::ToSchema, serde::Serialize)]
pub struct AdminSettings {
    curseforge_configured: bool,
}

impl From<&crate::settings::ExtensionSettingsData> for AdminSettings {
    fn from(settings: &crate::settings::ExtensionSettingsData) -> Self {
        Self {
            curseforge_configured: settings.curseforge_api_key.is_some(),
        }
    }
}

mod get_settings {
    use super::AdminSettings;
    use crate::settings::ExtensionSettingsData;
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
        settings: AdminSettings,
    }

    #[utoipa::path(get, path = "/", responses(
        (status = OK, body = inline(Response)),
        (status = UNAUTHORIZED, body = ApiError),
    ))]
    pub async fn route(state: GetState, permissions: GetPermissionManager) -> ApiResponseResult {
        permissions.has_admin_permission("mcplugins.read")?;

        let settings = state.settings.get().await?;
        let settings =
            AdminSettings::from(settings.find_extension_settings::<ExtensionSettingsData>()?);

        ApiResponse::new_serialized(Response { settings }).ok()
    }
}

mod put_settings {
    use super::AdminSettings;
    use crate::settings::ExtensionSettingsData;
    use axum::http::StatusCode;
    use garde::Validate;
    use serde::{Deserialize, Serialize};
    use shared::{
        ApiError, GetState,
        models::{admin_activity::GetAdminActivityLogger, user::GetPermissionManager},
        response::{ApiResponse, ApiResponseResult},
    };
    use utoipa::ToSchema;

    #[derive(ToSchema, Validate, Deserialize)]
    pub struct Payload {
        /// The new key; an empty string removes the stored key.
        #[garde(length(chars, max = 255))]
        #[schema(max_length = 255)]
        curseforge_api_key: String,
    }

    #[derive(ToSchema, Serialize)]
    struct Response {
        #[schema(inline)]
        settings: AdminSettings,
    }

    #[utoipa::path(put, path = "/", responses(
        (status = OK, body = inline(Response)),
        (status = BAD_REQUEST, body = ApiError),
        (status = UNAUTHORIZED, body = ApiError),
    ), request_body = inline(Payload))]
    pub async fn route(
        state: GetState,
        permissions: GetPermissionManager,
        activity_logger: GetAdminActivityLogger,
        shared::Payload(data): shared::Payload<Payload>,
    ) -> ApiResponseResult {
        if let Err(errors) = shared::utils::validate_data(&data) {
            return ApiResponse::new_serialized(ApiError::new_strings_value(errors))
                .with_status(StatusCode::BAD_REQUEST)
                .ok();
        }

        permissions.has_admin_permission("mcplugins.manage")?;

        // a pasted key with a trailing newline is not a valid header value
        let key = data.curseforge_api_key.trim();

        let mut settings = state.settings.get_mut().await?;
        let extension = settings.find_mut_extension_settings::<ExtensionSettingsData>()?;
        extension.curseforge_api_key = (!key.is_empty()).then(|| key.to_string());
        let response = AdminSettings::from(&*extension);
        settings.save().await?;

        activity_logger
            .log(
                "mcplugins:settings.update",
                serde_json::json!({ "curseforge_configured": response.curseforge_configured }),
            )
            .await;

        ApiResponse::new_serialized(Response { settings: response }).ok()
    }
}

mod verify {
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
        /// The key to check; omit it to check the stored key.
        #[garde(length(chars, max = 255))]
        #[schema(max_length = 255)]
        api_key: Option<String>,
    }

    #[derive(ToSchema, Serialize)]
    struct Response {}

    #[utoipa::path(post, path = "/", responses(
        (status = OK, body = inline(Response)),
        (status = BAD_REQUEST, body = ApiError),
        (status = UNAUTHORIZED, body = ApiError),
        (status = BAD_GATEWAY, body = ApiError),
    ), request_body = inline(Payload))]
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

        permissions.has_admin_permission("mcplugins.manage")?;

        let key = match data
            .api_key
            .map(|key| key.trim().to_string())
            .filter(|key| !key.is_empty())
        {
            Some(key) => key,
            None => match crate::settings::curseforge_key(&state).await? {
                Some(key) => key,
                None => {
                    return ApiResponse::error("no CurseForge API key is configured")
                        .with_status(StatusCode::BAD_REQUEST)
                        .ok();
                }
            },
        };

        crate::curseforge::verify_key(&key).await?;

        ApiResponse::new_serialized(Response {}).ok()
    }
}

pub fn router(state: &State) -> OpenApiRouter<State> {
    OpenApiRouter::new()
        .nest(
            "/settings",
            OpenApiRouter::new()
                .routes(routes!(get_settings::route))
                .routes(routes!(put_settings::route))
                .with_state(state.clone()),
        )
        .nest(
            "/curseforge/verify",
            OpenApiRouter::new()
                .routes(routes!(verify::route))
                .with_state(state.clone()),
        )
        .with_state(state.clone())
}
