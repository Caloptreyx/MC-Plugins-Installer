# Changelog

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
