//! CurseForge Core API client (https://docs.curseforge.com/rest-api/). The API key never leaves
//! the backend; the frontend only sees normalized results.

pub mod model;

use axum::http::StatusCode;
use model::{
    BUKKIT_PLUGINS_CLASS_ID, Category, Envelope, FingerprintMatches, Mod, Paged, PluginProject,
    PluginSummary, PluginVersion,
};
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use shared::{State, models::Pagination, response::DisplayError};
use std::{collections::HashMap, sync::LazyLock, time::Duration};
use utoipa::ToSchema;

const API: &str = "https://api.curseforge.com";
const MINECRAFT_GAME_ID: &str = "432";
/// CurseForge rejects searches where `index + pageSize` exceeds this.
const MAX_SEARCH_WINDOW: i64 = 10_000;
const FILES_PAGE_SIZE: i64 = 50;
/// Upper bound of files loaded for one plugin.
const MAX_FILES: i64 = 1_000;
/// Seconds listings (search, projects, files) are cached for.
const CACHE_TTL: u64 = 300;
/// Seconds categories are cached for.
const LONG_CACHE_TTL: u64 = 6 * 60 * 60;

static CLIENT: LazyLock<reqwest::Client> = LazyLock::new(|| {
    reqwest::Client::builder()
        .user_agent(concat!(
            "Caloptreyx/MC-Plugins-Installer/",
            env!("CARGO_PKG_VERSION"),
            " (Calagopus extension dev.caloptreyx.mcplugins)"
        ))
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(30))
        .build()
        .expect("failed to build CurseForge http client")
});

pub fn user_error(message: impl Into<String>, status: StatusCode) -> anyhow::Error {
    DisplayError::new(message.into()).with_status(status).into()
}

async fn fetch_json<T: DeserializeOwned>(
    request: reqwest::RequestBuilder,
) -> Result<T, anyhow::Error> {
    let response = request.send().await.map_err(|err| {
        user_error(
            format!("CurseForge is unreachable: {err}"),
            StatusCode::BAD_GATEWAY,
        )
    })?;

    match response.status() {
        status if status.is_success() => response.json::<T>().await.map_err(|err| {
            user_error(
                format!("unexpected response from CurseForge: {err}"),
                StatusCode::BAD_GATEWAY,
            )
        }),
        reqwest::StatusCode::NOT_FOUND => {
            Err(user_error("not found on CurseForge", StatusCode::NOT_FOUND))
        }
        status @ (reqwest::StatusCode::UNAUTHORIZED | reqwest::StatusCode::FORBIDDEN) => {
            Err(user_error(
                format!(
                    "CurseForge rejected the request (HTTP {status}), check the configured API key"
                ),
                StatusCode::BAD_GATEWAY,
            ))
        }
        status => Err(user_error(
            format!("CurseForge returned HTTP {status}"),
            StatusCode::BAD_GATEWAY,
        )),
    }
}

fn get(key: &str, path: &str) -> reqwest::RequestBuilder {
    CLIENT
        .get(format!("{API}{path}"))
        .header("x-api-key", key)
        .header("Accept", "application/json")
}

fn post(key: &str, path: &str, body: &impl Serialize) -> reqwest::RequestBuilder {
    CLIENT
        .post(format!("{API}{path}"))
        .header("x-api-key", key)
        .header("Accept", "application/json")
        .json(body)
}

/// CurseForge ids are positive numbers; reject anything else before building URLs.
pub fn parse_id(id: &str) -> Result<i64, anyhow::Error> {
    id.parse::<i64>()
        .ok()
        .filter(|id| *id > 0)
        .ok_or_else(|| user_error("invalid CurseForge id", StatusCode::NOT_FOUND))
}

#[derive(ToSchema, Deserialize, Clone, Copy, Default)]
#[serde(rename_all = "lowercase")]
pub enum SortMode {
    #[default]
    Relevance,
    Downloads,
    Follows,
    Newest,
    Updated,
}

