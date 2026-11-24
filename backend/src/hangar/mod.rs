//! Hangar API client (https://hangar.papermc.io/api-docs). Hangar is public, so no key is
//! needed; lookups go through the backend so they can be cached, rate limited and checked.

pub mod model;

use crate::common::CACHE_PREFIX;
use axum::http::StatusCode;
use futures_util::{StreamExt, TryStreamExt};
use model::{HangarProject, HangarSummary, HangarVersion, Paged, Platform, Project, Version};
use serde::{Deserialize, de::DeserializeOwned};
use shared::{State, models::Pagination, response::DisplayError};
use std::{sync::LazyLock, time::Duration};
use utoipa::ToSchema;

const API: &str = "https://hangar.papermc.io/api/v1";
/// Hangar serves at most this many versions per request.
const VERSIONS_PAGE_SIZE: i64 = 25;
/// Upper bound of versions loaded for one plugin, newest first.
const MAX_VERSIONS: i64 = 250;
/// Version pages requested at the same time.
const VERSION_PAGE_CONCURRENCY: usize = 3;
/// Seconds search results, projects and versions are cached for.
const CACHE_TTL: u64 = 300;

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
        .expect("failed to build Hangar http client")
});

fn user_error(message: impl Into<String>, status: StatusCode) -> anyhow::Error {
    DisplayError::new(message.into())
        .with_status(status)
        .into()
}

async fn fetch_json<T: DeserializeOwned>(
    request: reqwest::RequestBuilder,
) -> Result<T, anyhow::Error> {
    let response = request.send().await.map_err(|err| {
        tracing::warn!("Hangar request failed: {err:#}");
        user_error("Hangar is unreachable", StatusCode::BAD_GATEWAY)
    })?;

    match response.status() {
        status if status.is_success() => response.json::<T>().await.map_err(|err| {
            tracing::warn!("unexpected Hangar response: {err:#}");
            user_error("unexpected response from Hangar", StatusCode::BAD_GATEWAY)
        }),
        reqwest::StatusCode::NOT_FOUND => {
            Err(user_error("not found on Hangar", StatusCode::NOT_FOUND))
        }
        status => {
            tracing::warn!(%status, "Hangar returned an error");
            Err(user_error(
                format!("Hangar returned HTTP {}", status.as_u16()),
                StatusCode::BAD_GATEWAY,
            ))
        }
    }
}

fn get(path: &str) -> reqwest::RequestBuilder {
    CLIENT
        .get(format!("{API}{path}"))
        .header("Accept", "application/json")
}

/// Whether `project` is a numeric id or a slug Hangar could know, so it can go into a URL path.
pub fn is_valid_project_ref(project: &str) -> bool {
    (1..=64).contains(&project.len())
        && project
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'_' | b'.' | b'-'))
        && !project.bytes().all(|b| b == b'.')
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
    pub platform: Platform,
    pub game_version: Option<String>,
    pub category: Option<String>,
    pub sort: SortMode,
    pub folia: bool,
    pub page: i64,
    pub per_page: i64,
}

pub async fn search(
    state: &State,
    query: SearchQuery,
) -> Result<Pagination<HangarSummary>, anyhow::Error> {
    let mut params: Vec<(&str, String)> = vec![
        ("limit", query.per_page.to_string()),
        ("offset", ((query.page - 1) * query.per_page).to_string()),
        ("platform", query.platform.api_name().to_string()),
    ];
    if let Some(text) = query.query {
        params.push(("query", text));
    }
    // Hangar only filters by version together with a platform, which is always set here.
    if let Some(game_version) = query.game_version {
        params.push(("version", game_version));
    }
    if let Some(category) = query.category {
        params.push(("category", category));
    }
    if query.folia {
        params.push(("tag", model::FOLIA_TAG.to_string()));
    }
    let sort = match query.sort {
        SortMode::Relevance => None,
        SortMode::Downloads => Some("-downloads"),
        SortMode::Follows => Some("-stars"),
        SortMode::Newest => Some("-newest"),
        SortMode::Updated => Some("-updated"),
    };
    if let Some(sort) = sort {
        params.push(("sort", sort.to_string()));
    }

    let cache_key = format!(
        "{CACHE_PREFIX}::hangar::search::{}",
        params
            .iter()
            .map(|(name, value)| format!("{name}={value}"))
            .collect::<Vec<_>>()
            .join("&")
    );

    let (total, data): (i64, Vec<HangarSummary>) = state
        .cache
        .cached(&cache_key, CACHE_TTL, || async {
            let response: Paged<Project> = fetch_json(get("/projects").query(&params)).await?;
            Ok::<_, anyhow::Error>((
                response.pagination.count,
                response.result.iter().map(model::summarize).collect(),
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

pub async fn project(state: &State, project: &str) -> Result<HangarProject, anyhow::Error> {
    state
        .cache
        .cached(
            &format!("{CACHE_PREFIX}::hangar::project::{}", project.to_ascii_lowercase()),
            CACHE_TTL,
            || async {
                let project: Project = fetch_json(get(&format!("/projects/{project}"))).await?;
                Ok::<_, anyhow::Error>(model::project_details(project))
            },
        )
        .await
}

async fn versions_page(project: &str, offset: i64) -> Result<Paged<Version>, anyhow::Error> {
    fetch_json(get(&format!("/projects/{project}/versions")).query(&[
        ("limit", VERSIONS_PAGE_SIZE.to_string()),
        ("offset", offset.to_string()),
    ]))
    .await
}

/// Up to [`MAX_VERSIONS`] versions of a plugin, newest first.
pub async fn versions(state: &State, project: &str) -> Result<Vec<HangarVersion>, anyhow::Error> {
    // The versions don't carry the project's Folia tag, the (cached) project does.
    let details = self::project(state, project).await?;
    let folia = details.summary.loaders.iter().any(|loader| loader == "folia");
    let project_id = details.summary.id;

    state
        .cache
        .cached(
            &format!("{CACHE_PREFIX}::hangar::versions::{project_id}"),
            CACHE_TTL,
            || async {
                let first = versions_page(&project_id, 0).await?;
                let total = first.pagination.count.min(MAX_VERSIONS);
                let offsets: Vec<i64> = (1..)
                    .map(|page| page * VERSIONS_PAGE_SIZE)
                    .take_while(|offset| *offset < total)
                    .collect();

                let rest: Vec<Paged<Version>> = futures_util::stream::iter(offsets)
                    .map(|offset| versions_page(&project_id, offset))
                    .buffered(VERSION_PAGE_CONCURRENCY)
                    .try_collect()
                    .await?;

                let mut versions: Vec<HangarVersion> = std::iter::once(first)
                    .chain(rest)
                    .flat_map(|page| page.result)
                    .map(|version| model::map_version(version, &project_id, folia))
                    .collect();
                versions.sort_by(|a, b| b.published.cmp(&a.published));
                versions.dedup_by(|a, b| a.id == b.id);
                versions.truncate(MAX_VERSIONS as usize);
                Ok::<_, anyhow::Error>(versions)
            },
        )
        .await
}
