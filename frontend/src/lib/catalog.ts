import * as curseforge from './curseforge.ts';
import * as modrinth from './modrinth.ts';

/** Where a plugin is published. Modrinth is always available; CurseForge needs an admin-set API key. */
export type PluginSource = 'modrinth' | 'curseforge';

export const SOURCE_LABELS: Record<PluginSource, string> = { modrinth: 'Modrinth', curseforge: 'CurseForge' };

/** What each source calls the count in `PluginSummary.follows`. */
export const FOLLOW_LABELS: Record<PluginSource, string> = { modrinth: 'followers', curseforge: 'likes' };

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
  /** Modrinth followers or CurseForge thumbs-up. */
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
  /** Modrinth writes Markdown, CurseForge HTML. */
  bodyFormat: 'markdown' | 'html';
  license: string | null;
  links: { label: string; url: string }[];
}

export interface VersionFile {
  /** `null` when the author does not allow third-party downloads. */
  url: string | null;
  filename: string;
  size: number;
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
  /** The jar this version installs, `null` when it has none. */
  file: VersionFile | null;
}

export interface CategoryOption {
  id: string;
  name: string;
}

export interface SearchParams {
  query: string;
  /** Modrinth loader ids a result must support; CurseForge only lists Bukkit plugins. */
  loaders: string[];
  gameVersion: string | null;
  category: string | null;
  sort: SearchSort;
  page: number;
  perPage: number;
}

/** Stable key of a project across sources. */
export const projectKey = (source: PluginSource, id: string) => `${source}:${id}`;

export const searchPlugins = (source: PluginSource, serverUuid: string, params: SearchParams) =>
  source === 'modrinth' ? modrinth.searchPlugins(params) : curseforge.searchPlugins(serverUuid, params);

export const getProject = (source: PluginSource, serverUuid: string, id: string) =>
  source === 'modrinth' ? modrinth.getProject(id) : curseforge.getProject(serverUuid, id);

/** Every version of a project, newest first. */
export const getProjectVersions = (source: PluginSource, serverUuid: string, id: string) =>
  source === 'modrinth' ? modrinth.getProjectVersions(id) : curseforge.getProjectVersions(serverUuid, id);

export const getCategories = (source: PluginSource, serverUuid: string) =>
  source === 'modrinth' ? modrinth.getPluginCategories() : curseforge.getCategories(serverUuid);
