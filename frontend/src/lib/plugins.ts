import { z } from 'zod';
import { axiosInstance } from '@/api/axios.ts';
import deleteFiles from '@/api/server/files/deleteFiles.ts';
import renameFiles from '@/api/server/files/renameFiles.ts';
import { parseFromApi } from '@/lib/serialization/api-transform.ts';
import type { PluginSummary, PluginVersion } from './catalog.ts';
import type { InstalledRecord } from './stateFormat.ts';
import { identifyByFingerprints } from './curseforge.ts';
import { DISABLED_SUFFIX, jarNameOf } from './fileRules.ts';
import * as hangar from './hangar.ts';
import { isPluginLoader, type PluginLoader, runsOn } from './loaders.ts';
import { identifyByHashes, versionsWithFile } from './modrinth.ts';
import { forgetInstalled, readStateFile } from './stateFile.ts';

export const PLUGINS_DIRECTORY = '/plugins';

export interface InstalledPlugin {
  /** Name on disk, including the disabled suffix when present. */
  fileName: string;
  /** The jar name the plugin has when enabled. */
  jarName: string;
  enabled: boolean;
  size: number;
  modified: Date;
  sha1: string | null;
  sha256: string | null;
  /** CurseForge fingerprint (decimal). */
  fingerprint: string | null;
  /** Matching published version, `null` when the jar is not identified. */
  version: PluginVersion | null;
  project: PluginSummary | null;
  /** CurseForge: the project's newest files; Hangar: the project's versions. Used for the update check. */
  latestFiles: PluginVersion[] | null;
  /** Hangar: the install record that identified this jar. */
  record: InstalledRecord | null;
}

export interface InstalledPlugins {
  plugins: InstalledPlugin[];
  /** Files an interrupted switch or upload left behind (`*.jar.backup`, `.mcpi-upload-*`). */
  leftovers: string[];
  /** Whether jars could be hashed (needs `files.read-content`), i.e. identified at all. */
  hashed: boolean;
}

const listingSchema = z.object({
  plugins: z.array(
    z.object({
      fileName: z.string(),
      enabled: z.boolean(),
      size: z.number(),
      modified: z.string(),
      sha1: z.string().nullable(),
      sha256: z.string().nullable(),
      curseforge: z.string().nullable(),
    }),
  ),
  leftovers: z.array(z.string()),
  hashed: z.boolean(),
});

export const pluginDisplayName = (plugin: InstalledPlugin) =>
  plugin.project?.title ?? plugin.jarName.replace(/\.jar$/i, '');

/**
 * Hangar has no hash lookup: jars are recognised by the record written when they were installed from here (same jar
 * name and SHA-256). Checked first, so a Hangar jar whose file Modrinth also publishes still shows as Hangar.
 */
async function identifyHangar(uuid: string, records: InstalledRecord[], plugins: InstalledPlugin[]) {
  const matched = plugins.flatMap((plugin) => {
    const record = records.find(
      (entry) =>
        plugin.sha256 && entry.sha256 === plugin.sha256 && entry.file.toLowerCase() === plugin.jarName.toLowerCase(),
    );
    return record ? [{ plugin, record }] : [];
  });

  const projectIds = [...new Set(matched.map(({ record }) => record.project))];
  const projects = await Promise.all(
    projectIds.map(async (id) => {
      try {
        const [project, versions] = await Promise.all([
          hangar.getProject(uuid, id),
          hangar.getProjectVersions(uuid, id),
        ]);
        return [id, { project, versions }] as const;
      } catch {
        return [id, null] as const;
      }
    }),
  );
  const byId = new Map(projects);

  for (const { plugin, record } of matched) {
    const found = byId.get(record.project);
    if (!found) continue;
    plugin.project = found.project;
    plugin.latestFiles = found.versions;
    plugin.version = found.versions.find((version) => version.id === record.version) ?? null;
    plugin.record = record;
  }
}

/** Whether a version runs on the server (or, while the server platform is unknown, on any plugin platform). */
const fitsServer = (version: PluginVersion, loader: PluginLoader | null) =>
  loader ? runsOn(version.loaders, loader) : version.loaders.some(isPluginLoader);

/**
 * The hash lookup returns one version per file, but authors attach the same jar to several versions (e.g. one for
 * Fabric and one for Paper/Velocity). When that one doesn't fit the server, use another version with the same file.
 */
async function pickFittingModrinthVersions(plugins: InstalledPlugin[], loader: PluginLoader | null) {
  const misfits = plugins.filter(
    (plugin) => plugin.version?.source === 'modrinth' && plugin.sha1 && !fitsServer(plugin.version, loader),
  );
  await Promise.all(
    misfits.map(async (plugin) => {
      const alternatives = await versionsWithFile(plugin.version!.projectId, plugin.sha1!).catch(
        (): PluginVersion[] => [],
      );
      const fitting = alternatives.find((version) => fitsServer(version, loader));
      if (fitting) plugin.version = fitting;
    }),
  );
}

