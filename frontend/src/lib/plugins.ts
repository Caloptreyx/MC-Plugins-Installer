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
import { identifyByHashes } from './modrinth.ts';
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

/** Hangar has no hash lookup: jars are recognised by the record written when they were installed from here. */
async function identifyHangar(uuid: string, records: InstalledRecord[], unknown: InstalledPlugin[]) {
  const matched = unknown.flatMap((plugin) => {
    const record = records.find((entry) => plugin.sha256 && entry.sha256 === plugin.sha256);
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

/**
 * Plugin jars in the server's plugins folder, hashed by this extension's backend. Jars are identified on Modrinth by
 * SHA-1, then on CurseForge by fingerprint (when configured), then by Hangar install records.
 */
export async function loadInstalledPlugins(uuid: string, curseforgeEnabled: boolean): Promise<InstalledPlugins> {
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
    const onModrinth = await identifyByHashes(plugins.flatMap((plugin) => (plugin.sha1 ? [plugin.sha1] : [])));
    for (const plugin of plugins) {
      const match = plugin.sha1 ? onModrinth.get(plugin.sha1) : undefined;
      if (match) Object.assign(plugin, match);
    }

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

    const unknown = plugins.filter((plugin) => !plugin.project);
    if (unknown.length > 0) {
      const records = await readStateFile(uuid)
        .then(({ state }) => state.installed)
        .catch((): InstalledRecord[] => []);
      if (records.length > 0) await identifyHangar(uuid, records, unknown);
    }
  }

  return {
    plugins: plugins.sort((a, b) => pluginDisplayName(a).localeCompare(pluginDisplayName(b))),
    leftovers: listing.leftovers,
    hashed: listing.hashed,
  };
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
