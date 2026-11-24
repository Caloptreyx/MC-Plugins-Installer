// Pure module (no panel imports): also loaded by the node tests in tests/.
import type { PluginLoader } from './loaders.ts';

/** Server software the detector can tell apart (lowercase ids shared with the override file). */
export type Software =
  | 'vanilla'
  | 'paper'
  | 'purpur'
  | 'folia'
  | 'spigot'
  | 'bukkit'
  | 'sponge'
  | 'fabric'
  | 'quilt'
  | 'forge'
  | 'neoforge'
  | 'mohist'
  | 'arclight'
  | 'youer'
  | 'velocity'
  | 'bungeecord'
  | 'waterfall';

export type Family = 'mods' | 'plugins' | 'hybrid' | 'proxy' | 'vanilla';

interface SoftwareDefinition {
  label: string;
  family: Family;
  /** The plugin platform whose builds (and its ancestors' builds) run here; `null` when plugins don't run. */
  pluginLoader: PluginLoader | null;
}

const SOFTWARE: Record<Software, SoftwareDefinition> = {
  vanilla: { label: 'Vanilla', family: 'vanilla', pluginLoader: null },
  paper: { label: 'Paper', family: 'plugins', pluginLoader: 'paper' },
  purpur: { label: 'Purpur', family: 'plugins', pluginLoader: 'purpur' },
  folia: { label: 'Folia', family: 'plugins', pluginLoader: 'folia' },
  spigot: { label: 'Spigot', family: 'plugins', pluginLoader: 'spigot' },
  bukkit: { label: 'Bukkit', family: 'plugins', pluginLoader: 'bukkit' },
  sponge: { label: 'Sponge', family: 'plugins', pluginLoader: 'sponge' },
  fabric: { label: 'Fabric', family: 'mods', pluginLoader: null },
  quilt: { label: 'Quilt', family: 'mods', pluginLoader: null },
  forge: { label: 'Forge', family: 'mods', pluginLoader: null },
  neoforge: { label: 'NeoForge', family: 'mods', pluginLoader: null },
  // Hybrids run Bukkit plugins through their Spigot layer.
  mohist: { label: 'Mohist', family: 'hybrid', pluginLoader: 'spigot' },
  arclight: { label: 'Arclight', family: 'hybrid', pluginLoader: 'spigot' },
  youer: { label: 'Youer', family: 'hybrid', pluginLoader: 'spigot' },
  velocity: { label: 'Velocity', family: 'proxy', pluginLoader: 'velocity' },
  bungeecord: { label: 'BungeeCord', family: 'proxy', pluginLoader: 'bungeecord' },
  waterfall: { label: 'Waterfall', family: 'proxy', pluginLoader: 'waterfall' },
};

export const SOFTWARE_IDS = Object.keys(SOFTWARE) as Software[];

export function isSoftware(value: unknown): value is Software {
  return typeof value === 'string' && Object.hasOwn(SOFTWARE, value);
}

export const softwareLabel = (software: Software) => SOFTWARE[software].label;

export const softwareFamily = (software: Software): Family => SOFTWARE[software].family;

/**
 * Plugin platform used to filter builds on `software`: Purpur → Purpur (+ Paper, Spigot, Bukkit through the
 * loader chain), hybrids → Spigot (+ Bukkit), Waterfall → Waterfall (+ BungeeCord). `null` for mod loaders and vanilla.
 */
export const pluginLoaderFor = (software: Software): PluginLoader | null => SOFTWARE[software].pluginLoader;

/** Whether `software` loads plugins from the `plugins/` folder at all. */
export const runsPlugins = (software: Software) => SOFTWARE[software].pluginLoader !== null;
