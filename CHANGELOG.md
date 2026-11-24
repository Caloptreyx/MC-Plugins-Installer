# Changelog

## 1.1.4

- Added Hangar (PaperMC) as a plugin source: browse, view, install and update Paper, Velocity and Waterfall plugins.
  Hangar versions hosted elsewhere are marked "External download" and are not installed.
- Added update checks: installed plugins show "Update to x.y" (release versions by default, beta updates behind a
  switch), an Updates filter, and "Update all" with a review step that updates one plugin at a time.
- Installing now offers the plugin's required dependencies (Modrinth, CurseForge and Hangar) and warns about installed
  plugins it is incompatible with.
- Every download is checked against its published checksum (Modrinth SHA-512/SHA-1, CurseForge fingerprint, Hangar
  SHA-256); a file that doesn't match is removed and the previous jar is restored.
- Switching versions is safe: a jar with the same name is kept as a backup until the new one is verified and restored
  on failure, and a leftover old jar or backup is reported by name instead of being left silently.
- CurseForge files whose authors disallow third-party downloads are marked "Manual download": install the identical
  file from Modrinth when it exists, or download it from CurseForge and upload it, which is checked by fingerprint.
- Added a "Server software" panel that shows the detected software, Minecraft version and build/loader version with
  where each came from, the evidence and any conflicts, and lets you set the software manually (saved in
  `/.mc-plugins-installer.json`) or clear that override.
- Improved detection: Folia, hybrid servers (Mohist, Arclight, Youer), proxy versions, the Paper/Purpur build,
  snapshots and pre-releases, stale logs and leftover config files (an old `purpur.yml` no longer makes a Paper server
  Purpur), the newest `versions/` folder, and launch arguments. Mod-loader and vanilla servers get a short explanation
  instead of the plugin pages.
- Installing a build for another platform is blocked (with the reason), and the Installed list flags jars built for a
  different platform and plugins installed twice.
- The plugin pages now need only `files.read`; identification, update checks and log reading use `files.read-content`
  when the user has it.
- Installed jars are hashed by the extension's backend in batches and cached; `.JAR` files in any case are listed.
- CurseForge lookups are cached (fingerprints for 24 hours) and rate limited per user, and errors no longer include
  request details.
- Plugin titles and file names are shown as plain text, description links are limited to http(s) and description
  images no longer send a referrer.
- All texts are translatable.

## 1.1.3

- Works with panel 1.2.11

## 1.1.2

- Works with panel 1.2.10

## 1.1.1

- Works with panel 1.2.6 (now required)

## 1.1.0

- Added CurseForge as a plugin source: browse, view, install and switch versions of CurseForge Bukkit plugins.
- Added identification of installed jars published on CurseForge.
- Added an admin configuration page for the CurseForge API key, with a key test, and the `mcplugins.read` /
  `mcplugins.manage` admin permissions.
- Versions whose authors disallow third-party downloads are marked "CurseForge only" and cannot be installed.
- Redesigned the Browse, Plugin Details, Versions and Install pages to match the Modpack Installer: provider marks,
  loader and version badges, a "Match server" / "Compatible only" switch, and filters kept in the URL.
- Plugin descriptions are rendered with the panel's own Markdown renderer.

## 1.0.0

- Added the ability to enable or disable installed Minecraft plugins.
- Added the ability to switch the version of an installed Minecraft plugin.
- Added a badge to show the detected Plugin Loader and Minecraft version.
- Added an alert if the Plugin Loader or Minecraft version cannot be detected.
- Added pagination and search filters to the Versions tab on the Plugin Details page.
- Redesigned the user interface for the Browse and Manage Plugins pages.
- Redesigned the Versions tab on the Plugin Details page to display versions in a table.
- Improved the Install Plugin modal UI to allow loader and version selection, which automatically defaults to the
  detected Plugin Loader and Minecraft version.
