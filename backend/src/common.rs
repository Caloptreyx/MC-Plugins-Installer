//! Rules shared by every plugin source: which file names may be written into `plugins/`, which
//! download hosts are trusted, which links are passed on and how Minecraft versions are ordered.
//! Kept free of panel types so they can be tested on their own.

/// Prefix of every cache key. It carries the extension version, so entries cached in the shape of
/// an older release (Redis keeps them across restarts) are never read back.
pub const CACHE_PREFIX: &str = concat!("mcplugins::", env!("CARGO_PKG_VERSION"));

/// Whether `name` may be used as the file name of a downloaded plugin: a single path segment
/// without a leading dot or control characters that ends in `.jar` (any case) and is not a
/// sources jar.
pub fn is_valid_jar_name(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();

    !name.is_empty()
        && name.len() <= 255
        && !name.starts_with('.')
        && !name.contains(['/', '\\'])
        && !name.chars().any(char::is_control)
        && lower.ends_with(".jar")
        && !lower.ends_with("-sources.jar")
}

/// `name` without its `.jar` extension, whatever its case.
pub fn strip_jar_extension(name: &str) -> &str {
    let split = name.len().saturating_sub(".jar".len());
    match (name.get(..split), name.get(split..)) {
        (Some(stem), Some(extension)) if extension.eq_ignore_ascii_case(".jar") => stem,
        _ => name,
    }
}

/// Whether `url` is an https URL on exactly one of `hosts`.
pub fn is_https_url_on(url: &str, hosts: &[&str]) -> bool {
    url::Url::parse(url).is_ok_and(|url| {
        url.scheme() == "https" && url.host_str().is_some_and(|host| hosts.contains(&host))
    })
}

/// `url` when it is an absolute http(s) link, so `javascript:` and similar never reach the page.
pub fn http_link(url: Option<String>) -> Option<String> {
    url.filter(|url| {
        url::Url::parse(url.trim())
            .is_ok_and(|parsed| matches!(parsed.scheme(), "http" | "https"))
    })
    .map(|url| url.trim().to_string())
}

pub fn non_empty(value: Option<String>) -> Option<String> {
    value.filter(|value| !value.trim().is_empty())
}

/// Release-style Minecraft versions (`1.21.4`, `26.3`); sources also list labels such as
/// `Bukkit` or `CB 1.7.9-R0.2` in the same field.
fn is_release_version(value: &str) -> bool {
    let parts: Vec<&str> = value.split('.').collect();
    (2..=3).contains(&parts.len())
        && parts
            .iter()
            .all(|part| !part.is_empty() && part.bytes().all(|b| b.is_ascii_digit()))
}

/// Release versions from `versions`, deduplicated and newest first (`1.21.10` > `1.21.4`).
pub fn newest_first(versions: impl IntoIterator<Item = String>) -> Vec<String> {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn jar_names_must_be_plain_jars() {
        for name in ["WorldEdit-7.3.jar", "LuckPerms.JAR", "a.Jar"] {
            assert!(is_valid_jar_name(name), "{name} should be accepted");
        }
        for name in [
            "",
            ".jar",
            ".hidden.jar",
            "../evil.jar",
            "dir/plugin.jar",
            "dir\\plugin.jar",
            "plugin\n.jar",
            "plugin\u{7f}.jar",
            "plugin.zip",
            "plugin.jar.disabled",
            "plugin-sources.jar",
            "plugin-SOURCES.JAR",
            &format!("{}.jar", "a".repeat(252)),
        ] {
            assert!(!is_valid_jar_name(name), "{name:?} should be rejected");
        }
    }

    #[test]
    fn jar_extensions_are_stripped_in_any_case() {
        assert_eq!(strip_jar_extension("WorldEdit-7.3.jar"), "WorldEdit-7.3");
        assert_eq!(strip_jar_extension("LuckPerms.JAR"), "LuckPerms");
        assert_eq!(strip_jar_extension("plugin.zip"), "plugin.zip");
        assert_eq!(strip_jar_extension("ä.jar"), "ä");
    }

    #[test]
    fn download_hosts_must_match_exactly_over_https() {
        let hosts = &["edge.forgecdn.net", "hangarcdn.papermc.io"];
        assert!(is_https_url_on("https://edge.forgecdn.net/files/1/2/a.jar", hosts));
        assert!(is_https_url_on("https://hangarcdn.papermc.io/plugins/a.jar", hosts));
        for url in [
            "http://edge.forgecdn.net/files/1/2/a.jar",
            "https://evil.edge.forgecdn.net/a.jar",
            "https://edge.forgecdn.net.evil.com/a.jar",
            "https://hangarcdn.papermc.io@evil.com/a.jar",
            "ftp://hangarcdn.papermc.io/a.jar",
            "not a url",
        ] {
            assert!(!is_https_url_on(url, hosts), "{url} should be rejected");
        }
    }

    #[test]
    fn only_http_links_pass() {
        assert_eq!(
            http_link(Some("https://github.com/a/b".into())).as_deref(),
            Some("https://github.com/a/b")
        );
        assert!(http_link(Some("http://example.com".into())).is_some());
        assert!(http_link(Some("javascript:alert(1)".into())).is_none());
        assert!(http_link(Some("/relative".into())).is_none());
        assert!(http_link(None).is_none());
    }

    #[test]
    fn versions_are_release_only_and_newest_first() {
        let versions = ["1.21.4", "26.3", "Bukkit", "1.21.10", "1.21-Snapshot", "1.21.4"]
            .map(String::from);
        assert_eq!(newest_first(versions), ["26.3", "1.21.10", "1.21.4"]);
    }
}
