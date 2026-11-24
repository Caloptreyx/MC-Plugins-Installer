import { z } from 'zod';
import { axiosInstance } from '@/api/axios.ts';
import { parseFromApi, parsePaginationFromApi } from '@/lib/serialization/api-transform.ts';
import {
  type CategoryOption,
  type HangarPlatform,
  hangarPlatformFor,
  type PluginProject,
  type PluginSummary,
  type PluginVersion,
  type SearchParams,
  type VersionFile,
} from './catalog.ts';
import { isAllowedDownload } from './fileRules.ts';

// Hangar (PaperMC's plugin repository) is reached through this extension's backend, which caches it and only passes
// on downloads from Hangar's own CDN.

const base = (serverUuid: string) => `/api/client/servers/${serverUuid}/mcplugins/hangar`;

/** Hangar's fixed project categories; their labels are translated in the UI. */
export const HANGAR_CATEGORIES = [
  'admin_tools',
  'chat',
  'dev_tools',
  'economy',
  'gameplay',
  'games',
  'protection',
  'role_playing',
  'world_management',
  'misc',
] as const;

export type HangarCategory = (typeof HANGAR_CATEGORIES)[number];

export const CATEGORIES: CategoryOption[] = HANGAR_CATEGORIES.map((id) => ({ id, name: id }));

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
  loaders: z.array(z.string()),
});

const projectSchema = z.object({
  summary: summarySchema,
  body: z.string(),
  links: z.array(z.object({ label: z.string(), url: z.string() })),
  license: z.string().nullable(),
});

const platformSchema = z.enum(['paper', 'velocity', 'waterfall']);

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
  files: z.array(
    z.object({
      platform: platformSchema,
      url: z.string().nullable(),
      externalUrl: z.string().nullable(),
      filename: z.string(),
      size: z.number(),
      sha256: z.string().nullable(),
    }),
  ),
  dependencies: z.array(
    z.object({
      platform: platformSchema,
      name: z.string(),
      projectId: z.string().nullable(),
      required: z.boolean(),
      externalUrl: z.string().nullable(),
    }),
  ),
});

const toSummary = (summary: z.infer<typeof summarySchema>): PluginSummary => ({ source: 'hangar', ...summary });

function toVersion(version: z.infer<typeof versionSchema>): PluginVersion {
  const platformFiles: Partial<Record<HangarPlatform, VersionFile>> = {};
  for (const file of version.files) {
    platformFiles[file.platform] = {
      url: file.url && isAllowedDownload('hangar', file.url) ? file.url : null,
      externalUrl: file.externalUrl,
      filename: file.filename,
      size: file.size,
      hashes: file.sha256 ? { sha256: file.sha256.toLowerCase() } : {},
      fingerprint: null,
    };
  }

  return {
    source: 'hangar',
    id: version.id,
    projectId: version.projectId,
    name: version.name,
    versionNumber: version.versionNumber,
    channel: version.channel,
    loaders: version.loaders,
    gameVersions: version.gameVersions,
    downloads: version.downloads,
    published: version.published,
    file: platformFiles.paper ?? version.files.map((file) => platformFiles[file.platform]).find(Boolean) ?? null,
    platformFiles,
    dependencies: version.dependencies.map((dependency) => ({
      projectId: dependency.projectId,
      name: dependency.name,
      kind: dependency.required ? 'required' : 'optional',
      externalUrl: dependency.externalUrl,
      platform: dependency.platform,
    })),
  };
}

export async function searchPlugins(serverUuid: string, params: SearchParams): Promise<Pagination<PluginSummary>> {
  const platform = hangarPlatformFor(params.loader) ?? 'paper';
  const { data } = await axiosInstance.get(`${base(serverUuid)}/search`, {
    params: {
      query: params.query || undefined,
      platform,
      // Proxy platforms are versioned on their own, not by Minecraft version.
      game_version: platform === 'paper' ? (params.gameVersion ?? undefined) : undefined,
      category: params.category ?? undefined,
      folia: params.loader === 'folia' || undefined,
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
    bodyFormat: 'markdown',
    license: project.license,
    links: project.links,
  };
}

export async function getProjectVersions(serverUuid: string, id: string): Promise<PluginVersion[]> {
  const { data } = await axiosInstance.get(`${base(serverUuid)}/projects/${encodeURIComponent(id)}/versions`);
  return data.versions.map((version: unknown) => toVersion(parseFromApi(versionSchema, version)));
}
