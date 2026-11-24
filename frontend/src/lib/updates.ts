import type { InstalledPlugin } from './plugins.ts';
import { fileFor, type PluginVersion, type VersionChannel } from './catalog.ts';
import { compatibleLoaders, type PluginLoader, runsOn } from './loaders.ts';
import { latestVersions } from './modrinth.ts';

export interface UpdateTarget {
  loader: PluginLoader;
  /** `null` on proxies or when the Minecraft version is unknown: any version. */
  gameVersion: string | null;
  channels: VersionChannel[];
}

const isNewer = (candidate: PluginVersion, current: PluginVersion) =>
  candidate.id !== current.id && Date.parse(candidate.published) > Date.parse(current.published);

/** The newest candidate that runs on the target and is newer than what is installed. */
function newestCandidate(current: PluginVersion, candidates: PluginVersion[], target: UpdateTarget) {
  return (
    candidates
      .filter(
        (candidate) =>
          target.channels.includes(candidate.channel) &&
          runsOn(candidate.loaders, target.loader) &&
          (!target.gameVersion ||
            candidate.gameVersions.length === 0 ||
            candidate.gameVersions.includes(target.gameVersion)) &&
          fileFor(candidate, target.loader) !== null &&
          isNewer(candidate, current),
      )
      .sort((a, b) => Date.parse(b.published) - Date.parse(a.published))[0] ?? null
  );
}

/**
 * Newer versions of identified plugins, keyed by file name: Modrinth through its update lookup by SHA-1, CurseForge
 * from the fingerprint match's latest files, Hangar from the project's versions.
 */
export async function findUpdates(
  plugins: InstalledPlugin[],
  target: UpdateTarget,
): Promise<Map<string, PluginVersion>> {
  const updates = new Map<string, PluginVersion>();

  const modrinth = plugins.filter((plugin) => plugin.version?.source === 'modrinth' && plugin.sha1);
  const latest = await latestVersions(
    modrinth.map((plugin) => plugin.sha1!),
    compatibleLoaders(target.loader),
    target.gameVersion ? [target.gameVersion] : [],
    target.channels,
  );
  for (const plugin of modrinth) {
    const candidate = latest.get(plugin.sha1!);
    if (candidate && fileFor(candidate, target.loader) && isNewer(candidate, plugin.version!)) {
      updates.set(plugin.fileName, candidate);
    }
  }

  for (const plugin of plugins) {
    if (!plugin.version || !plugin.latestFiles || plugin.version.source === 'modrinth') continue;
    const candidate = newestCandidate(plugin.version, plugin.latestFiles, target);
    if (candidate) updates.set(plugin.fileName, candidate);
  }

  return updates;
}
