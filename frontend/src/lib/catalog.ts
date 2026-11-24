import * as curseforge from './curseforge.ts';
import * as hangar from './hangar.ts';
import { type PluginLoader, runsOn } from './loaders.ts';
import * as modrinth from './modrinth.ts';

/** Where a plugin is published. Modrinth and Hangar are always available; CurseForge needs an admin-set API key. */
export type PluginSource = 'modrinth' | 'curseforge' | 'hangar';

export const PLUGIN_SOURCES: PluginSource[] = ['modrinth', 'curseforge', 'hangar'];

export const SOURCE_LABELS: Record<PluginSource, string> = {
  modrinth: 'Modrinth',
  curseforge: 'CurseForge',
  hangar: 'Hangar',
};

export const isPluginSource = (value: string | null | undefined): value is PluginSource =>
  value === 'modrinth' || value === 'curseforge' || value === 'hangar';

export type VersionChannel = 'release' | 'beta' | 'alpha';

export type SearchSort = 'relevance' | 'downloads' | 'follows' | 'newest' | 'updated';

export interface PluginSummary {
  source: PluginSource;
  id: string;
  slug: string;
  title: string;
  description: string;
  author: string;
  iconUrl: string | null;
  downloads: number;
  /** Modrinth followers, CurseForge thumbs-up or Hangar stars. */
  follows: number;
  /** Display names of content categories. */
  categories: string[];
  updated: string | null;
  /** The plugin's page on its source site. */
  url: string;
  /** Plugin loaders the plugin is published for (Modrinth ids). */
  loaders: string[];
  /** Minecraft releases the plugin supports, newest first. */
  gameVersions: string[];
}

export interface PluginProject extends PluginSummary {
  body: string;
  /** Modrinth and Hangar write Markdown, CurseForge HTML. */
  bodyFormat: 'markdown' | 'html';
  license: string | null;
  links: { label: string; url: string }[];
}

export interface FileHashes {
  sha1?: string;
  sha256?: string;
  sha512?: string;
}

export interface VersionFile {
  /** Direct download from an allow-listed host; `null` when the file can't be installed from here. */
  url: string | null;
  /** Hangar versions hosted elsewhere ("External download"): only a link for the user. */
  externalUrl: string | null;
  filename: string;
  size: number;
  hashes: FileHashes;
  /** CurseForge (murmur2) fingerprint as a decimal string. */
  fingerprint: string | null;
}

/** Hangar platforms that have their own download per version. */
export type HangarPlatform = 'paper' | 'velocity' | 'waterfall';

export type DependencyKind = 'required' | 'optional' | 'incompatible';

export interface VersionDependency {
  /** Project id on the same source; `null` when the dependency lives elsewhere (Hangar external links). */
  projectId: string | null;
  /** Name when the source gives one (Hangar). */
  name: string | null;
  kind: DependencyKind;
  externalUrl: string | null;
  /** Hangar dependencies apply to one platform. */
  platform: HangarPlatform | null;
}

export interface PluginVersion {
  source: PluginSource;
  id: string;
  projectId: string;
  name: string;
  versionNumber: string;
  channel: VersionChannel;
  loaders: string[];
  gameVersions: string[];
  downloads: number;
  published: string;
  /** The jar this version installs (Hangar: the Paper one, else the first platform), `null` when it has none. */
  file: VersionFile | null;
  /** Hangar: one file per platform. */
  platformFiles: Partial<Record<HangarPlatform, VersionFile>> | null;
  dependencies: VersionDependency[];
}

export interface CategoryOption {
  id: string;
  name: string;
}

export interface SearchParams {
  query: string;
  /** The server platform to match; its compatible loaders are searched (Modrinth) or its platform (Hangar). */
  loader: PluginLoader | null;
  gameVersion: string | null;
  category: string | null;
  sort: SearchSort;
  page: number;
  perPage: number;
}

/** Stable key of a project across sources. */
export const projectKey = (source: PluginSource, id: string) => `${source}:${id}`;

/** The Hangar platform whose download runs on `loader` (`null`: Hangar has nothing for it). */
export function hangarPlatformFor(loader: PluginLoader | null): HangarPlatform | null {
  switch (loader) {
    case null:
    case 'paper':
    case 'purpur':
    case 'folia':
      return 'paper';
    case 'velocity':
      return 'velocity';
    case 'waterfall':
    case 'bungeecord':
      return 'waterfall';
    default:
      return null;
  }
}

/** The file of `version` to install on a server running `loader`. */
export function fileFor(version: PluginVersion, loader: PluginLoader | null): VersionFile | null {
  if (!version.platformFiles) return version.file;
  const platform = hangarPlatformFor(loader);
  return platform ? (version.platformFiles[platform] ?? null) : null;
}

/** How a version's file can be installed: directly, by uploading it ("Manual download"), only via a link, or not at all. */
export type FileAvailability = 'download' | 'manual' | 'external' | 'none';

/** Versions that run on `loader` (when known) and list `gameVersion` (when given). */
export const compatibleVersions = (
  versions: PluginVersion[],
  loader: PluginLoader | null,
  gameVersion: string | null,
) =>
  versions.filter(
    (version) =>
      (!loader || runsOn(version.loaders, loader)) && (!gameVersion || version.gameVersions.includes(gameVersion)),
  );

/** The newest installable release among `candidates` (newest first), then the newest installable pre-release, then the newest. */
export function preferredVersion(candidates: PluginVersion[], loader: PluginLoader | null) {
  const installable = candidates.filter(
    (version) => fileAvailability(version.source, fileFor(version, loader)) === 'download',
  );
  return installable.find((version) => version.channel === 'release') ?? installable[0] ?? candidates[0] ?? null;
}

export function fileAvailability(source: PluginSource, file: VersionFile | null): FileAvailability {
  if (!file) return 'none';
  if (file.url) return 'download';
  if (file.externalUrl) return 'external';
  // CurseForge files whose authors disallow third-party downloads can still be uploaded by hand.
  return source === 'curseforge' && file.fingerprint ? 'manual' : 'none';
}

export const searchPlugins = (source: PluginSource, serverUuid: string, params: SearchParams) =>
  source === 'modrinth'
    ? modrinth.searchPlugins(params)
    : source === 'curseforge'
      ? curseforge.searchPlugins(serverUuid, params)
      : hangar.searchPlugins(serverUuid, params);

export const getProject = (source: PluginSource, serverUuid: string, id: string) =>
  source === 'modrinth'
    ? modrinth.getProject(id)
    : source === 'curseforge'
      ? curseforge.getProject(serverUuid, id)
      : hangar.getProject(serverUuid, id);

/** Every version of a project, newest first. */
export const getProjectVersions = (source: PluginSource, serverUuid: string, id: string) =>
  source === 'modrinth'
    ? modrinth.getProjectVersions(id)
    : source === 'curseforge'
      ? curseforge.getProjectVersions(serverUuid, id)
      : hangar.getProjectVersions(serverUuid, id);

export const getCategories = (source: PluginSource, serverUuid: string) =>
  source === 'modrinth'
    ? modrinth.getPluginCategories()
    : source === 'curseforge'
      ? curseforge.getCategories(serverUuid)
      : Promise.resolve(hangar.CATEGORIES);
