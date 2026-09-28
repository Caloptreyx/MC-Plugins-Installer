import { axiosInstance } from '@/api/axios.ts';
import createDirectory from '@/api/server/files/createDirectory.ts';
import deleteFiles from '@/api/server/files/deleteFiles.ts';
import getFileFingerprint from '@/api/server/files/getFileFingerprint.ts';
import renameFiles from '@/api/server/files/renameFiles.ts';
import type { PluginSummary, PluginVersion } from './catalog.ts';
import { identifyByFingerprints } from './curseforge.ts';
import { identifyByHashes } from './modrinth.ts';
import { type DirectoryEntry, listDirectory, mapConcurrent } from './serverFiles.ts';

export const PLUGINS_DIRECTORY = '/plugins';

/** Suffix that keeps a jar in the plugins folder without the server loading it. */
export const DISABLED_SUFFIX = '.disabled';

export interface InstalledPlugin {
  /** Name on disk, including the disabled suffix when present. */
  fileName: string;
  /** The jar name the plugin has when enabled. */
  jarName: string;
  enabled: boolean;
  size: number;
  modified: Date;
  /** Matching published version, `null` when the jar is on neither Modrinth nor CurseForge. */
  version: PluginVersion | null;
  project: PluginSummary | null;
}

type Fingerprint = 'sha1' | 'curseforge';

// Hashing asks the node to read every jar, so results are reused while a file stays unchanged.
// Keyed by jar name so enabling/disabling (a rename) does not force a re-hash.
const fingerprintCache = new Map<string, string>();

async function fingerprintOf(uuid: string, entry: DirectoryEntry, jarName: string, algorithm: Fingerprint) {
  const key = `${uuid}:${algorithm}:${jarName}:${entry.size}:${entry.modified.getTime()}`;
  const cached = fingerprintCache.get(key);
  if (cached) return cached;

  const value = await getFileFingerprint(uuid, `${PLUGINS_DIRECTORY}/${entry.name}`, algorithm).catch(() => null);
  if (value) fingerprintCache.set(key, value);
  return value;
}

const jarNameOf = (fileName: string) =>
  fileName.endsWith(DISABLED_SUFFIX) ? fileName.slice(0, -DISABLED_SUFFIX.length) : fileName;

/**
 * Plugin jars in the server's plugins folder. Jars are identified on Modrinth by SHA-1 and, when
 * CurseForge is configured, the rest on CurseForge by its fingerprint.
 */
export async function loadInstalledPlugins(uuid: string, curseforgeEnabled: boolean): Promise<InstalledPlugin[]> {
  const entries = (await listDirectory(uuid, PLUGINS_DIRECTORY)) ?? [];
  const jars = entries.filter(
    (entry) => entry.file && (entry.name.endsWith('.jar') || entry.name.endsWith(`.jar${DISABLED_SUFFIX}`)),
  );

  const sha1s = await mapConcurrent(jars, 6, (entry) => fingerprintOf(uuid, entry, jarNameOf(entry.name), 'sha1'));
  const onModrinth = await identifyByHashes(sha1s.filter((hash): hash is string => hash !== null));
  const identified = jars.map((_, index) => (sha1s[index] && onModrinth.get(sha1s[index])) || null);

  if (curseforgeEnabled) {
    const unknown = jars.flatMap((entry, index) => (identified[index] ? [] : [index]));
    const fingerprints = await mapConcurrent(unknown, 6, (index) =>
      fingerprintOf(uuid, jars[index], jarNameOf(jars[index].name), 'curseforge'),
    );
    const onCurseforge = await identifyByFingerprints(
      uuid,
      fingerprints.filter((fingerprint): fingerprint is string => fingerprint !== null),
    );
    unknown.forEach((jarIndex, index) => {
      identified[jarIndex] = (fingerprints[index] && onCurseforge.get(fingerprints[index])) || null;
    });
  }

  return jars
    .map((entry, index) => ({
      fileName: entry.name,
      jarName: jarNameOf(entry.name),
      enabled: !entry.name.endsWith(DISABLED_SUFFIX),
      size: entry.size,
      modified: entry.modified,
      version: identified[index]?.version ?? null,
      project: identified[index]?.project ?? null,
    }))
    .sort((a, b) => pluginDisplayName(a).localeCompare(pluginDisplayName(b)));
}

export const pluginDisplayName = (plugin: InstalledPlugin) =>
  plugin.project?.title ?? plugin.jarName.replace(/\.jar$/, '');

export async function setPluginEnabled(uuid: string, plugin: InstalledPlugin, enabled: boolean) {
  await renameFiles({
    uuid,
    root: PLUGINS_DIRECTORY,
    files: [{ from: plugin.fileName, to: enabled ? plugin.jarName : `${plugin.jarName}${DISABLED_SUFFIX}` }],
  });
}

export async function deletePlugin(uuid: string, plugin: InstalledPlugin) {
  await deleteFiles(uuid, PLUGINS_DIRECTORY, [plugin.fileName]);
}

/** Downloads a file into the plugins folder and resolves once the node has finished writing it. */
async function pullIntoPlugins(uuid: string, url: string, name: string) {
  await axiosInstance.post(`/api/client/servers/${uuid}/files/pull`, {
    root: PLUGINS_DIRECTORY,
    url,
    name,
    foreground: true,
  });
}

/**
 * Installs `version` into the plugins folder. When `replacing` is given (switching versions or
 * reinstalling), the old jar is removed only after the new one is on disk, and the new jar keeps
 * the old one's enabled/disabled state.
 */
export async function installPluginVersion(uuid: string, version: PluginVersion, replacing: InstalledPlugin | null) {
  const file = version.file;
  if (!file) throw new Error(`Version ${version.versionNumber} has no downloadable jar.`);
  if (!file.url) {
    throw new Error(`The author of this plugin does not allow third-party downloads of ${version.versionNumber}.`);
  }

  const jarName = file.filename.replace(/[/\\]/g, '_');
  const targetName = replacing && !replacing.enabled ? `${jarName}${DISABLED_SUFFIX}` : jarName;

  if ((await listDirectory(uuid, PLUGINS_DIRECTORY)) === null) {
    await createDirectory(uuid, '/', PLUGINS_DIRECTORY.slice(1));
  }

  if (!replacing) {
    await pullIntoPlugins(uuid, file.url, targetName);
    return;
  }

  if (replacing.fileName !== targetName) {
    await pullIntoPlugins(uuid, file.url, targetName);
    await deleteFiles(uuid, PLUGINS_DIRECTORY, [replacing.fileName]);
    return;
  }

  // Same file name for both versions: move the old jar aside so a failed download can be undone.
  const backupName = `${replacing.fileName}.backup`;
  await renameFiles({ uuid, root: PLUGINS_DIRECTORY, files: [{ from: replacing.fileName, to: backupName }] });
  try {
    await pullIntoPlugins(uuid, file.url, targetName);
  } catch (error) {
    await renameFiles({ uuid, root: PLUGINS_DIRECTORY, files: [{ from: backupName, to: replacing.fileName }] });
    throw error;
  }
  await deleteFiles(uuid, PLUGINS_DIRECTORY, [backupName]);
}
