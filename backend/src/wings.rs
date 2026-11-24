use axum::http::StatusCode;
use wings_api::client::{ApiHttpError, WingsClient};

const PER_PAGE: u64 = 100;

/// Lists every entry of `directory`, paging through Wings until all entries
/// are read or `max_pages` pages were fetched. A missing directory is `None`.
pub async fn list_directory(
    client: &WingsClient,
    server: uuid::Uuid,
    directory: &str,
    ignored: Option<Vec<compact_str::CompactString>>,
    max_pages: u64,
) -> Result<Option<Vec<wings_api::DirectoryEntry>>, ApiHttpError> {
    let mut query = wings_api::servers_server_files_list::get::Query {
        directory: Some(directory.into()),
        ignored,
        per_page: Some(PER_PAGE),
        ..Default::default()
    };

    let mut entries = Vec::new();
    for page in 1..=max_pages {
        query.page = Some(page);

        let response = match client.get_servers_server_files_list(server, &query).await {
            Ok(response) => response,
            Err(ApiHttpError::Http(StatusCode::NOT_FOUND, _)) if page == 1 => return Ok(None),
            Err(err) => return Err(err),
        };

        let received = response.entries.len() as u64;
        entries.extend(response.entries);

        if received < PER_PAGE || entries.len() as u64 >= response.total {
            break;
        }
        if page == max_pages {
            tracing::warn!(
                %server,
                directory,
                total = response.total,
                "directory listing truncated after {max_pages} pages"
            );
        }
    }

    Ok(Some(entries))
}
