import { z } from 'zod';
import { axiosInstance } from '@/api/axios.ts';
import { parseFromApi, parsePaginationFromApi } from '@/lib/serialization/api-transform.ts';
import type { CategoryOption, PluginProject, PluginSummary, PluginVersion, SearchParams } from './catalog.ts';
import { isAllowedDownload } from './fileRules.ts';

// CurseForge needs an API key, so it is reached through this extension's backend, which returns
// data already shaped like the shared plugin model.

const base = (serverUuid: string) => `/api/client/servers/${serverUuid}/mcplugins/curseforge`;

/** The backend accepts at most this many fingerprints per request. */
const FINGERPRINT_BATCH = 500;

const summarySchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  description: z.string(),
  author: z.string(),
  iconUrl: z.string().nullable(),
  downloads: z.number(),
  follows: z.number(),
  categories: z.array(z.string()),
  updated: z.string().nullable(),
  url: z.string(),
  gameVersions: z.array(z.string()),
});

const projectSchema = z.object({
  summary: summarySchema,
  body: z.string(),
  links: z.array(z.object({ label: z.string(), url: z.string() })),
});

const versionSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string(),
  versionNumber: z.string(),
  channel: z.enum(['release', 'beta', 'alpha']),
  gameVersions: z.array(z.string()),
  downloads: z.number(),
  published: z.string(),
  file: z
    .object({
      url: z.string().nullable(),
      filename: z.string(),
      size: z.number(),
      sha1: z.string().nullable(),
      fingerprint: z.string().nullable(),
    })
    .nullable(),
  dependencies: z.array(z.object({ projectId: z.string(), kind: z.enum(['required', 'optional', 'incompatible']) })),
});

const categorySchema = z.object({ id: z.string(), name: z.string() });

const matchSchema = z.object({
  fingerprint: z.number(),
  project: summarySchema,
  version: versionSchema,
  latestFiles: z.array(versionSchema),
});

// The "Bukkit Plugins" class is all CurseForge offers for servers.
const toSummary = (summary: z.infer<typeof summarySchema>): PluginSummary => ({
  source: 'curseforge',
  loaders: ['bukkit'],
  ...summary,
});

function toVersion(version: z.infer<typeof versionSchema>): PluginVersion {
  const { file, ...rest } = version;
  return {
    ...rest,
    // CurseForge file names are often just the plugin name ("DisguiseCraft.jar"); the display name ("v5.1") is the
    // version label its site shows.
    versionNumber: rest.name,
    source: 'curseforge',
    loaders: ['bukkit'],
    file: file && {
      url: file.url && isAllowedDownload('curseforge', file.url) ? file.url : null,
      externalUrl: null,
      filename: file.filename,
      size: file.size,
      hashes: file.sha1 ? { sha1: file.sha1 } : {},
      fingerprint: file.fingerprint,
    },
    platformFiles: null,
    dependencies: version.dependencies.map((dependency) => ({
      projectId: dependency.projectId,
      name: null,
      kind: dependency.kind,
      externalUrl: null,
      platform: null,
    })),
  };
}

/** Whether an administrator configured CurseForge. */
export async function getStatus(serverUuid: string): Promise<boolean> {
  const { data } = await axiosInstance.get(`${base(serverUuid)}/status`);
  return data.curseforge === true;
}

export async function searchPlugins(serverUuid: string, params: SearchParams): Promise<Pagination<PluginSummary>> {
  const { data } = await axiosInstance.get(`${base(serverUuid)}/search`, {
    params: {
      query: params.query || undefined,
      game_version: params.gameVersion ?? undefined,
      category: params.category ?? undefined,
      sort: params.sort,
      page: params.page,
      per_page: params.perPage,
    },
  });
  const page = parsePaginationFromApi(summarySchema, data.plugins);
  return { ...page, data: page.data.map(toSummary) };
}

export async function getProject(serverUuid: string, id: string): Promise<PluginProject> {
  const { data } = await axiosInstance.get(`${base(serverUuid)}/projects/${encodeURIComponent(id)}`);
  const project = parseFromApi(projectSchema, data.project);
  return {
    ...toSummary(project.summary),
    body: project.body,
    bodyFormat: 'html',
    license: null,
    links: project.links.map((link) => ({ label: link.label.toLowerCase(), url: link.url })),
  };
}

export async function getProjectVersions(serverUuid: string, id: string): Promise<PluginVersion[]> {
  const { data } = await axiosInstance.get(`${base(serverUuid)}/projects/${encodeURIComponent(id)}/versions`);
  return data.versions.map((version: unknown) => toVersion(parseFromApi(versionSchema, version)));
}

export async function getCategories(serverUuid: string): Promise<CategoryOption[]> {
  const { data } = await axiosInstance.get(`${base(serverUuid)}/categories`);
  return data.categories.map((category: unknown) => parseFromApi(categorySchema, category));
}

export interface FingerprintMatch {
  version: PluginVersion;
  project: PluginSummary;
  /** The project's newest files (per game version), newest first. */
  latestFiles: PluginVersion[];
}

/** Identifies jars by CurseForge fingerprint; unknown fingerprints are absent from the result. */
export async function identifyByFingerprints(
  serverUuid: string,
  fingerprints: string[],
): Promise<Map<string, FingerprintMatch>> {
  const matches = new Map<string, FingerprintMatch>();
  for (let start = 0; start < fingerprints.length; start += FINGERPRINT_BATCH) {
    const { data } = await axiosInstance.post(`${base(serverUuid)}/fingerprints`, {
      fingerprints: fingerprints.slice(start, start + FINGERPRINT_BATCH).map(Number),
    });
    for (const raw of data.matches) {
      const match = parseFromApi(matchSchema, raw);
      matches.set(String(match.fingerprint), {
        version: toVersion(match.version),
        project: toSummary(match.project),
        latestFiles: match.latestFiles.map(toVersion),
      });
    }
  }
  return matches;
}

/** The CurseForge page of one file, where users download files that can't be installed from here. */
export const curseforgeFileUrl = (slug: string, fileId: string) =>
  `https://www.curseforge.com/minecraft/bukkit-plugins/${encodeURIComponent(slug)}/files/${encodeURIComponent(fileId)}`;