pub struct SearchQuery {
    pub query: Option<String>,
    pub game_version: Option<String>,
    pub category: Option<i64>,
    pub sort: SortMode,
    pub page: i64,
    pub per_page: i64,
}

pub async fn search(
    state: &State,
    key: &str,
    query: SearchQuery,
) -> Result<Pagination<PluginSummary>, anyhow::Error> {
    let index = (query.page - 1) * query.per_page;
    if index + query.per_page > MAX_SEARCH_WINDOW {
        return Ok(Pagination {
            total: MAX_SEARCH_WINDOW,
            per_page: query.per_page,
            page: query.page,
            data: Vec::new(),
        });
    }

    let mut params: Vec<(&str, String)> = vec![
        ("gameId", MINECRAFT_GAME_ID.to_string()),
        ("classId", BUKKIT_PLUGINS_CLASS_ID.to_string()),
        ("sortOrder", "desc".to_string()),
        ("index", index.to_string()),
        ("pageSize", query.per_page.to_string()),
        (
            "sortField",
            match query.sort {
                // CurseForge has no relevance order; popularity is what its website uses.
                SortMode::Relevance => "2",
                SortMode::Downloads => "6",
                SortMode::Follows => "12",
                SortMode::Newest => "11",
                SortMode::Updated => "3",
            }
            .to_string(),
        ),
    ];
    if let Some(text) = query.query {
        params.push(("searchFilter", text));
    }
    if let Some(game_version) = query.game_version {
        params.push(("gameVersion", game_version));
    }
    if let Some(category) = query.category {
        params.push(("categoryId", category.to_string()));
    }

    let cache_key = format!(
        "mcplugins::curseforge::search::{}",
        params
            .iter()
            .map(|(name, value)| format!("{name}={value}"))
            .collect::<Vec<_>>()
            .join("&")
    );

    let (total, data): (i64, Vec<PluginSummary>) = state
        .cache
        .cached(&cache_key, CACHE_TTL, || async {
            let response: Paged<Mod> =
                fetch_json(get(key, "/v1/mods/search").query(&params)).await?;
            Ok::<_, anyhow::Error>((
                response.pagination.total_count.min(MAX_SEARCH_WINDOW),
                response.data.into_iter().map(model::summarize).collect(),
            ))
        })
        .await?;

    Ok(Pagination {
        total,
        per_page: query.per_page,
        page: query.page,
        data,
    })
}

pub async fn categories(state: &State, key: &str) -> Result<Vec<Category>, anyhow::Error> {
    state
        .cache
        .cached(
            "mcplugins::curseforge::categories",
            LONG_CACHE_TTL,
            || async {
                let categories: Envelope<Vec<model::CfCategory>> =
                    fetch_json(get(key, "/v1/categories").query(&[
                        ("gameId", MINECRAFT_GAME_ID.to_string()),
                        ("classId", BUKKIT_PLUGINS_CLASS_ID.to_string()),
                    ]))
                    .await?;
                Ok::<_, anyhow::Error>(model::map_categories(categories.data))
            },
        )
        .await
}

pub async fn project(state: &State, key: &str, id: i64) -> Result<PluginProject, anyhow::Error> {
    state
        .cache
        .cached(
            &format!("mcplugins::curseforge::project::{id}"),
            CACHE_TTL,
            || async {
                let (project, description): (Envelope<Mod>, Envelope<String>) = tokio::try_join!(
                    fetch_json(get(key, &format!("/v1/mods/{id}"))),
                    fetch_json(get(key, &format!("/v1/mods/{id}/description"))),
                )?;
                if project.data.class_id != Some(BUKKIT_PLUGINS_CLASS_ID) {
                    return Err(user_error(
                        "this project is not a Bukkit plugin",
                        StatusCode::NOT_FOUND,
                    ));
                }
                Ok(model::project_details(project.data, description.data))
            },
        )
        .await
}

