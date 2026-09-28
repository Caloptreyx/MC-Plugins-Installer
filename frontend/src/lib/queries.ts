import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useServerCan } from '@/plugins/usePermissions.ts';
import { useServerStore } from '@/stores/server.ts';
import { getCategories, getProject, getProjectVersions, type PluginSource, projectKey } from './catalog.ts';
import { getStatus } from './curseforge.ts';
import { detectServer } from './detect.ts';
import { getReleaseGameVersions } from './modrinth.ts';
import { type InstalledPlugin, loadInstalledPlugins } from './plugins.ts';

const HOUR = 60 * 60 * 1000;
const FIVE_MINUTES = 5 * 60 * 1000;

const ROOT = 'dev.caloptreyx.mcplugins';

export const pluginQueryKeys = {
  detection: (uuid: string) => [ROOT, 'server', uuid, 'detection'],
  installed: (uuid: string) => [ROOT, 'server', uuid, 'installed'],
  curseforgeStatus: (uuid: string) => [ROOT, 'server', uuid, 'curseforge-status'],
  search: (source: PluginSource, params: object) => [ROOT, source, 'search', params],
  project: (source: PluginSource, id: string) => [ROOT, source, 'project', id],
  versions: (source: PluginSource, id: string) => [ROOT, source, 'versions', id],
  categories: (source: PluginSource) => [ROOT, source, 'categories'],
  gameVersions: () => [ROOT, 'modrinth', 'game-versions'],
};

export function useDetection() {
  const server = useServerStore((state) => state.server);
  const canReadStartup = useServerCan('startup.read');

  return useQuery({
    queryKey: pluginQueryKeys.detection(server.uuid),
    queryFn: () => detectServer(server, canReadStartup),
    staleTime: 10 * 60 * 1000,
  });
}

/** Whether CurseForge is configured; treated as unavailable while unknown or on errors. */
export function useCurseforgeEnabled() {
  const uuid = useServerStore((state) => state.server.uuid);
  const query = useQuery({
    queryKey: pluginQueryKeys.curseforgeStatus(uuid),
    queryFn: () => getStatus(uuid),
    staleTime: FIVE_MINUTES,
  });
  return { enabled: query.data === true, isPending: query.isPending };
}

export function useInstalledPlugins() {
  const uuid = useServerStore((state) => state.server.uuid);
  const curseforge = useCurseforgeEnabled();

  const query = useQuery({
    queryKey: [...pluginQueryKeys.installed(uuid), curseforge.enabled],
    queryFn: () => loadInstalledPlugins(uuid, curseforge.enabled),
    staleTime: 60 * 1000,
    // Identification depends on whether CurseForge can be asked, so wait until that is known.
    enabled: !curseforge.isPending,
  });

  const byProject = useMemo(() => {
    const map = new Map<string, InstalledPlugin>();
    for (const plugin of query.data ?? []) {
      if (plugin.project) map.set(projectKey(plugin.project.source, plugin.project.id), plugin);
    }
    return map;
  }, [query.data]);

  return { ...query, byProject };
}

export function useRefreshInstalledPlugins() {
  const queryClient = useQueryClient();
  const uuid = useServerStore((state) => state.server.uuid);
  return () => queryClient.invalidateQueries({ queryKey: pluginQueryKeys.installed(uuid) });
}

export function useProject(source: PluginSource, id: string) {
  const uuid = useServerStore((state) => state.server.uuid);
  return useQuery({
    queryKey: pluginQueryKeys.project(source, id),
    queryFn: () => getProject(source, uuid, id),
    staleTime: FIVE_MINUTES,
  });
}

export function useProjectVersions(source: PluginSource, id: string) {
  const uuid = useServerStore((state) => state.server.uuid);
  return useQuery({
    queryKey: pluginQueryKeys.versions(source, id),
    queryFn: () => getProjectVersions(source, uuid, id),
    staleTime: FIVE_MINUTES,
  });
}

export function useCategories(source: PluginSource) {
  const uuid = useServerStore((state) => state.server.uuid);
  return useQuery({
    queryKey: pluginQueryKeys.categories(source),
    queryFn: () => getCategories(source, uuid),
    staleTime: HOUR,
  });
}

export const useGameVersions = () =>
  useQuery({ queryKey: pluginQueryKeys.gameVersions(), queryFn: getReleaseGameVersions, staleTime: HOUR });
