//! Hangar API payloads and their mapping onto the plugin model the frontend shares with Modrinth
//! and CurseForge. Kept free of panel types so the mapping can be tested on its own.

use crate::common::{http_link, is_https_url_on, is_valid_jar_name, newest_first, non_empty};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use utoipa::ToSchema;

/// Only downloads served from Hangar's own CDN are handed to the node.
const DOWNLOAD_HOSTS: &[&str] = &["hangarcdn.papermc.io"];
/// Project tag of plugins that run on Folia.
pub const FOLIA_TAG: &str = "SUPPORTS_FOLIA";
const WEBSITE: &str = "https://hangar.papermc.io";

/// The platforms Hangar publishes for, in the order files are listed.
#[derive(ToSchema, Deserialize, Clone, Copy, Default, PartialEq, Eq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum Platform {
    #[default]
    Paper,
    Velocity,
    Waterfall,
}

impl Platform {
    const ALL: [Platform; 3] = [Platform::Paper, Platform::Velocity, Platform::Waterfall];

    /// The name Hangar uses in query parameters and map keys.
    pub fn api_name(self) -> &'static str {
        match self {
            Platform::Paper => "PAPER",
            Platform::Velocity => "VELOCITY",
            Platform::Waterfall => "WATERFALL",
        }
    }

    pub fn loader(self) -> &'static str {
        match self {
            Platform::Paper => "paper",
            Platform::Velocity => "velocity",
            Platform::Waterfall => "waterfall",
        }
    }
}

#[derive(Deserialize)]
pub struct Paged<T> {
    #[serde(default)]
    pub pagination: HangarPagination,
    #[serde(default = "Vec::new")]
    pub result: Vec<T>,
}

#[derive(Deserialize, Default)]
pub struct HangarPagination {
    #[serde(default)]
    pub count: i64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: i64,
    pub name: String,
    pub namespace: Namespace,
    #[serde(default)]
    pub stats: ProjectStats,
    pub category: Option<String>,
    #[serde(default)]
    pub description: String,
    pub last_updated: Option<String>,
    #[serde(default)]
    pub settings: Settings,
    #[serde(default)]
    pub supported_platforms: HashMap<String, Vec<String>>,
    pub avatar_url: Option<String>,
    /// Markdown; only the single-project endpoint sends it.
    pub main_page_content: Option<String>,
}

#[derive(Deserialize)]
pub struct Namespace {
    pub owner: String,
    pub slug: String,
}

#[derive(Deserialize, Default)]
pub struct ProjectStats {
    #[serde(default)]
    pub downloads: i64,
    #[serde(default)]
    pub stars: i64,
}

#[derive(Deserialize, Default)]
pub struct Settings {
    #[serde(default)]
    pub links: Vec<LinkSection>,
    #[serde(default)]
    pub tags: Vec<String>,
    pub license: Option<License>,
}

#[derive(Deserialize)]
pub struct LinkSection {
    #[serde(default)]
    pub links: Vec<Link>,
}

