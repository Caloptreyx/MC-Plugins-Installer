import { z } from 'zod';
import { axiosInstance } from '@/api/axios.ts';
import { parseFromApi, parsePaginationFromApi } from '@/lib/serialization/api-transform.ts';
import type { CategoryOption, PluginProject, PluginSummary, PluginVersion, SearchParams } from './catalog.ts';

// CurseForge needs an API key, so it is reached through this extension's backend, which returns
// data already shaped like the shared plugin model.

const base = (serverUuid: string) => `/api/client/servers/${serverUuid}/mcplugins/curseforge`;

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
  loaders: z.array(z.string()),
  gameVersions: z.array(z.string()),
  downloads: z.number(),
  published: z.string(),
  file: z.object({ url: z.string().nullable(), filename: z.string(), size: z.number() }),
});

const categorySchema = z.object({ id: z.string(), name: z.string() });

const matchSchema = z.object({
  fingerprint: z.number(),
  project: summarySchema,
  version: versionSchema,
});

// The "Bukkit Plugins" class is all CurseForge offers for servers.
const toSummary = (summary: z.infer<typeof summarySchema>): PluginSummary => ({
  source: 'curseforge',
  loaders: ['bukkit'],
  ...summary,
});

const toVersion = (version: z.infer<typeof versionSchema>): PluginVersion => ({ source: 'curseforge', ...version });

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
    links: project.links,
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

/** Identifies jars by CurseForge fingerprint; unknown fingerprints are absent from the result. */
export async function identifyByFingerprints(
  serverUuid: string,
  fingerprints: string[],
): Promise<Map<string, { version: PluginVersion; project: PluginSummary }>> {
  const matches = new Map<string, { version: PluginVersion; project: PluginSummary }>();
  if (fingerprints.length === 0) return matches;

  const { data } = await axiosInstance.post(`${base(serverUuid)}/fingerprints`, {
    fingerprints: fingerprints.map(Number),
  });
  for (const raw of data.matches) {
    const match = parseFromApi(matchSchema, raw);
    matches.set(String(match.fingerprint), { version: toVersion(match.version), project: toSummary(match.project) });
  }
  return matches;
}
