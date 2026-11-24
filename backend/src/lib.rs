//! Modrinth is queried straight from the browser. CurseForge needs an API key and Hangar results
//! are checked and cached, so their lookups go through the routes here, which keep the key on the
//! server and only hand out downloads from each source's own CDN. The backend also lists the jars
//! in `plugins/` with hashes Wings computes in batches, and checks the hash of a newly installed
//! file against the one its source published. Installing, enabling, disabling and deleting
//! plugins use the panel's own file endpoints.

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

mod common;
mod curseforge;
mod hangar;
mod routes;
mod settings;
mod wings;

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
                router.nest("/mcplugins", routes::server::router(&state))
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
