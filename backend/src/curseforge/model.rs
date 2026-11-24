//! CurseForge Core API payloads and their mapping onto the plugin model the frontend shares
//! with Modrinth and Hangar. Kept free of panel types so the mapping can be tested on its own.

use crate::common::{
    is_https_url_on, is_valid_jar_name, newest_first, non_empty, strip_jar_extension,
};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

/// CurseForge's "Bukkit Plugins" class. Everything in it targets the Bukkit API, so it runs on
/// Bukkit and its forks (Spigot, Paper, Purpur) but not on proxies, Sponge or Folia.
pub const BUKKIT_PLUGINS_CLASS_ID: i64 = 5;
/// Only downloads served from CurseForge's own CDN are handed to the node.
const DOWNLOAD_HOSTS: &[&str] = &["edge.forgecdn.net", "mediafilez.forgecdn.net"];
/// CurseForge's id for SHA-1 in `File.hashes`.
const SHA1_ALGO: i64 = 1;

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
    #[serde(default)]
    pub latest_files: Vec<File>,
    /// `false` when the author disallows downloads outside CurseForge.
    pub allow_mod_distribution: Option<bool>,
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
    #[serde(default)]
    pub hashes: Vec<FileHash>,
    #[serde(default)]
    pub dependencies: Vec<FileDependency>,
}

#[derive(Deserialize)]
pub struct FileHash {
    pub value: String,
    pub algo: i64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileDependency {
    pub mod_id: i64,
    pub relation_type: i64,
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
    /// `false` when the author disallows downloads outside CurseForge.
    pub allow_distribution: bool,
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
    /// `None` when the file can't be downloaded from CurseForge's CDN by the node.
    pub url: Option<String>,
    pub filename: String,
    pub size: i64,
    /// Lowercase hex SHA-1 of the file.
    pub sha1: Option<String>,
    /// CurseForge (murmur2) fingerprint as a decimal string.
    pub fingerprint: Option<String>,
}

#[derive(ToSchema, Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum DependencyKind {
    Required,
    Optional,
    Incompatible,
}

#[derive(ToSchema, Serialize, Deserialize, Clone, PartialEq, Eq, Debug)]
pub struct Dependency {
    pub project_id: String,
    pub kind: DependencyKind,
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
    /// `None` when the file name isn't a plain `.jar` name.
    #[schema(inline)]
    pub file: Option<VersionFile>,
    #[schema(inline)]
    pub dependencies: Vec<Dependency>,
    /// `false` when the author disallows downloads outside CurseForge.
    pub distributable: bool,
}

#[derive(ToSchema, Serialize, Deserialize, Clone)]
pub struct Category {
    pub id: String,
    pub name: String,
}

pub fn summarize(project: &Mod) -> PluginSummary {
    let url = non_empty(project.links.website_url.clone()).unwrap_or_else(|| {
        format!(
            "https://www.curseforge.com/minecraft/bukkit-plugins/{}",
            project.slug
        )
    });

    PluginSummary {
        id: project.id.to_string(),
        slug: project.slug.clone(),
        title: project.name.clone(),
        description: project.summary.clone(),
        author: project
            .authors
            .first()
            .map(|author| author.name.clone())
            .unwrap_or_default(),
        icon_url: project.logo.as_ref().and_then(|logo| {
            non_empty(logo.thumbnail_url.clone()).or(non_empty(logo.url.clone()))
        }),
        downloads: project.download_count as i64,
        follows: project.thumbs_up_count,
        categories: project
            .categories
            .iter()
            .filter(|category| category.is_class != Some(true))
            .map(|category| category.name.clone())
            .collect(),
        updated: project.date_modified.clone(),
        url,
        game_versions: newest_first(
            project
                .latest_files_indexes
                .iter()
                .map(|index| index.game_version.clone()),
        ),
        allow_distribution: project.allow_mod_distribution != Some(false),
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
            url: crate::common::http_link(non_empty(url))?,
        })
    })
    .collect();

    PluginProject {
        summary: summarize(&project),
        body,
        links,
    }
}

/// Maps a file. `allow_distribution` is the project's `allowModDistribution`, when known.
pub fn map_file(file: File, allow_distribution: Option<bool>) -> PluginVersion {
    let distributable = allow_distribution != Some(false) && file.download_url.is_some();
    let version_number = strip_jar_extension(&file.file_name).to_string();

    let version_file = is_valid_jar_name(&file.file_name).then(|| VersionFile {
        url: file
            .download_url
            .filter(|url| distributable && is_https_url_on(url, DOWNLOAD_HOSTS)),
        sha1: file
            .hashes
            .iter()
            .find(|hash| {
                hash.algo == SHA1_ALGO
                    && hash.value.len() == 40
                    && hash.value.bytes().all(|b| b.is_ascii_hexdigit())
            })
            .map(|hash| hash.value.to_ascii_lowercase()),
        fingerprint: file.file_fingerprint.map(|fp| fp.to_string()),
        filename: file.file_name,
        size: file.file_length,
    });

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
        file: version_file,
        dependencies: map_dependencies(&file.dependencies),
        distributable,
    }
}

/// Required, optional and incompatible relations; embedded libraries, tools and includes are
/// dropped because nothing has to be installed or removed for them.
fn map_dependencies(dependencies: &[FileDependency]) -> Vec<Dependency> {
    let mut mapped: Vec<Dependency> = Vec::new();
    for dependency in dependencies {
        let kind = match dependency.relation_type {
            3 => DependencyKind::Required,
            2 => DependencyKind::Optional,
            5 => DependencyKind::Incompatible,
            _ => continue,
        };
        let entry = Dependency {
            project_id: dependency.mod_id.to_string(),
            kind,
        };
        if dependency.mod_id > 0 && !mapped.contains(&entry) {
            mapped.push(entry);
        }
    }
    mapped
}

