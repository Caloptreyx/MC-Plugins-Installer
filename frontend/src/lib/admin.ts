import { axiosInstance } from '@/api/axios.ts';

const BASE = '/api/admin/extensions/dev.caloptreyx.mcplugins';

export interface AdminSettings {
  curseforgeConfigured: boolean;
}

const toSettings = (settings: { curseforge_configured: boolean }): AdminSettings => ({
  curseforgeConfigured: settings.curseforge_configured,
});

export async function getAdminSettings(): Promise<AdminSettings> {
  const { data } = await axiosInstance.get(`${BASE}/settings`);
  return toSettings(data.settings);
}

/** Stores `apiKey` as the CurseForge key; an empty string removes it. */
export async function saveCurseforgeKey(apiKey: string): Promise<AdminSettings> {
  const { data } = await axiosInstance.put(`${BASE}/settings`, { curseforge_api_key: apiKey });
  return toSettings(data.settings);
}

/** Checks `apiKey` against CurseForge, or the stored key when it is omitted. */
export async function verifyCurseforgeKey(apiKey?: string): Promise<void> {
  await axiosInstance.post(`${BASE}/curseforge/verify`, { api_key: apiKey || undefined });
}
