use shared::extensions::settings::{
    ExtensionSettings, SettingsDeserializeExt, SettingsDeserializer, SettingsSerializeExt,
    SettingsSerializer,
};

#[derive(Clone, Default)]
pub struct ExtensionSettingsData {
    /// CurseForge Core API key, stored encrypted and never sent to clients.
    /// CurseForge is offered as a plugin source only while a key is set.
    pub curseforge_api_key: Option<String>,
}

#[async_trait::async_trait]
impl SettingsSerializeExt for ExtensionSettingsData {
    async fn serialize(
        &self,
        serializer: SettingsSerializer,
    ) -> Result<SettingsSerializer, anyhow::Error> {
        Ok(match self.curseforge_api_key.as_deref() {
            Some(key) => {
                serializer
                    .write_raw_encrypted_setting("curseforge_api_key", key)
                    .await?
            }
            None => serializer.write_raw_setting("curseforge_api_key", ""),
        })
    }
}

pub struct ExtensionSettingsDataDeserializer;

#[async_trait::async_trait]
impl SettingsDeserializeExt for ExtensionSettingsDataDeserializer {
    async fn deserialize_boxed(
        &self,
        deserializer: SettingsDeserializer<'_>,
    ) -> Result<ExtensionSettings, anyhow::Error> {
        let curseforge_api_key = match deserializer.read_raw_setting("curseforge_api_key") {
            Some(value) if !value.is_empty() => Some(
                deserializer
                    .database
                    .decrypt_base64(value)
                    .await?
                    .to_string(),
            ),
            _ => None,
        };

        Ok(Box::new(ExtensionSettingsData { curseforge_api_key }))
    }
}

/// The configured CurseForge API key, if any.
pub async fn curseforge_key(state: &shared::State) -> Result<Option<String>, anyhow::Error> {
    Ok(state
        .settings
        .get()
        .await?
        .find_extension_settings::<ExtensionSettingsData>()?
        .curseforge_api_key
        .clone())
}
