import { defineTranslations } from 'shared';

const translations = defineTranslations({
  items: {},
  translations: {
    admin: {
      curseforge: {
        enabled: 'Enabled',
        notConfigured: 'Not configured',
        description:
          "Plugins from Modrinth and Hangar are always available. To also offer CurseForge's Bukkit plugins, enter a CurseForge API key from the {console}. The key is stored encrypted and is never sent to users.",
        console: 'CurseForge for Studios console',
        key: 'API key',
        replaceKey: 'Replace API key',
        keepPlaceholder: 'Leave empty to keep the stored key',
        pastePlaceholder: 'Paste your CurseForge API key',
        save: 'Save',
        testKey: 'Test this key',
        testStoredKey: 'Test stored key',
        removeKey: 'Remove key',
        toast: {
          accepted: 'CurseForge accepted the API key.',
          saved: 'CurseForge API key saved.',
          removed: 'CurseForge API key removed.',
        },
      },
    },
    pages: {
      server: {
        plugins: {
          title: 'Plugins',
          subtitle: 'Find, install, update and manage the plugins on this server.',
          tabs: {
            browse: 'Browse',
            installed: 'Installed',
          },
          status: {
            installed: 'Installed',
            disabled: 'Disabled',
          },
          channel: {
            release: 'Release',
            beta: 'Beta',
            alpha: 'Alpha',
          },
          availability: {
            manual: 'Manual download',
            external: 'External download',
          },
          actions: {
            install: 'Install',
            switch: 'Switch',
            switchVersion: 'Switch version',
            enable: 'Enable plugin',
            disable: 'Disable plugin',
            delete: 'Delete',
            refresh: 'Refresh',
            browse: 'Browse plugins',
            cancel: 'Cancel',
            close: 'Close',
          },
          common: {
            anyLoader: 'Any loader',
            anyVersion: 'Any version',
            byAuthor: 'by {author}',
            detectedOption: '{value} (detected)',
            detectedUnsupportedOption: '{value} (detected, not supported)',
            downloadsCount: '{count} downloads',
            followsCount: {
              modrinth: '{count} followers',
              curseforge: '{count} likes',
              hangar: '{count} stars',
            },
          },
          hangarCategories: {
            admin_tools: 'Admin tools',
            chat: 'Chat',
            dev_tools: 'Developer tools',
            economy: 'Economy',
            gameplay: 'Gameplay',
            games: 'Games',
            protection: 'Protection',
            role_playing: 'Role playing',
            world_management: 'World management',
            misc: 'Miscellaneous',
          },
          browse: {
            searchPlaceholder: 'Search plugins…',
            sortLabel: 'Sort by',
            loaderLabel: 'Plugin loader',
            gameVersionLabel: 'Minecraft version',
            categoryLabel: 'Category',
            anyCategory: 'Any category',
            matchServer: 'Match server',
            matchServerHint: 'Only show plugins for {loader} on Minecraft {version}',
            clearFilters: 'Clear filters',
            curseforgeDisabled: 'An administrator has not set up CurseForge.',
            total: '{count} plugins',
            sort: {
              relevance: 'Relevance',
              downloads: 'Downloads',
              follows: {
                modrinth: 'Followers',
                curseforge: 'Rating',
                hangar: 'Stars',
              },
              newest: 'Newest',
              updated: 'Recently updated',
            },
            unsupported: {
              title: 'Not available from this source',
              curseforge:
                'CurseForge only lists Bukkit plugins, which do not run on {loader}. Browse Modrinth or Hangar instead, or pick a Bukkit-based loader (Paper, Purpur, Spigot or Bukkit).',
              hangar:
                'Hangar only has downloads for Paper, Velocity and Waterfall, none of which run on {loader}. Browse Modrinth or CurseForge instead.',
            },
            empty: {
              title: 'No plugins found',
              description: 'Try another search term, or loosen the loader, version and category filters.',
            },
          },
          details: {
            fallbackTitle: 'Plugin',
            back: 'Back to plugins',
            openOn: 'Open on {source}',
            downloads: 'Downloads',
            follows: {
              modrinth: 'Followers',
              curseforge: 'Likes',
              hangar: 'Stars',
            },
            updated: 'Updated',
            license: 'License',
            links: {
              source: 'Source',
              issues: 'Issues',
              wiki: 'Wiki',
              discord: 'Discord',
            },
            installedVersion: 'Version {version} is installed on this server.',
            installedVersionDisabled: 'Version {version} is installed on this server, but disabled.',
            installedUnknown: 'This plugin is installed on this server.',
            installedUnknownDisabled: 'This plugin is installed on this server, but disabled.',
            tabs: {
              description: 'Description',
              versions: 'Versions',
            },
            noDescription: 'This plugin has no description.',
          },
          versions: {
            searchPlaceholder: 'Search versions…',
            allChannels: 'All',
            compatibleOnly: 'Compatible only',
            empty: 'No versions match the filters',
            columns: {
              version: 'Version',
              channel: 'Type',
              gameVersions: 'Game versions',
              loaders: 'Loaders',
              published: 'Published',
              downloads: 'Downloads',
              size: 'Size',
            },
          },
          install: {
            title: 'Install {plugin}',
            switchTitle: 'Switch {plugin} version',
            current: 'Installed: {version}',
            currentDisabled: 'Installed: {version} (disabled)',
            loader: 'Plugin loader',
            loaderDetected: 'Detected from the server. If this is wrong, set the server software manually.',
            gameVersion: 'Minecraft version',
            version: 'Plugin version',
            preReleases: 'Show beta and alpha versions',
            noVersions: 'No version for this loader and Minecraft version.',
            fileHint:
              '{file} ({size}) is downloaded into the plugins folder and checked against its published checksum.',
            replaces: 'It replaces {file}.',
            replacesDisabled: 'It replaces {file} and stays disabled.',
            restartHint: 'Restart the server afterwards to load it.',
            blocked: {
              noCreate: 'You do not have permission to create files on this server.',
              noDelete: 'Replacing a plugin requires permission to delete files on this server.',
              noUpdate: 'Replacing a jar with the same name requires permission to rename files on this server.',
              alreadyInstalled: 'This version is already installed.',
              wrongPlatform: 'This version is built for {platforms}, but this server runs {server}.',
              noFile: 'This version has no jar for this platform.',
              external: 'This version is hosted outside Hangar (external download) and cannot be installed from here.',
            },
            warning: {
              gameVersion: 'This server runs Minecraft {version}, which this version does not list as supported.',
              notDetected:
                "The server software couldn't be detected. Make sure the loader you pick matches your server.",
            },
            failure: {
              title: 'The install failed',
              partialTitle: 'Installed, but a file is left over',
            },
            dependencies: {
              title: 'Required plugins',
              alsoInstall: 'Also install {plugin}',
              external: '{plugin} (install it yourself)',
              incompatible: 'This plugin is marked as incompatible with: {list}.',
            },
            toast: {
              installed: '{plugin} {version} was installed. Restart the server to load it.',
              switched: '{plugin} was switched to {version}. Restart the server to load it.',
              dependenciesFailed: 'Some required plugins were not installed: {list}',
            },
          },
          manual: {
            onModrinth:
              "The author doesn't allow this file to be downloaded outside CurseForge, but the identical file (same SHA-1) is published on Modrinth.",
            installFromModrinth: 'Install the identical file from Modrinth',
            explanation:
              "The author doesn't allow third-party downloads of {file}. Download it from CurseForge, then upload the .jar here: it is checked against CurseForge's fingerprint before it is installed.",
            openCurseforge: 'Open on CurseForge',
            uploadLabel: 'Downloaded .jar',
            uploadPlaceholder: 'Choose the .jar file',
            upload: 'Upload and install',
          },
          installed: {
            searchPlaceholder: 'Search installed plugins…',
            filter: {
              all: 'All',
              enabled: 'Enabled',
              disabled: 'Disabled',
              updates: 'Updates ({count})',
            },
            preReleaseUpdates: 'Include beta updates',
            counts: '{total} installed · {enabled} enabled · {disabled} disabled',
            updateAll: 'Update all ({count})',
            updateTo: 'Update to {version}',
            updateCheckFailed: "Couldn't check for updates: {error}",
            restartHint: 'Restart the server to apply plugin changes.',
            noReadContent:
              'You can see the plugin files, but identifying them, checking for updates and reading the server logs needs permission to read file contents.',
            leftovers: {
              title: 'Leftover files in the plugins folder',
              description:
                'An interrupted switch or upload left these files: {list}. A .backup file is the previous jar: rename it back if the plugin is missing, otherwise delete it in the file manager.',
            },
            columns: {
              plugin: 'Plugin',
              version: 'Version',
              source: 'Source',
              size: 'Size',
              enabled: 'Enabled',
            },
            unknown: 'Unknown',
            unknownHint: 'This jar was not found on Modrinth or Hangar, so it cannot switch versions.',
            unknownHintCurseforge:
              'This jar was not found on Modrinth, CurseForge or Hangar, so it cannot switch versions.',
            wrongPlatform: 'Wrong platform',
            wrongPlatformHint: 'This jar is built for {platforms}, but this server runs {server}. It may not load.',
            duplicate: 'Installed twice',
            duplicateHint:
              'This plugin is installed twice: Bukkit refuses to load both. Disable or delete one of the copies.',
            empty: {
              title: 'No plugins installed',
              description: 'The plugins folder of this server has no plugin jars yet.',
            },
            deleteModal: {
              title: 'Delete plugin',
              content: 'Delete {file} from the plugins folder? Its configuration folder is kept.',
            },
            toast: {
              enabled: '{plugin} enabled. Restart the server to apply the change.',
              disabled: '{plugin} disabled. Restart the server to apply the change.',
              deleted: '{plugin} deleted. Restart the server to apply the change.',
            },
          },
          updateAll: {
            title: 'Update plugins',
            description:
              'Pick the plugins to update. They are downloaded one at a time and each download is checked; the panel allows a few downloads per minute, so a long list may stop and ask you to continue later.',
            row: '{plugin}: {from} → {to}',
            updated: 'Updated',
            failed: 'Failed',
            start: 'Update {count}',
          },
          errors: {
            noFile: 'This version has no jar for this platform.',
            notDownloadable: 'This version cannot be downloaded from here.',
            unsafeFile: '{file} has a file name or download location that is not allowed.',
            noChecksum: 'The source publishes no checksum for {file}, so the download could not be verified.',
            exists: 'A file named {file} already exists in the plugins folder.',
            mismatch: "The downloaded {file} didn't match its published checksum and was removed again.",
            mismatchLeft:
              "The downloaded {file} didn't match its published checksum and could not be removed. Delete it before restarting the server.",
            uploadMismatch: "This isn't the file from CurseForge. It was removed again.",
            rateLimited: 'The panel allows only a few downloads per minute. Try again in {seconds} seconds.',
            oldNotRemoved:
              'The new version was installed, but the old file {file} could not be removed. Delete it before restarting: two copies stop the plugin from loading.',
            backupLeft: 'The new version was installed, but the backup {file} could not be removed. You can delete it.',
            restoreFailed:
              'The switch failed and the old jar could not be restored. It is still there as {file}: rename it back to restore the plugin.',
            renameSkipped: '{file} could not be renamed (it may be hidden from your account).',
            deleteSkipped: '{file} could not be deleted (it may be hidden from your account).',
            modrinthNotFound: 'Not found on Modrinth.',
            modrinthFailed: 'Modrinth request failed (HTTP {status}).',
          },
          // Server software panel, override modal and the "not a plugin server" state (detection).
          software: {
            title: 'Server software',
            open: 'Show how the server software was detected',
            refresh: 'Detect again',
            detecting: 'Detecting…',
            notDetected: 'Not detected',
            unknownVersion: 'Unknown version',
            anyVersion: 'Any version',
            minecraft: 'Minecraft {version}',
            warning: 'Some findings disagree. Open the details to check them.',
            fields: {
              software: 'Software',
              minecraftVersion: 'Minecraft version',
              loaderVersion: 'Build or loader version',
            },
            proxyVersion: 'Proxies serve every Minecraft version',
            from: 'From {source}, {confidence}',
            sources: {
              override: 'the manual override',
              args: 'the launch arguments',
              log: 'the server log',
              version_history: 'version_history.json',
              marker: 'an install marker',
              files: 'the server files',
              variables: 'the startup variables',
              egg: 'the egg and startup settings',
            },
            sourceNames: {
              override: 'Override',
              args: 'Launch arguments',
              log: 'Log',
              version_history: 'Version history',
              marker: 'Install marker',
              files: 'Files',
              variables: 'Variables',
              egg: 'Egg',
            },
            confidence: {
              high: 'high confidence',
              medium: 'medium confidence',
              low: 'low confidence',
            },
            families: {
              plugins: 'Plugin servers',
              hybrid: 'Hybrids (mods and plugins)',
              proxy: 'Proxies',
              mods: 'Mod loaders',
              vanilla: 'Vanilla',
            },
            evidence: {
              title: 'What was found',
              empty: 'Nothing on this server points to a server software yet.',
            },
            conflicts: {
              title: 'Disagreeing findings',
              description:
                'These point to something else. The detection follows the stronger source; findings marked as older than the install count least.',
            },
            staleBadge: 'Older than the install',
            stale: {
              log: {
                title: 'The log is older than the install',
                content:
                  'The server software changed after the last start, so the log counts less. Start the server once to refresh it.',
              },
              version_history: {
                title: 'version_history.json is older than the install',
                content:
                  'The server software changed after version_history.json was last written, so it counts less. Start the server once to refresh it.',
              },
              both: {
                title: 'The log and version_history.json are older than the install',
                content:
                  'The server software changed after the last start, so the log and version_history.json count less. Start the server once to refresh them.',
              },
            },
            noContent:
              "You can't read file contents on this server, so the log, launch arguments, install markers and the override file were not checked.",
            overrideProblem: {
              invalid: 'The override file is not valid and was ignored.',
              too_large: 'The override file is too large and was ignored.',
            },
            overrideDisagrees: {
              title: 'The override disagrees with the server files',
              content:
                'Files written since the last install point to other software or another Minecraft version than the one set manually. Check the findings below, then change or clear the override.',
            },
            overrideSetAt: 'Set manually on {date}.',
            setManually: 'Set manually…',
            clearOverride: 'Clear override',
            cleared: 'Override cleared. The server software is detected again.',
            saved: 'Server software saved.',
            noPermission: 'Changing the override needs permission to read, create, edit and delete files.',
            modal: {
              title: 'Set server software manually',
              description:
                'Saved in .mc-plugins-installer.json in the server root and used instead of the detection until you clear it.',
              software: 'Software',
              minecraftVersion: 'Minecraft version',
              minecraftVersionDescription: 'Leave empty to keep the detected version.',
              proxyHint: 'Proxies serve every Minecraft version, so none is needed.',
              loaderVersion: 'Build or loader version',
              loaderVersionDescription: 'Optional, for example a Paper build or a Velocity version.',
              invalidMinecraftVersion: 'Not a Minecraft version (for example 1.21.4, 26.1 or 24w14a).',
              invalidLoaderVersion: 'Use up to 64 letters, digits, dots, dashes and plus signs.',
              save: 'Save',
              cancel: 'Cancel',
            },
            alert: {
              softwareTitle: "Couldn't detect the server software",
              versionTitle: "Couldn't detect the Minecraft version",
              content:
                'Start the server once so it writes its files, then detect again, or set it manually. Until then, results are not narrowed to this server.',
            },
            unsupported: {
              title: "This server doesn't run a plugin platform",
              detected: 'Detected: {software}',
              notMinecraft: 'Nothing on this server points to a Minecraft server.',
              mods: '{software} loads mods, not plugins.',
              vanilla: "A vanilla server can't load plugins.",
              wrong: 'If this is wrong, set the server software manually.',
              adminHint: "Admins can hide the Plugins page for this egg in the egg configuration's page order.",
            },
          },
        },
      },
    },
  },
});

export const useExtTranslations = translations.useTranslations.bind(translations);
export const getExtTranslations = translations.getTranslations.bind(translations);

export default translations;
