import type {
  CategoryOption,
  PluginProject,
  PluginSummary,
  PluginVersion,
  SearchParams,
  VersionChannel,
} from './catalog.ts';
import { newestFirst } from './format.ts';
import { isPluginLoader } from './loaders.ts';

const API_URL = 'https://api.modrinth.com/v2';

interface SearchHit {
  project_id: string;
  slug: string;
  title: string;
  description: string;
  author: string;
  icon_url: string | null;
  downloads: number;
  follows: number;
  display_categories: string[];
  versions: string[];
  date_modified: string;
}

interface SearchResult {
  hits: SearchHit[];
  total_hits: number;
}

interface Project {
  id: string;
  slug: string;
  title: string;
  description: string;
  body: string;
  icon_url: string | null;
  downloads: number;
  followers: number;
  categories: string[];
  loaders: string[];
  game_versions: string[];
  updated: string;
  license: { id: string; name: string } | null;
  source_url: string | null;
  issues_url: string | null;
  wiki_url: string | null;
  discord_url: string | null;
}

interface Version {
  id: string;
  project_id: string;
  name: string;
  version_number: string;
  version_type: VersionChannel;
  loaders: string[];
  game_versions: string[];
  downloads: number;
  date_published: string;
  files: { url: string; filename: string; primary: boolean; size: number }[];
}

interface TeamMember {
  role: string;
  is_owner?: boolean;
  user: { username: string };
}

interface CategoryTag {
  name: string;
  project_type: string;
  header: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, init);
  if (!response.ok) {
    throw new Error(
      response.status === 404 ? 'Not found on Modrinth.' : `Modrinth request failed (HTTP ${response.status}).`,
    );
  }
  return response.json() as Promise<T>;
}

const categoryLabel = (name: string) => name.replace(/-/g, ' ');

// Search hits mix loaders and other tags into their categories; this list tells real categories apart.
let categoryNames: Promise<string[]> | null = null;

/** Content categories plugins can be tagged with (loaders are excluded). */
function loadCategoryNames(): Promise<string[]> {
  categoryNames ??= request<CategoryTag[]>('/tag/category')
    .then((tags) =>
      tags
        .filter((tag) => tag.project_type === 'mod' && tag.header === 'categories')
        .map((tag) => tag.name)
        .sort(),
    )
    .catch((error) => {
      categoryNames = null;
      throw error;
    });
  return categoryNames;
}

export async function getPluginCategories(): Promise<CategoryOption[]> {
  return (await loadCategoryNames()).map((name) => ({ id: name, name: categoryLabel(name) }));
}

const projectUrl = (slug: string) => `https://modrinth.com/plugin/${slug}`;

export async function searchPlugins(params: SearchParams): Promise<Pagination<PluginSummary>> {
  // Facet groups are AND-ed together, entries inside one group are OR-ed.
  const facets: string[][] = [['project_type:plugin']];
  if (params.loaders.length > 0) facets.push(params.loaders.map((loader) => `categories:${loader}`));
  if (params.gameVersion) facets.push([`versions:${params.gameVersion}`]);
  if (params.category) facets.push([`categories:${params.category}`]);

  const search = new URLSearchParams({
    query: params.query,
    facets: JSON.stringify(facets),
    index: params.sort,
    offset: String((params.page - 1) * params.perPage),
    limit: String(params.perPage),
  });

  const [result, categories] = await Promise.all([
    request<SearchResult>(`/search?${search}`),
    loadCategoryNames().catch((): string[] => []),
  ]);

  return {
    total: result.total_hits,
    perPage: params.perPage,
    page: params.page,
    data: result.hits.map((hit) => ({
      source: 'modrinth',
      id: hit.project_id,
      slug: hit.slug,
      title: hit.title,
      description: hit.description,
      author: hit.author,
      iconUrl: hit.icon_url,
      downloads: hit.downloads,
      follows: hit.follows,
      categories: hit.display_categories.filter((name) => categories.includes(name)).map(categoryLabel),
      updated: hit.date_modified,
      url: projectUrl(hit.slug),
      // Search hits list loaders among their categories.
      loaders: hit.display_categories.filter(isPluginLoader),
      gameVersions: newestFirst(hit.versions),
    })),
  };
}

