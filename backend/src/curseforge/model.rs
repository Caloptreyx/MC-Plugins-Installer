//! CurseForge Core API payloads and their mapping onto the plugin model the frontend shares
//! with Modrinth. Kept free of panel types so the mapping can be tested on its own.

use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

/// CurseForge's "Bukkit Plugins" class. Everything in it targets the Bukkit API, so it runs on
/// Bukkit and its forks (Spigot, Paper, Purpur) but not on proxies, Sponge or Folia.
pub const BUKKIT_PLUGINS_CLASS_ID: i64 = 5;
/// Only downloads served from CurseForge's own CDN are handed to the node.
const DOWNLOAD_HOSTS: &[&str] = &["edge.forgecdn.net", "mediafilez.forgecdn.net"];

#[derive(Deserialize)]
pub struct Envelope<T> {
    pub data: T,
}

#[derive(Deserialize)]
pub struct Paged<T> {
    pub data: Vec<T>,
    pub pagination: CfPagination,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CfPagination {
    #[serde(default)]
    pub total_count: i64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Mod {
    pub id: i64,
    pub name: String,
    #[serde(default)]
    pub slug: String,
    #[serde(default)]
    pub summary: String,
    #[serde(default)]
    pub links: Links,
    #[serde(default)]
    pub download_count: f64,
    #[serde(default)]
    pub thumbs_up_count: i64,
    pub class_id: Option<i64>,
    #[serde(default)]
    pub categories: Vec<CfCategory>,
    #[serde(default)]
    pub authors: Vec<Author>,
    pub logo: Option<Asset>,
    pub date_modified: Option<String>,
    #[serde(default)]
    pub latest_files_indexes: Vec<FileIndex>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileIndex {
    pub game_version: String,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Links {
    pub website_url: Option<String>,
    pub wiki_url: Option<String>,
    pub issues_url: Option<String>,
    pub source_url: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CfCategory {
    pub id: i64,
    pub name: String,
    #[serde(default)]
    pub is_class: Option<bool>,
}

#[derive(Deserialize)]
pub struct Author {
    pub name: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Asset {
    pub thumbnail_url: Option<String>,
    pub url: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct File {
    pub id: i64,
    pub mod_id: i64,
    #[serde(default)]
    pub display_name: String,
    #[serde(default)]
    pub file_name: String,
    pub release_type: i64,
    pub file_date: String,
    #[serde(default)]
    pub file_length: i64,
    #[serde(default)]
    pub download_count: f64,
    pub download_url: Option<String>,
    #[serde(default)]
    pub game_versions: Vec<String>,
    #[serde(default)]
    pub is_server_pack: Option<bool>,
    #[serde(default)]
    pub file_fingerprint: Option<u64>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FingerprintMatches {
    #[serde(default)]
    pub exact_matches: Vec<FingerprintMatch>,
}

#[derive(Deserialize)]
pub struct FingerprintMatch {
    pub file: File,
}

#[derive(ToSchema, Serialize, Deserialize, Clone)]
pub struct PluginSummary {
    pub id: String,
    pub slug: String,
    pub title: String,
    pub description: String,
    pub author: String,
    pub icon_url: Option<String>,
    pub downloads: i64,
    pub follows: i64,
    pub categories: Vec<String>,
    pub updated: Option<String>,
    pub url: String,
    /// Minecraft releases the latest files support, newest first.
    pub game_versions: Vec<String>,
}

#[derive(ToSchema, Serialize, Deserialize, Clone)]
pub struct ProjectLink {
    pub label: String,
    pub url: String,
}

#[derive(ToSchema, Serialize, Deserialize, Clone)]
pub struct PluginProject {
    #[schema(inline)]
    pub summary: PluginSummary,
    /// HTML description.
    pub body: String,
    #[schema(inline)]
    pub links: Vec<ProjectLink>,
}

#[derive(ToSchema, Serialize, Deserialize, Clone)]
pub struct VersionFile {
    /// `None` when the author does not allow third-party downloads of this file.
    pub url: Option<String>,
    pub filename: String,
    pub size: i64,
}

#[derive(ToSchema, Serialize, Deserialize, Clone)]
pub struct PluginVersion {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub version_number: String,
    /// `release`, `beta` or `alpha`.
    pub channel: String,
    pub loaders: Vec<String>,
    pub game_versions: Vec<String>,
    pub downloads: i64,
    pub published: String,
    #[schema(inline)]
    pub file: VersionFile,
}

#[derive(ToSchema, Serialize, Deserialize, Clone)]
pub struct Category {
    pub id: String,
    pub name: String,
}

/// Release-style Minecraft versions (`1.21.4`, `26.3`); CurseForge also lists labels such as
/// `Bukkit` or `CB 1.7.9-R0.2` in the same field.
fn is_release_version(value: &str) -> bool {
    let parts: Vec<&str> = value.split('.').collect();
    (2..=3).contains(&parts.len())
        && parts
            .iter()
            .all(|part| !part.is_empty() && part.bytes().all(|b| b.is_ascii_digit()))
}

/// Release versions from `versions`, deduplicated and newest first (`1.21.10` > `1.21.4`).
fn newest_first(versions: impl IntoIterator<Item = String>) -> Vec<String> {
    let mut versions: Vec<String> = versions
        .into_iter()
        .filter(|version| is_release_version(version))
        .collect();
    let key = |version: &String| -> Vec<u32> {
        version
            .split('.')
            .map(|part| part.parse().unwrap_or(0))
            .collect()
    };
    versions.sort_by_key(|version| std::cmp::Reverse(key(version)));
    versions.dedup();
    versions
}

fn non_empty(value: Option<String>) -> Option<String> {
    value.filter(|value| !value.trim().is_empty())
}

fn is_https_url_on(url: &str, hosts: &[&str]) -> bool {
    url::Url::parse(url).is_ok_and(|url| {
        url.scheme() == "https" && url.host_str().is_some_and(|host| hosts.contains(&host))
    })
}

pub fn summarize(project: Mod) -> PluginSummary {
    let url = non_empty(project.links.website_url).unwrap_or_else(|| {
        format!(
            "https://www.curseforge.com/minecraft/bukkit-plugins/{}",
            project.slug
        )
    });

    PluginSummary {
        id: project.id.to_string(),
        slug: project.slug,
        title: project.name,
        description: project.summary,
        author: project
            .authors
            .into_iter()
            .next()
            .map(|author| author.name)
            .unwrap_or_default(),
        icon_url: project
            .logo
            .and_then(|logo| non_empty(logo.thumbnail_url).or(non_empty(logo.url))),
        downloads: project.download_count as i64,
        follows: project.thumbs_up_count,
        categories: project
            .categories
            .into_iter()
            .filter(|category| category.is_class != Some(true))
            .map(|category| category.name)
            .collect(),
        updated: project.date_modified,
        url,
        game_versions: newest_first(
            project
                .latest_files_indexes
                .into_iter()
                .map(|index| index.game_version),
        ),
    }
}

pub fn project_details(project: Mod, body: String) -> PluginProject {
    let links = [
        ("Source", project.links.source_url.clone()),
        ("Issues", project.links.issues_url.clone()),
        ("Wiki", project.links.wiki_url.clone()),
    ]
    .into_iter()
    .filter_map(|(label, url)| {
        Some(ProjectLink {
            label: label.to_string(),
            url: non_empty(url)?,
        })
    })
    .collect();

    PluginProject {
        summary: summarize(project),
        body,
        links,
    }
}

pub fn map_file(file: File) -> PluginVersion {
    let version_number = file
        .file_name
        .strip_suffix(".jar")
        .unwrap_or(&file.file_name)
        .to_string();

    PluginVersion {
        id: file.id.to_string(),
        project_id: file.mod_id.to_string(),
        name: if file.display_name.is_empty() {
            version_number.clone()
        } else {
            file.display_name
        },
        version_number,
        channel: match file.release_type {
            2 => "beta",
            3 => "alpha",
            _ => "release",
        }
        .to_string(),
        loaders: vec!["bukkit".to_string()],
        game_versions: newest_first(file.game_versions),
        downloads: file.download_count as i64,
        published: file.file_date,
        file: VersionFile {
            url: file
                .download_url
                .filter(|url| is_https_url_on(url, DOWNLOAD_HOSTS)),
            filename: file.file_name.replace(['/', '\\'], "_"),
            size: file.file_length,
        },
    }
}

/// Plugin categories, without the class entry CurseForge lists among them.
pub fn map_categories(categories: Vec<CfCategory>) -> Vec<Category> {
    let mut categories: Vec<Category> = categories
        .into_iter()
        .filter(|category| category.is_class != Some(true))
        .map(|category| Category {
            id: category.id.to_string(),
            name: category.name,
        })
        .collect();
    categories.sort_by(|a, b| a.name.cmp(&b.name));
    categories
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn files_keep_release_game_versions_and_only_cdn_downloads() {
        let file: File = serde_json::from_value(serde_json::json!({
            "id": 5_000_001,
            "modId": 31043,
            "displayName": "WorldEdit 7.4.6 Beta 2 (Bukkit for 1.21.4-26.3)",
            "fileName": "worldedit-bukkit-7.4.6-beta-02.jar",
            "releaseType": 2,
            "fileDate": "2026-09-20T10:00:00Z",
            "fileLength": 1234,
            "downloadCount": 42.0,
            "downloadUrl": "https://edge.forgecdn.net/files/5000/1/worldedit-bukkit-7.4.6-beta-02.jar",
            "gameVersions": ["1.21.4", "26.3", "Bukkit", "CB 1.7.9-R0.2", "1.21-Snapshot"],
            "fileFingerprint": 3_000_000_000u64
        }))
        .unwrap();

        let version = map_file(file);
        assert_eq!(version.game_versions, ["26.3", "1.21.4"]);
        assert_eq!(version.channel, "beta");
        assert_eq!(version.version_number, "worldedit-bukkit-7.4.6-beta-02");
        assert_eq!(version.project_id, "31043");
        assert!(version.file.url.is_some());

        let foreign: File = serde_json::from_value(serde_json::json!({
            "id": 1, "modId": 2, "fileName": "a.jar", "releaseType": 1,
            "fileDate": "2026-01-01T00:00:00Z", "downloadUrl": "https://example.com/a.jar"
        }))
        .unwrap();
        assert!(map_file(foreign).file.url.is_none());
    }

    #[test]
    fn summaries_drop_the_class_category_and_prefer_thumbnails() {
        let project: Mod = serde_json::from_value(serde_json::json!({
            "id": 31043,
            "name": "WorldEdit",
            "slug": "worldedit",
            "summary": "In-game map editor",
            "downloadCount": 1.5e6,
            "thumbsUpCount": 10,
            "classId": 5,
            "categories": [
                {"id": 5, "name": "Bukkit Plugins", "isClass": true},
                {"id": 124, "name": "World Editing and Management"}
            ],
            "authors": [{"name": "sk89q"}],
            "logo": {"thumbnailUrl": "https://media.forgecdn.net/thumb.png", "url": "https://media.forgecdn.net/full.png"},
            "latestFilesIndexes": [
                {"gameVersion": "1.21.4"}, {"gameVersion": "1.21.10"}, {"gameVersion": "1.21.4"}, {"gameVersion": "Bukkit"}
            ]
        }))
        .unwrap();

        let summary = summarize(project);
        assert_eq!(summary.categories, ["World Editing and Management"]);
        assert_eq!(
            summary.icon_url.as_deref(),
            Some("https://media.forgecdn.net/thumb.png")
        );
        assert_eq!(
            summary.url,
            "https://www.curseforge.com/minecraft/bukkit-plugins/worldedit"
        );
        assert_eq!(summary.downloads, 1_500_000);
        assert_eq!(summary.game_versions, ["1.21.10", "1.21.4"]);
    }
}