/// Every file of a plugin, newest first.
pub async fn versions(
    state: &State,
    key: &str,
    id: i64,
) -> Result<Vec<PluginVersion>, anyhow::Error> {
    state
        .cache
        .cached(
            &format!("mcplugins::curseforge::versions::{id}"),
            CACHE_TTL,
            || async {
                let mut files = Vec::new();
                let mut index = 0;
                loop {
                    let page: Paged<model::File> =
                        fetch_json(get(key, &format!("/v1/mods/{id}/files")).query(&[
                            ("index", index.to_string()),
                            ("pageSize", FILES_PAGE_SIZE.to_string()),
                        ]))
                        .await?;
                    let received = page.data.len() as i64;
                    files.extend(page.data);
                    index += FILES_PAGE_SIZE;
                    if received < FILES_PAGE_SIZE
                        || index >= page.pagination.total_count
                        || index >= MAX_FILES
                    {
                        break;
                    }
                }

                let mut versions: Vec<PluginVersion> = files
                    .into_iter()
                    .filter(|file| file.is_server_pack != Some(true))
                    .map(model::map_file)
                    .collect();
                versions.sort_by(|a, b| b.published.cmp(&a.published));
                Ok::<_, anyhow::Error>(versions)
            },
        )
        .await
}

#[derive(ToSchema, Serialize)]
pub struct FingerprintMatch {
    pub fingerprint: u64,
    #[schema(inline)]
    pub project: PluginSummary,
    #[schema(inline)]
    pub version: PluginVersion,
}

/// Identifies jars by their CurseForge fingerprint; files that are not Bukkit plugins are left out.
pub async fn match_fingerprints(
    key: &str,
    fingerprints: &[u64],
) -> Result<Vec<FingerprintMatch>, anyhow::Error> {
    if fingerprints.is_empty() {
        return Ok(Vec::new());
    }

    let matches: Envelope<FingerprintMatches> = fetch_json(post(
        key,
        &format!("/v1/fingerprints/{MINECRAFT_GAME_ID}"),
        &serde_json::json!({ "fingerprints": fingerprints }),
    ))
    .await?;

    let files: Vec<model::File> = matches
        .data
        .exact_matches
        .into_iter()
        .map(|found| found.file)
        .filter(|file| {
            file.file_fingerprint
                .is_some_and(|fp| fingerprints.contains(&fp))
        })
        .collect();
    if files.is_empty() {
        return Ok(Vec::new());
    }

    let mut mod_ids: Vec<i64> = files.iter().map(|file| file.mod_id).collect();
    mod_ids.sort_unstable();
    mod_ids.dedup();
    let projects: Envelope<Vec<Mod>> = fetch_json(post(
        key,
        "/v1/mods",
        &serde_json::json!({ "modIds": mod_ids }),
    ))
    .await?;
    let projects: HashMap<i64, PluginSummary> = projects
        .data
        .into_iter()
        .filter(|project| project.class_id == Some(BUKKIT_PLUGINS_CLASS_ID))
        .map(|project| (project.id, model::summarize(project)))
        .collect();

    Ok(files
        .into_iter()
        .filter_map(|file| {
            let fingerprint = file.file_fingerprint?;
            let project = projects.get(&file.mod_id)?.clone();
            Some(FingerprintMatch {
                fingerprint,
                project,
                version: model::map_file(file),
            })
        })
        .collect())
}

/// Checks an API key against CurseForge without touching the stored settings.
pub async fn verify_key(key: &str) -> Result<(), anyhow::Error> {
    let response = get(key, &format!("/v1/games/{MINECRAFT_GAME_ID}"))
        .send()
        .await
        .map_err(|err| {
            user_error(
                format!("CurseForge is unreachable: {err}"),
                StatusCode::BAD_GATEWAY,
            )
        })?;

    match response.status() {
        status if status.is_success() => Ok(()),
        reqwest::StatusCode::UNAUTHORIZED | reqwest::StatusCode::FORBIDDEN => Err(user_error(
            "CurseForge rejected the API key",
            StatusCode::BAD_REQUEST,
        )),
        status => Err(user_error(
            format!("CurseForge returned HTTP {status}"),
            StatusCode::BAD_GATEWAY,
        )),
    }
}