function summarize(project: Project, author: string): PluginSummary {
  return {
    source: 'modrinth',
    id: project.id,
    slug: project.slug,
    title: project.title,
    description: project.description,
    author,
    iconUrl: project.icon_url,
    downloads: project.downloads,
    follows: project.followers,
    categories: project.categories.map(categoryLabel),
    updated: project.updated,
    url: projectUrl(project.slug),
    loaders: project.loaders.filter(isPluginLoader),
    gameVersions: newestFirst(project.game_versions),
  };
}

async function getProjectOwner(idOrSlug: string): Promise<string> {
  const members = await request<TeamMember[]>(`/project/${encodeURIComponent(idOrSlug)}/members`);
  const owner = members.find((member) => member.is_owner || member.role === 'Owner') ?? members[0];
  return owner?.user.username ?? '';
}

export async function getProject(idOrSlug: string): Promise<PluginProject> {
  const [project, author] = await Promise.all([
    request<Project>(`/project/${encodeURIComponent(idOrSlug)}`),
    getProjectOwner(idOrSlug).catch(() => ''),
  ]);

  return {
    ...summarize(project, author),
    body: project.body,
    bodyFormat: 'markdown',
    license: project.license ? project.license.name || project.license.id : null,
    links: [
      { label: 'Source', url: project.source_url },
      { label: 'Issues', url: project.issues_url },
      { label: 'Wiki', url: project.wiki_url },
      { label: 'Discord', url: project.discord_url },
    ].filter((link): link is { label: string; url: string } => !!link.url),
  };
}

function mapVersion(version: Version): PluginVersion {
  // A version installs its primary file, falling back to its first jar.
  const file =
    version.files.find((candidate) => candidate.primary) ??
    version.files.find((candidate) => candidate.filename.endsWith('.jar'));

  return {
    source: 'modrinth',
    id: version.id,
    projectId: version.project_id,
    name: version.name,
    versionNumber: version.version_number,
    channel: version.version_type,
    loaders: version.loaders,
    gameVersions: newestFirst(version.game_versions),
    downloads: version.downloads,
    published: version.date_published,
    file: file ? { url: file.url, filename: file.filename, size: file.size } : null,
  };
}

/** Every version of a project, newest first. */
export async function getProjectVersions(idOrSlug: string): Promise<PluginVersion[]> {
  return (await request<Version[]>(`/project/${encodeURIComponent(idOrSlug)}/version`)).map(mapVersion);
}

/**
 * Identifies jars by SHA-1 hash. Returns the matching version and project per hash; unknown hashes
 * are absent from the result.
 */
export async function identifyByHashes(
  sha1Hashes: string[],
): Promise<Map<string, { version: PluginVersion; project: PluginSummary }>> {
  const matches = new Map<string, { version: PluginVersion; project: PluginSummary }>();
  if (sha1Hashes.length === 0) return matches;

  const versions = await request<Record<string, Version>>('/version_files', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hashes: sha1Hashes, algorithm: 'sha1' }),
  });

  const projectIds = [...new Set(Object.values(versions).map((version) => version.project_id))];
  const projects =
    projectIds.length > 0
      ? await request<Project[]>(`/projects?${new URLSearchParams({ ids: JSON.stringify(projectIds) })}`)
      : [];
  const projectsById = new Map(projects.map((project) => [project.id, project]));

  for (const [hash, version] of Object.entries(versions)) {
    const project = projectsById.get(version.project_id);
    // Search results carry the author; batch project lookups do not, so it stays empty here.
    if (project) matches.set(hash, { version: mapVersion(version), project: summarize(project, '') });
  }
  return matches;
}

/** Minecraft release versions, newest first. */
export async function getReleaseGameVersions(): Promise<string[]> {
  const versions = await request<{ version: string; version_type: string }[]>('/tag/game_version');
  return versions.filter((version) => version.version_type === 'release').map((version) => version.version);
}
