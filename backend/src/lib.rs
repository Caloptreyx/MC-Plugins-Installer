//! Modrinth is queried straight from the browser. CurseForge needs an API key, so its lookups go
//! through the routes here, which keep the key on the server. Installing, enabling, disabling and
//! deleting plugins use the panel's own file endpoints.

use indexmap::IndexMap;
use shared::{
    State,
    extensions::{
        Extension, ExtensionPermissionsBuilder, ExtensionRouteBuilder,
        settings::ExtensionSettingsDeserializer,
    },
    permissions::PermissionGroup,
};
use std::sync::Arc;

mod curseforge;
mod routes;
mod settings;

#[derive(Default)]
pub struct ExtensionStruct;

#[async_trait::async_trait]
impl Extension for ExtensionStruct {
    async fn initialize_router(
        &mut self,
        state: State,
        builder: ExtensionRouteBuilder,
    ) -> ExtensionRouteBuilder {
        builder
            .add_admin_api_router(|router| {
                router.nest(
                    "/extensions/dev.caloptreyx.mcplugins",
                    routes::admin::router(&state),
                )
            })
            .add_client_server_api_router(|router| {
                router.nest("/mcplugins/curseforge", routes::server::router(&state))
            })
    }

    async fn initialize_permissions(
        &mut self,
        _state: State,
        mut builder: ExtensionPermissionsBuilder,
    ) -> ExtensionPermissionsBuilder {
        builder.admin_permissions.insert(
            "mcplugins",
            PermissionGroup {
                description: "Permissions that control the ability to configure the plugin installer extension.",
                permissions: IndexMap::from([
                    ("read", "Allows viewing the plugin installer settings."),
                    (
                        "manage",
                        "Allows changing the plugin installer settings, including the CurseForge API key.",
                    ),
                ]),
            },
        );

        builder
    }

    async fn settings_deserializer(&self, _state: State) -> ExtensionSettingsDeserializer {
        Arc::new(settings::ExtensionSettingsDataDeserializer)
    }
}
