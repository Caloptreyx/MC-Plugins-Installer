# MC Plugins Installer

An easy-to-use Minecraft plugin installer and manager for the [Calagopus Panel](https://github.com/calagopus/panel).
Plugins come from [Modrinth](https://modrinth.com) and, once an administrator adds an API key,
[CurseForge](https://www.curseforge.com/minecraft/bukkit-plugins). The pages follow the look of the Modpack Installer
extension.

## Features

- **Browse** — search plugins in a card grid with a Modrinth/CurseForge switch, filters for Plugin Loader, Minecraft
  version and category, and a sort order. The **Match server** switch (on by default) narrows results to the
  detected loader and Minecraft version. Filters live in the URL, so a filtered view can be bookmarked or shared.
- **Installed** — every jar in the server's `plugins/` folder in a searchable table, identified on Modrinth and
  CurseForge by file hash. Enable or disable plugins, switch their version, or delete them.
- **Plugin details** — description, stats, links, and a Versions table with pagination and filters (search, loader,
  Minecraft version, release channel, and a **Compatible only** switch that is on by default).
- **Install / switch modal** — pick the loader, Minecraft version and plugin version. Loader and Minecraft version
  default to what was detected on the server; incompatible choices are flagged before installing.
- **Detection badges** show the detected Plugin Loader and Minecraft version, and an alert explains what to do when
  either cannot be detected.

### Supported platforms

Paper, Purpur, Folia, Spigot, Bukkit, Sponge, and the Velocity, BungeeCord and Waterfall proxies. Forks see their
parent's plugins (Purpur also shows Paper, Spigot and Bukkit plugins; Waterfall also shows BungeeCord plugins). Folia
only shows Folia-compatible builds. Proxies are not tied to a Minecraft version, so no version is detected for them.

CurseForge only has a "Bukkit Plugins" section. Its plugins are offered for Bukkit, Spigot, Paper and Purpur servers;
on other platforms the CurseForge tab explains that and points to Modrinth.

### How detection works

The Plugin Loader is read, in order, from:

1. the brand in `version_history.json` (older Paper-family builds, e.g. `git-Purpur-2062`);
2. config files the platform generates on first start (`purpur.yml`, `velocity.toml`, `waterfall.yml`,
   `modules.yml`, `config/paper-global.yml`, `paper.yml`, `spigot.yml`, `bukkit.yml`, `config/sponge/`);
3. the egg name, startup command, `SERVER_JARFILE` variable and Docker image. A name that is a fork of the file
   match wins (a Folia egg with Paper's config files is detected as Folia).

The Minecraft version is read, in order, from `version_history.json`, the `Starting minecraft server version` line
of `logs/latest.log`, the `versions/` folder Paperclip extracts, and finally the `MINECRAFT_VERSION`, `MC_VERSION`,
`VERSION` or `MINECRAFT_VER` startup variable (release versions only, not `latest`).

If nothing matches — typically on a server that has never been started — the badges read "Not detected" and an alert
asks you to start the server once and detect again. You can still pick the loader and version by hand.

### How plugins are managed

- Plugins are downloaded by the node straight from Modrinth or CurseForge's CDN into `plugins/` using the panel's
  file pull.
- Installed jars are identified by SHA-1 on Modrinth and, for the rest, by CurseForge fingerprint.
- Some CurseForge authors do not allow third-party downloads. Those versions are marked **CurseForge only** and
  cannot be installed from the panel; download them from CurseForge and upload them yourself.
- Disabling renames `Plugin.jar` to `Plugin.jar.disabled`; enabling renames it back.
- Switching versions downloads the new jar first and only then removes the old one; if both versions share a file
  name the old jar is kept as a backup until the download succeeds. A disabled plugin stays disabled.
- Deleting removes the jar only; the plugin's data folder is left alone.
- Changes take effect after the server restarts.

### Permissions

The **Plugins** page needs the `files.read-content` server permission (detection and identification read and hash
files). Installing needs `files.create`, enabling/disabling needs `files.update`, and switching versions or deleting
needs `files.delete`. `startup.read` is used, when available, to read startup variables during detection.

The extension adds the admin permissions `mcplugins.read` (view the settings) and `mcplugins.manage` (change the
CurseForge API key).

## Setting up CurseForge

1. Create an API key in the [CurseForge for Studios console](https://console.curseforge.com/).
2. In the panel go to **Admin → Extensions → MC Plugins Installer**, paste the key, use **Test this key**, then
   **Save**.

The key is stored encrypted in the panel settings and never sent to users; CurseForge requests go through this
extension's backend. Without a key only Modrinth is offered.

## Requirements

Calagopus Panel **1.2.2** or newer. There are no database migrations.

## Installation

1. Build the archive (see below) or download `dev_caloptreyx_mcplugins.c7s.zip` from a release.
2. In the panel go to **Admin → System → Extensions**, choose **Install extension**, and upload the archive.
3. **Rebuild extensions**. A **Plugins** entry appears in every server's sidebar.

## Building the archive

From a panel development checkout that contains this extension under
`backend-extensions/dev_caloptreyx_mcplugins`:

```bash
panel-rs extensions export dev.caloptreyx.mcplugins
```

Or zip this repository's layout directly:

```bash
zip -r dev_caloptreyx_mcplugins.c7s.zip Metadata.toml backend frontend -x 'frontend/node_modules/*'
```

## Development

Repository layout mirrors the extension archive:

```
Metadata.toml             extension metadata (package name, panel version requirement)
backend/src/lib.rs        routes, admin permissions and settings registration
backend/src/settings.rs   encrypted CurseForge API key
backend/src/curseforge/   CurseForge API client and mapping onto the shared plugin model
backend/src/routes/       /api/admin/extensions/dev.caloptreyx.mcplugins/* and
                          /api/client/servers/{server}/mcplugins/curseforge/*
frontend/src/index.tsx    registers the /plugins, /plugins/installed and
                          /plugins/project/:source/:projectId/:tab? server routes and the admin page
frontend/src/lib/         source-agnostic catalog (Modrinth in the browser, CurseForge via the backend),
                          detection, plugin file operations, React Query hooks
frontend/src/components/  shared UI (provider marks, loader/channel badges, detection badges/alert, install modal)
frontend/src/pages/       Browse, Installed, Plugin details and admin configuration pages
```

To work on it, set up the [panel development environment](https://calagopus.com/docs/panel/extensions/dev-environment),
place this repository's `Metadata.toml`, `backend/Cargo.toml` and `backend/src/` at
`backend-extensions/dev_caloptreyx_mcplugins/` and `frontend/` at `backend-extensions/dev_caloptreyx_mcplugins/frontend/`
(or install the archive with `panel-rs extensions add`), then run `pnpm dev` in the panel's `frontend/` directory.

Before shipping, run from the panel checkout:

```bash
cargo fmt && cargo clippy -p dev_caloptreyx_mcplugins
cd frontend && pnpm biome:fix-unsafe && pnpm build:ci
```
