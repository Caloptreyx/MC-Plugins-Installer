import type { PluginSource } from './catalog.ts';

/** Absolute URL of a page of this extension; `serverId` is the server's short uuid. */
export const pluginsUrl = (serverId: string, path = '') => `/server/${serverId}/plugins${path}`;

export const pluginDetailsUrl = (serverId: string, source: PluginSource, projectId: string) =>
  pluginsUrl(serverId, `/project/${source}/${encodeURIComponent(projectId)}`);