/// Files of one project, without server packs, newest first.
pub fn map_files(files: Vec<File>, allow_distribution: Option<bool>) -> Vec<PluginVersion> {
    let mut versions: Vec<PluginVersion> = files
        .into_iter()
        .filter(|file| file.is_server_pack != Some(true))
        .map(|file| map_file(file, allow_distribution))
        .collect();
    versions.sort_by(|a, b| b.published.cmp(&a.published));
    versions
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

    fn file(value: serde_json::Value) -> File {
        serde_json::from_value(value).unwrap()
    }

    #[test]
    fn files_keep_release_game_versions_and_only_cdn_downloads() {
        let version = map_file(
            file(serde_json::json!({
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
                "fileFingerprint": 3_000_000_000u64,
                "hashes": [
                    {"value": "0123456789ABCDEF0123456789ABCDEF01234567", "algo": 1},
                    {"value": "d41d8cd98f00b204e9800998ecf8427e", "algo": 2}
                ]
            })),
            Some(true),
        );
        assert_eq!(version.game_versions, ["26.3", "1.21.4"]);
        assert_eq!(version.channel, "beta");
        assert_eq!(version.version_number, "worldedit-bukkit-7.4.6-beta-02");
        assert_eq!(version.project_id, "31043");
        assert!(version.distributable);
        let version_file = version.file.unwrap();
        assert!(version_file.url.is_some());
        assert_eq!(
            version_file.sha1.as_deref(),
            Some("0123456789abcdef0123456789abcdef01234567")
        );
        assert_eq!(version_file.fingerprint.as_deref(), Some("3000000000"));

        let foreign = map_file(
            file(serde_json::json!({
                "id": 1, "modId": 2, "fileName": "a.jar", "releaseType": 1,
                "fileDate": "2026-01-01T00:00:00Z", "downloadUrl": "https://example.com/a.jar"
            })),
            None,
        );
        let foreign_file = foreign.file.unwrap();
        assert!(foreign_file.url.is_none());
        assert!(foreign_file.sha1.is_none());
        assert!(foreign_file.fingerprint.is_none());
    }

    #[test]
    fn files_the_author_keeps_on_curseforge_have_no_download() {
        let url = "https://edge.forgecdn.net/files/1/2/a.jar";
        let disallowed = map_file(
            file(serde_json::json!({
                "id": 1, "modId": 2, "fileName": "a.jar", "releaseType": 1,
                "fileDate": "2026-01-01T00:00:00Z", "downloadUrl": url
            })),
            Some(false),
        );
        assert!(!disallowed.distributable);
        assert!(disallowed.file.unwrap().url.is_none());

        let no_url = map_file(
            file(serde_json::json!({
                "id": 1, "modId": 2, "fileName": "a.jar", "releaseType": 1,
                "fileDate": "2026-01-01T00:00:00Z", "downloadUrl": null
            })),
            None,
        );
        assert!(!no_url.distributable);
        assert!(no_url.file.unwrap().url.is_none());
    }

    #[test]
    fn files_without_a_plain_jar_name_have_no_file() {
        for name in [
            "plugin.zip",
            "../plugin.jar",
            ".plugin.jar",
            "plugin-sources.jar",
            "dir/plugin.jar",
        ] {
            let version = map_file(
                file(serde_json::json!({
                    "id": 1, "modId": 2, "fileName": name, "releaseType": 1,
                    "fileDate": "2026-01-01T00:00:00Z",
                    "downloadUrl": "https://edge.forgecdn.net/files/1/2/a.jar"
                })),
                Some(true),
            );
            assert!(version.file.is_none(), "{name} should have no file");
        }
    }

    #[test]
    fn dependencies_keep_required_optional_and_incompatible() {
        let version = map_file(
            file(serde_json::json!({
                "id": 1, "modId": 2, "fileName": "a.jar", "releaseType": 1,
                "fileDate": "2026-01-01T00:00:00Z",
                "dependencies": [
                    {"modId": 10, "relationType": 3},
                    {"modId": 11, "relationType": 2},
                    {"modId": 12, "relationType": 5},
                    {"modId": 13, "relationType": 1},
                    {"modId": 14, "relationType": 4},
                    {"modId": 15, "relationType": 6},
                    {"modId": 10, "relationType": 3}
                ]
            })),
            None,
        );
        assert_eq!(
            version.dependencies,
            [
                Dependency {
                    project_id: "10".into(),
                    kind: DependencyKind::Required
                },
                Dependency {
                    project_id: "11".into(),
                    kind: DependencyKind::Optional
                },
                Dependency {
                    project_id: "12".into(),
                    kind: DependencyKind::Incompatible
                },
            ]
        );
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
            ],
            "allowModDistribution": false
        }))
        .unwrap();

        let summary = summarize(&project);
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
        assert!(!summary.allow_distribution);
    }

    #[test]
    fn latest_files_are_newest_first_without_server_packs() {
        let files: Vec<File> = serde_json::from_value(serde_json::json!([
            {"id": 1, "modId": 2, "fileName": "a-1.jar", "releaseType": 1, "fileDate": "2026-01-01T00:00:00Z"},
            {"id": 2, "modId": 2, "fileName": "a-2.jar", "releaseType": 1, "fileDate": "2026-03-01T00:00:00Z"},
            {"id": 3, "modId": 2, "fileName": "a-pack.zip", "releaseType": 1, "fileDate": "2026-04-01T00:00:00Z", "isServerPack": true}
        ]))
        .unwrap();
        let ids: Vec<String> = map_files(files, Some(true))
            .into_iter()
            .map(|version| version.id)
            .collect();
        assert_eq!(ids, ["2", "1"]);
    }
}
