/** Server platforms that load plugins, keyed by their Modrinth loader id. */
export type PluginLoader =
  | 'paper'
  | 'purpur'
  | 'folia'
  | 'spigot'
  | 'bukkit'
  | 'velocity'
  | 'bungeecord'
  | 'waterfall'
  | 'sponge';

interface LoaderDefinition {
  label: string;
  /** Proxies do not run a specific Minecraft version, so version filtering does not apply. */
  proxy: boolean;
  /** Platform this one is a fork of; a fork runs every plugin its parent runs. */
  parent: PluginLoader | null;
}

const LOADERS: Record<PluginLoader, LoaderDefinition> = {
  paper: { label: 'Paper', proxy: false, parent: 'spigot' },
  purpur: { label: 'Purpur', proxy: false, parent: 'paper' },
  // Folia's threading model breaks regular Bukkit plugins, so it only runs Folia-marked builds.
  folia: { label: 'Folia', proxy: false, parent: null },
  spigot: { label: 'Spigot', proxy: false, parent: 'bukkit' },
  bukkit: { label: 'Bukkit', proxy: false, parent: null },
  velocity: { label: 'Velocity', proxy: true, parent: null },
  bungeecord: { label: 'BungeeCord', proxy: true, parent: null },
  waterfall: { label: 'Waterfall', proxy: true, parent: 'bungeecord' },
  sponge: { label: 'Sponge', proxy: false, parent: null },
};

export const PLUGIN_LOADER_IDS = Object.keys(LOADERS) as PluginLoader[];

export function isPluginLoader(value: string): value is PluginLoader {
  return Object.hasOwn(LOADERS, value);
}

export function isProxyLoader(loader: PluginLoader): boolean {
  return LOADERS[loader].proxy;
}

/** Display name for any Modrinth loader id, including non-plugin ones such as `fabric`. */
export function loaderLabel(value: string): string {
  return isPluginLoader(value) ? LOADERS[value].label : value.charAt(0).toUpperCase() + value.slice(1);
}

/** Modrinth loader ids whose builds run on `loader`: the platform itself followed by its ancestors. */
export function compatibleLoaders(loader: PluginLoader): PluginLoader[] {
  const chain: PluginLoader[] = [];
  let current: PluginLoader | null = loader;
  while (current) {
    chain.push(current);
    current = LOADERS[current].parent;
  }
  return chain;
}

/** Whether a build published for `buildLoaders` runs on the `server` platform. */
export function runsOn(buildLoaders: readonly string[], server: PluginLoader): boolean {
  const accepted = compatibleLoaders(server);
  return buildLoaders.some((loader) => accepted.includes(loader as PluginLoader));
}

/** Select options for picking a server platform, marking the detected one. */
export function loaderSelectData(detected: PluginLoader | null) {
  return PLUGIN_LOADER_IDS.map((value) => ({
    value,
    label: value === detected ? `${LOADERS[value].label} (detected)` : LOADERS[value].label,
  }));
}
