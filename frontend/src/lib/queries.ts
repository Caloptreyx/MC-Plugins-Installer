import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useServerCan } from '@/plugins/usePermissions.ts';
import { useServerStore } from '@/stores/server.ts';
import {
  getCategories,
  getProject,
  getProjectVersions,
  type PluginSource,
  projectKey,
  type VersionChannel,
} from './catalog.ts';
import { getStatus } from './curseforge.ts';
import { detectServer } from './detect.ts';
import { getReleaseGameVersions } from './modrinth.ts';
import { type InstalledPlugin, loadInstalledPlugins } from './plugins.ts';
import { findUpdates } from './updates.ts';

const HOUR = 60 * 60 * 1000;
const FIVE_MINUTES = 5 * 60 * 1000;

const ROOT = 'dev.caloptreyx.mcplugins';

export const pluginQueryKeys = {
  detection: (uuid: string) => [ROOT, 'server', uuid, 'detection'],
  installed: (uuid: string) => [ROOT, 'server', uuid, 'installed'],
  updates: (uuid: string) => [ROOT, 'server', uuid, 'updates'],
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
  const canReadContent = useServerCan('files.read-content');

  return useQuery({
    queryKey: [...pluginQueryKeys.detection(server.uuid), canReadStartup, canReadContent],
    queryFn: () => detectServer(server, { canReadStartup, canReadContent }),
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
    for (const plugin of query.data?.plugins ?? []) {
      if (plugin.project) map.set(projectKey(plugin.project.source, plugin.project.id), plugin);
    }
    return map;
  }, [query.data]);

  return { ...query, plugins: query.data?.plugins, byProject };
}

/** Newer versions of the installed plugins for the detected server, keyed by file name. */
export function usePluginUpdates(channels: VersionChannel[]) {
  const uuid = useServerStore((state) => state.server.uuid);
  const installed = useInstalledPlugins();
  const detection = useDetection();
  const loader = detection.data?.loader ?? null;
  const gameVersion = detection.data?.versionApplicable ? (detection.data.minecraftVersion?.value ?? null) : null;

  return useQuery({
    queryKey: [...pluginQueryKeys.updates(uuid), installed.dataUpdatedAt, loader, gameVersion, channels],
    queryFn: () => findUpdates(installed.plugins ?? [], { loader: loader!, gameVersion, channels }),
    enabled: !!installed.plugins && !!loader,
    staleTime: FIVE_MINUTES,
  });
}

export function useRefreshInstalledPlugins() {
  const queryClient = useQueryClient();
  const uuid = useServerStore((state) => state.server.uuid);
  return () => queryClient.invalidateQueries({ queryKey: pluginQueryKeys.installed(uuid) });
}

export function useProject(source: PluginSource, id: string, enabled = true) {
  const uuid = useServerStore((state) => state.server.uuid);
  return useQuery({
    queryKey: pluginQueryKeys.project(source, id),
    queryFn: () => getProject(source, uuid, id),
    staleTime: FIVE_MINUTES,
    enabled: enabled && !!id,
  });
}

export function useProjectVersions(source: PluginSource, id: string, enabled = true) {
  const uuid = useServerStore((state) => state.server.uuid);
  return useQuery({
    queryKey: pluginQueryKeys.versions(source, id),
    queryFn: () => getProjectVersions(source, uuid, id),
    staleTime: FIVE_MINUTES,
    enabled: enabled && !!id,
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