/**
 * Plugin jars in the server's plugins folder, hashed by this extension's backend. Jars are identified by Hangar install
 * records, then on Modrinth by SHA-1, then on CurseForge by fingerprint (when configured). `loader` is the server's
 * platform, used to pick the right Modrinth version when one file is published for several platforms.
 */
export async function loadInstalledPlugins(
  uuid: string,
  curseforgeEnabled: boolean,
  loader: PluginLoader | null,
): Promise<InstalledPlugins> {
  const { data } = await axiosInstance.get(`/api/client/servers/${uuid}/mcplugins/plugins`);
  const listing = parseFromApi(listingSchema, data);

  const plugins: InstalledPlugin[] = listing.plugins.map((entry) => ({
    fileName: entry.fileName,
    jarName: jarNameOf(entry.fileName),
    enabled: entry.enabled,
    size: entry.size,
    modified: new Date(entry.modified),
    sha1: entry.sha1,
    sha256: entry.sha256?.toLowerCase() ?? null,
    fingerprint: entry.curseforge,
    version: null,
    project: null,
    latestFiles: null,
    record: null,
  }));

  if (listing.hashed) {
    const records = await readStateFile(uuid)
      .then(({ state }) => state.installed)
      .catch((): InstalledRecord[] => []);
    if (records.length > 0) await identifyHangar(uuid, records, plugins);

    const forModrinth = plugins.filter((plugin) => !plugin.project && plugin.sha1);
    const onModrinth = await identifyByHashes(forModrinth.map((plugin) => plugin.sha1!));
    for (const plugin of forModrinth) {
      const match = onModrinth.get(plugin.sha1!);
      if (match) Object.assign(plugin, match);
    }
    await pickFittingModrinthVersions(plugins, loader);

    if (curseforgeEnabled) {
      const unknown = plugins.filter((plugin) => !plugin.project && plugin.fingerprint);
      const onCurseforge = await identifyByFingerprints(
        uuid,
        unknown.map((plugin) => plugin.fingerprint!),
      );
      for (const plugin of unknown) {
        const match = onCurseforge.get(plugin.fingerprint!);
        if (match) Object.assign(plugin, match);
      }
    }
  }

  return {
    plugins: plugins.sort((a, b) => pluginDisplayName(a).localeCompare(pluginDisplayName(b))),
    leftovers: listing.leftovers,
    hashed: listing.hashed,
  };
}

/**
 * Enabled jars of a plugin that has more than one enabled jar (the same project, or the same title from another
 * source): the server refuses to load a plugin twice. Keyed by file name.
 */
export function duplicateFiles(plugins: InstalledPlugin[]): Set<string> {
  const byTitle = new Map<string, InstalledPlugin[]>();
  for (const plugin of plugins) {
    if (!plugin.project || !plugin.enabled) continue;
    const key = plugin.project.title.trim().toLowerCase();
    byTitle.set(key, [...(byTitle.get(key) ?? []), plugin]);
  }
  return new Set(
    [...byTitle.values()]
      .filter((group) => group.length > 1)
      .flatMap((group) => group.map((plugin) => plugin.fileName)),
  );
}

/** Core file routes skip files on a subuser's ignore list and report 0 instead of failing. */
export class FileActionError extends Error {
  readonly kind: 'rename' | 'delete' | 'exists';
  readonly fileName: string;

  constructor(kind: 'rename' | 'delete' | 'exists', fileName: string) {
    super(`${kind}: ${fileName}`);
    this.kind = kind;
    this.fileName = fileName;
  }
}

export async function renameInPlugins(uuid: string, from: string, to: string) {
  const { renamed } = await renameFiles({ uuid, root: PLUGINS_DIRECTORY, files: [{ from, to }] });
  if (!renamed) throw new FileActionError('rename', from);
}

export async function deleteInPlugins(uuid: string, fileName: string) {
  const { deleted } = await deleteFiles(uuid, PLUGINS_DIRECTORY, [fileName]);
  if (!deleted) throw new FileActionError('delete', fileName);
}

export async function setPluginEnabled(
  uuid: string,
  plugin: InstalledPlugin,
  enabled: boolean,
  existing: readonly string[],
) {
  const target = enabled ? plugin.jarName : `${plugin.jarName}${DISABLED_SUFFIX}`;
  // Enabling `x.jar.disabled` next to an existing `x.jar` would overwrite it.
  if (existing.some((name) => name.toLowerCase() === target.toLowerCase())) {
    throw new FileActionError('exists', target);
  }
  await renameInPlugins(uuid, plugin.fileName, target);
}

export async function deletePlugin(uuid: string, plugin: InstalledPlugin) {
  await deleteInPlugins(uuid, plugin.fileName);
  if (plugin.record) await forgetInstalled(uuid, [plugin.record.file]).catch(() => undefined);
}