#[derive(Deserialize)]
pub struct Link {
    #[serde(default)]
    pub name: String,
    pub url: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct License {
    pub name: Option<String>,
    #[serde(rename = "type")]
    pub kind: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Version {
    pub id: i64,
    pub project_id: Option<i64>,
    pub name: String,
    pub created_at: String,
    #[serde(default)]
    pub stats: VersionStats,
    pub channel: Option<Channel>,
    #[serde(default)]
    pub downloads: HashMap<String, Download>,
    #[serde(default)]
    pub plugin_dependencies: HashMap<String, Vec<PluginDependency>>,
    #[serde(default)]
    pub platform_dependencies: HashMap<String, Vec<String>>,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct VersionStats {
    #[serde(default)]
    pub total_downloads: i64,
}

#[derive(Deserialize)]
pub struct Channel {
    pub name: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Download {
    pub file_info: Option<FileInfo>,
    pub external_url: Option<String>,
    pub download_url: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileInfo {
    pub name: String,
    #[serde(default)]
    pub size_bytes: i64,
    pub sha256_hash: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginDependency {
    pub name: String,
    pub project_id: Option<i64>,
    #[serde(default)]
    pub required: bool,
    pub external_url: Option<String>,
}

#[derive(ToSchema, Serialize, Deserialize, Clone)]
pub struct HangarSummary {
    /// Numeric project id.
    pub id: String,
    pub slug: String,
    pub owner: String,
    pub title: String,
    pub description: String,
    /// Same as `owner`.
    pub author: String,
    pub icon_url: Option<String>,
    pub downloads: i64,
    /// Stars on Hangar.
    pub follows: i64,
    pub categories: Vec<String>,
    pub updated: Option<String>,
    pub url: String,
    /// Paper versions the project supports, newest first.
    pub game_versions: Vec<String>,
    /// `paper`, `velocity`, `waterfall`, plus `folia` when the project supports Folia.
    pub loaders: Vec<String>,
}

#[derive(ToSchema, Serialize, Deserialize, Clone)]
pub struct ProjectLink {
    pub label: String,
    pub url: String,
}

#[derive(ToSchema, Serialize, Deserialize, Clone)]
pub struct HangarProject {
    #[schema(inline)]
    pub summary: HangarSummary,
    /// Markdown description.
    pub body: String,
    #[schema(inline)]
    pub links: Vec<ProjectLink>,
    pub license: Option<String>,
}

#[derive(ToSchema, Serialize, Deserialize, Clone)]
pub struct HangarFile {
    /// `paper`, `velocity` or `waterfall`.
    pub platform: String,
    /// `None` unless the file is on Hangar's CDN and has a plain `.jar` name.
    pub url: Option<String>,
    /// Download page outside Hangar, for versions Hangar doesn't host.
    pub external_url: Option<String>,
    pub filename: String,
    pub size: i64,
    /// Lowercase hex SHA-256 of the file.
    pub sha256: Option<String>,
}

#[derive(ToSchema, Serialize, Deserialize, Clone)]
pub struct HangarDependency {
    pub platform: String,
    pub name: String,
    pub project_id: Option<String>,
    pub required: bool,
    pub external_url: Option<String>,
}

#[derive(ToSchema, Serialize, Deserialize, Clone)]
pub struct HangarVersion {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub version_number: String,
    /// `release`, `beta` or `alpha`.
    pub channel: String,
    /// The channel's name on Hangar.
    pub channel_name: String,
    pub loaders: Vec<String>,
    pub game_versions: Vec<String>,
    pub downloads: i64,
    pub published: String,
    #[schema(inline)]
    pub files: Vec<HangarFile>,
    #[schema(inline)]
    pub dependencies: Vec<HangarDependency>,
}

fn platform_from_key(key: &str) -> Option<Platform> {
    Platform::ALL
        .into_iter()
        .find(|platform| platform.api_name().eq_ignore_ascii_case(key))
}

/// Platforms present as keys of `map`, in [`Platform::ALL`] order.
fn platforms_of<V>(map: &HashMap<String, V>) -> Vec<Platform> {
    Platform::ALL
        .into_iter()
        .filter(|platform| map.keys().any(|key| platform_from_key(key) == Some(*platform)))
        .collect()
}

fn entry_for<'a, V>(map: &'a HashMap<String, V>, platform: Platform) -> Option<&'a V> {
    map.iter()
        .find(|(key, _)| platform_from_key(key) == Some(platform))
        .map(|(_, value)| value)
}

pub fn supports_folia(project: &Project) -> bool {
    project.settings.tags.iter().any(|tag| tag == FOLIA_TAG)
}

pub fn summarize(project: &Project) -> HangarSummary {
    let mut loaders: Vec<String> = platforms_of(&project.supported_platforms)
        .into_iter()
        .map(|platform| platform.loader().to_string())
        .collect();
    if supports_folia(project) {
        loaders.push("folia".to_string());
    }

    HangarSummary {
        id: project.id.to_string(),
        slug: project.namespace.slug.clone(),
        owner: project.namespace.owner.clone(),
        title: project.name.clone(),
        description: project.description.clone(),
        author: project.namespace.owner.clone(),
        icon_url: project
            .avatar_url
            .clone()
            .filter(|url| url.starts_with("https://")),
        downloads: project.stats.downloads,
        follows: project.stats.stars,
        categories: non_empty(project.category.clone()).into_iter().collect(),
        updated: project.last_updated.clone(),
        url: format!(
            "{WEBSITE}/{}/{}",
            project.namespace.owner, project.namespace.slug
        ),
        game_versions: newest_first(
            entry_for(&project.supported_platforms, Platform::Paper)
                .cloned()
                .unwrap_or_default(),
        ),
        loaders,
    }
}

pub fn project_details(project: Project) -> HangarProject {
    let mut links: Vec<ProjectLink> = Vec::new();
    for link in project
        .settings
        .links
        .iter()
        .flat_map(|section| section.links.iter())
    {
        let Some(url) = http_link(link.url.clone()) else {
            continue;
        };
        if links.iter().any(|existing| existing.url == url) {
            continue;
        }
        links.push(ProjectLink {
            label: if link.name.trim().is_empty() {
                url.clone()
            } else {
                link.name.trim().to_string()
            },
            url,
        });
    }

    let license = project.settings.license.as_ref().and_then(|license| {
        non_empty(license.name.clone()).or_else(|| non_empty(license.kind.clone()))
    });

    HangarProject {
        summary: summarize(&project),
        body: project.main_page_content.unwrap_or_default(),
        links,
        license,
    }
}

/// `release` for Hangar's default channels, `alpha` for development builds, `beta` otherwise.
pub fn channel_kind(name: &str) -> &'static str {
    let lower = name.to_ascii_lowercase();
    if lower == "release" || lower == "stable" {
        "release"
    } else if ["alpha", "snapshot", "dev", "nightly"]
        .iter()
        .any(|marker| lower.contains(marker))
    {
        "alpha"
    } else {
        "beta"
    }
}

fn map_file(platform: Platform, download: &Download) -> HangarFile {
    let info = download.file_info.as_ref();
    let valid_name = info.is_some_and(|info| is_valid_jar_name(&info.name));

    HangarFile {
        platform: platform.loader().to_string(),
        url: download
            .download_url
            .clone()
            .filter(|url| valid_name && is_https_url_on(url, DOWNLOAD_HOSTS)),
        external_url: http_link(download.external_url.clone()),
        filename: info.map(|info| info.name.clone()).unwrap_or_default(),
        size: info.map(|info| info.size_bytes).unwrap_or_default(),
        sha256: info
            .and_then(|info| info.sha256_hash.as_deref())
            .filter(|hash| hash.len() == 64 && hash.bytes().all(|b| b.is_ascii_hexdigit()))
            .map(str::to_ascii_lowercase),
    }
}

/// Maps a version; `folia` is whether its project carries the Folia tag.
pub fn map_version(version: Version, project_id: &str, folia: bool) -> HangarVersion {
    let platforms = platforms_of(&version.downloads);
    let files: Vec<HangarFile> = platforms
        .iter()
        .filter_map(|platform| {
            entry_for(&version.downloads, *platform).map(|download| map_file(*platform, download))
        })
        .collect();

    let mut loaders: Vec<String> = platforms
        .iter()
        .map(|platform| platform.loader().to_string())
        .collect();
    if folia && platforms.contains(&Platform::Paper) {
        loaders.push("folia".to_string());
    }

    let dependencies = platforms_of(&version.plugin_dependencies)
        .into_iter()
        .flat_map(|platform| {
            entry_for(&version.plugin_dependencies, platform)
                .into_iter()
                .flatten()
                .map(move |dependency| HangarDependency {
                    platform: platform.loader().to_string(),
                    name: dependency.name.clone(),
                    project_id: dependency.project_id.map(|id| id.to_string()),
                    required: dependency.required,
                    external_url: http_link(dependency.external_url.clone()),
                })
        })
        .collect();

    let channel_name = version
        .channel
        .map(|channel| channel.name)
        .unwrap_or_default();

    HangarVersion {
        id: version.id.to_string(),
        project_id: version
            .project_id
            .map(|id| id.to_string())
            .unwrap_or_else(|| project_id.to_string()),
        version_number: version.name.clone(),
        name: version.name,
        channel: channel_kind(&channel_name).to_string(),
        channel_name,
        loaders,
        game_versions: newest_first(
            entry_for(&version.platform_dependencies, Platform::Paper)
                .cloned()
                .unwrap_or_default(),
        ),
        downloads: version.stats.total_downloads,
        published: version.created_at,
        files,
        dependencies,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn project() -> Project {
        serde_json::from_value(serde_json::json!({
            "id": 31,
            "name": "ViaVersion",
            "namespace": {"owner": "ViaVersion", "slug": "ViaVersion"},
            "stats": {"downloads": 534135, "stars": 478, "views": 1},
            "category": "misc",
            "description": "Allow newer clients",
            "lastUpdated": "2026-11-23T18:32:47.134084Z",
            "settings": {
                "links": [
                    {"id": 0, "type": "top", "title": "top", "links": [
                        {"id": 1, "name": "Issues", "url": "https://github.com/ViaVersion/ViaVersion/issues"},
                        {"id": 2, "name": "Bad", "url": "javascript:alert(1)"},
                        {"id": 3, "name": "", "url": "https://docs.viaversion.com/"}
                    ]},
                    {"id": 1, "type": "sidebar", "title": "More", "links": [
                        {"id": 0, "name": "Issues again", "url": "https://github.com/ViaVersion/ViaVersion/issues"}
                    ]}
                ],
                "tags": ["SUPPORTS_FOLIA"],
                "license": {"name": "GPL", "url": "https://example.com", "type": "GPL"}
            },
            "supportedPlatforms": {
                "PAPER": ["1.21.4", "26.3", "1.8", "1.21.10"],
                "VELOCITY": ["3.4"]
            },
            "avatarUrl": "https://hangarcdn.papermc.io/avatars/project/31.webp?v=1",
            "mainPageContent": "# ViaVersion"
        }))
        .unwrap()
    }

    fn version() -> Version {
        serde_json::from_value(serde_json::json!({
            "id": 34633,
            "projectId": 31,
            "name": "5.12.3-SNAPSHOT+1132",
            "createdAt": "2026-11-23T18:32:47.134084Z",
            "stats": {"totalDownloads": 12, "platformDownloads": {}},
            "channel": {"name": "Snapshot", "flags": []},
            "downloads": {
                "VELOCITY": {
                    "fileInfo": {"name": "ViaVersion.jar", "sizeBytes": 10, "sha256Hash": "8125F635FC52C83392997205FC4B08F7111DDD55B8981CA3F303CD0E6ACEF19A"},
                    "externalUrl": null,
                    "downloadUrl": "https://hangarcdn.papermc.io/plugins/ViaVersion/ViaVersion/versions/5.12.3/PAPER/ViaVersion.jar"
                },
                "PAPER": {
                    "fileInfo": {"name": "ViaVersion.jar", "sizeBytes": 10, "sha256Hash": "8125f635fc52c83392997205fc4b08f7111ddd55b8981ca3f303cd0e6acef19a"},
                    "externalUrl": null,
                    "downloadUrl": "https://hangarcdn.papermc.io/plugins/ViaVersion/ViaVersion/versions/5.12.3/PAPER/ViaVersion.jar"
                },
                "WATERFALL": {
                    "fileInfo": null,
                    "externalUrl": "https://download.example.com/waterfall",
                    "downloadUrl": null
                }
            },
            "pluginDependencies": {
                "PAPER": [
                    {"name": "ViaBackwards", "projectId": 12, "required": false, "externalUrl": null, "platform": "PAPER"},
                    {"name": "Lib", "projectId": null, "required": true, "externalUrl": "https://example.com/lib", "platform": "PAPER"}
                ]
            },
            "platformDependencies": {
                "PAPER": ["1.20", "26.3", "1.21.11"],
                "VELOCITY": ["3.4"]
            }
        }))
        .unwrap()
    }

    #[test]
    fn summaries_list_platforms_folia_and_paper_versions() {
        let summary = summarize(&project());
        assert_eq!(summary.id, "31");
        assert_eq!(summary.author, "ViaVersion");
        assert_eq!(summary.follows, 478);
        assert_eq!(summary.categories, ["misc"]);
        assert_eq!(summary.url, "https://hangar.papermc.io/ViaVersion/ViaVersion");
        assert_eq!(summary.loaders, ["paper", "velocity", "folia"]);
        assert_eq!(summary.game_versions, ["26.3", "1.21.10", "1.21.4", "1.8"]);
    }

    #[test]
    fn project_details_keep_http_links_and_the_license() {
        let details = project_details(project());
        let urls: Vec<&str> = details.links.iter().map(|link| link.url.as_str()).collect();
        assert_eq!(
            urls,
            [
                "https://github.com/ViaVersion/ViaVersion/issues",
                "https://docs.viaversion.com/"
            ]
        );
        assert_eq!(details.links[1].label, "https://docs.viaversion.com/");
        assert_eq!(details.license.as_deref(), Some("GPL"));
        assert_eq!(details.body, "# ViaVersion");
    }

    #[test]
    fn versions_list_files_per_platform() {
        let version = map_version(version(), "31", true);
        assert_eq!(version.project_id, "31");
        assert_eq!(version.channel, "alpha");
        assert_eq!(version.channel_name, "Snapshot");
        assert_eq!(version.loaders, ["paper", "velocity", "waterfall", "folia"]);
        assert_eq!(version.game_versions, ["26.3", "1.21.11", "1.20"]);
        assert_eq!(version.downloads, 12);

        let platforms: Vec<&str> = version.files.iter().map(|f| f.platform.as_str()).collect();
        assert_eq!(platforms, ["paper", "velocity", "waterfall"]);
        let paper = &version.files[0];
        assert!(paper.url.is_some());
        assert_eq!(paper.filename, "ViaVersion.jar");
        assert_eq!(
            paper.sha256.as_deref(),
            Some("8125f635fc52c83392997205fc4b08f7111ddd55b8981ca3f303cd0e6acef19a")
        );
        assert_eq!(version.files[1].sha256, paper.sha256);

        let external = &version.files[2];
        assert!(external.url.is_none());
        assert_eq!(
            external.external_url.as_deref(),
            Some("https://download.example.com/waterfall")
        );
        assert!(external.sha256.is_none());

        assert_eq!(version.dependencies.len(), 2);
        assert_eq!(version.dependencies[0].project_id.as_deref(), Some("12"));
        assert!(version.dependencies[1].required);
        assert_eq!(
            version.dependencies[1].external_url.as_deref(),
            Some("https://example.com/lib")
        );
    }

    #[test]
    fn folia_needs_the_project_tag_and_a_paper_file() {
        assert!(!map_version(version(), "31", false)
            .loaders
            .contains(&"folia".to_string()));

        let mut velocity_only = version();
        velocity_only
            .downloads
            .retain(|platform, _| platform == "VELOCITY");
        assert_eq!(map_version(velocity_only, "31", true).loaders, ["velocity"]);
    }

    #[test]
    fn downloads_need_the_hangar_cdn_and_a_plain_jar_name() {
        let download = |name: &str, url: &str| Download {
            file_info: Some(FileInfo {
                name: name.to_string(),
                size_bytes: 1,
                sha256_hash: None,
            }),
            external_url: None,
            download_url: Some(url.to_string()),
        };
        let cdn = "https://hangarcdn.papermc.io/plugins/a/b/versions/1/PAPER/a.jar";
        assert!(map_file(Platform::Paper, &download("a.jar", cdn)).url.is_some());
        assert!(map_file(Platform::Paper, &download("a.zip", cdn)).url.is_none());
        assert!(map_file(Platform::Paper, &download(".a.jar", cdn)).url.is_none());
        assert!(
            map_file(Platform::Paper, &download("a.jar", "https://example.com/a.jar"))
                .url
                .is_none()
        );
        assert!(
            map_file(
                Platform::Paper,
                &download("a.jar", "http://hangarcdn.papermc.io/a.jar")
            )
            .url
            .is_none()
        );
    }

    #[test]
    fn channels_map_to_release_beta_and_alpha() {
        assert_eq!(channel_kind("Release"), "release");
        assert_eq!(channel_kind("Stable"), "release");
        assert_eq!(channel_kind("Snapshot"), "alpha");
        assert_eq!(channel_kind("Dev"), "alpha");
        assert_eq!(channel_kind("Nightly"), "alpha");
        assert_eq!(channel_kind("Alpha"), "alpha");
        assert_eq!(channel_kind("Beta"), "beta");
        assert_eq!(channel_kind("Preview"), "beta");
        assert_eq!(channel_kind(""), "beta");
    }
}
