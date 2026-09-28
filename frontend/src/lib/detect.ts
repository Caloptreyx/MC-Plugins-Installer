import getFileContent from '@/api/server/files/getFileContent.ts';
import getFileLines from '@/api/server/files/getFileLines.ts';
import getVariables from '@/api/server/startup/getVariables.ts';
import { compareGameVersions, RELEASE_VERSION } from './format.ts';
import { compatibleLoaders, isProxyLoader, type PluginLoader } from './loaders.ts';
import { listDirectory } from './serverFiles.ts';

export interface ServerDetection {
  loader: PluginLoader | null;
  /** Where the loader was read from, shown to the user as the badge tooltip. */
  loaderSource: string | null;
  minecraftVersion: string | null;
  versionSource: string | null;
  /** False on proxies, which serve every Minecraft version and never need one detected. */
  versionApplicable: boolean;
}

interface DetectableServer {
  uuid: string;
  egg: { name: string };
  startup: string;
  image: string;
}

type Detected<T> = [value: T, source: string] | null;

/** Config files a platform writes on first start, most specific platform first. */
const FILE_MARKERS: [path: string, loader: PluginLoader][] = [
  ['purpur.yml', 'purpur'],
  ['velocity.toml', 'velocity'],
  ['waterfall.yml', 'waterfall'],
  ['modules.yml', 'bungeecord'],
  ['config/paper-global.yml', 'paper'],
  ['paper.yml', 'paper'],
  ['spigot.yml', 'spigot'],
  ['bukkit.yml', 'bukkit'],
  ['config/sponge', 'sponge'],
];

/** Platform names as they appear in egg names, jar names, startup commands and images. */
const KEYWORDS: [pattern: RegExp, loader: PluginLoader][] = [
  [/folia/, 'folia'],
  [/purpur/, 'purpur'],
  [/paper|pufferfish|leaves/, 'paper'],
  [/velocity/, 'velocity'],
  [/waterfall/, 'waterfall'],
  [/bungee/, 'bungeecord'],
  [/spigot/, 'spigot'],
  [/bukkit/, 'bukkit'],
  [/sponge/, 'sponge'],
];

const VERSION_VARIABLES = ['MINECRAFT_VERSION', 'MC_VERSION', 'VERSION', 'MINECRAFT_VER'];

const keywordLoader = (text: string) => KEYWORDS.find(([pattern]) => pattern.test(text.toLowerCase()))?.[1] ?? null;

/** `currentVersion` from `version_history.json`, which Paper and its forks rewrite on every boot. */
async function readVersionHistory(uuid: string): Promise<string | null> {
  try {
    const blob = await getFileContent(uuid, '/version_history.json');
    return (JSON.parse(await blob.text()) as { currentVersion?: string }).currentVersion ?? null;
  } catch {
    return null;
  }
}

function detectLoader(
  versionHistory: string | null,
  paths: Set<string>,
  configuration: string,
): Detected<PluginLoader> {
  // Older builds brand the history entry (`git-Purpur-2062 (MC: 1.20.1)`), which is authoritative.
  const brand = versionHistory ? keywordLoader(versionHistory.replace(/\(MC:.*\)/, '')) : null;
  if (brand) return [brand, 'version_history.json'];

  const marker = FILE_MARKERS.find(([path]) => paths.has(path)) ?? null;
  const named = keywordLoader(configuration);

  // Forks also write their parent's configs (Folia and Purpur both write Paper's), so a name
  // that is a fork of the file match is the more precise answer.
  if (marker && named && compatibleLoaders(named).includes(marker[1])) {
    return [named, `${marker[0]} and server configuration`];
  }
  if (marker) return [marker[1], marker[0]];
  if (named) return [named, 'server egg and startup configuration'];
  return null;
}

async function detectMinecraftVersion(
  uuid: string,
  versionHistory: string | null,
  paths: Set<string>,
  variableValue: (name: string) => string,
): Promise<Detected<string>> {
  const history = versionHistory?.match(/\(MC: ([^)]+)\)/)?.[1];
  if (history && RELEASE_VERSION.test(history)) return [history, 'version_history.json'];

  const log = await getFileLines(uuid, '/logs/latest.log', 1, 400).catch(() => null);
  const logged = log?.content.match(/Starting minecraft server version (\S+)/)?.[1];
  if (logged && RELEASE_VERSION.test(logged)) return [logged, 'logs/latest.log'];

  // Paperclip extracts the vanilla server into versions/<minecraft version>/.
  if (paths.has('versions')) {
    const extracted = ((await listDirectory(uuid, '/versions').catch(() => null)) ?? [])
      .filter((entry) => entry.directory && RELEASE_VERSION.test(entry.name))
      .map((entry) => entry.name)
      .sort(compareGameVersions);
    if (extracted.length > 0) return [extracted[extracted.length - 1], 'versions/ directory'];
  }

  const configured = VERSION_VARIABLES.map(variableValue).find((value) => RELEASE_VERSION.test(value));
  return configured ? [configured, 'startup variables'] : null;
}

/**
 * Works out which plugin platform and Minecraft version a server runs, from the files it wrote
 * on its last start, its logs, and its egg/startup configuration. Every probe is best effort:
 * missing files or permissions simply leave that value undetected.
 */
export async function detectServer(server: DetectableServer, canReadStartup: boolean): Promise<ServerDetection> {
  const [root, variables, versionHistory] = await Promise.all([
    listDirectory(server.uuid, '/').catch(() => null),
    canReadStartup ? getVariables(server.uuid).catch(() => []) : Promise.resolve([]),
    readVersionHistory(server.uuid),
  ]);

  const paths = new Set((root ?? []).map((entry) => entry.name));
  if (paths.has('config')) {
    const config = await listDirectory(server.uuid, '/config').catch(() => null);
    for (const entry of config ?? []) paths.add(`config/${entry.name}`);
  }

  const variableValue = (name: string) => variables.find((v) => v.envVariable === name)?.value ?? '';

  const loader = detectLoader(
    versionHistory,
    paths,
    [server.egg.name, server.startup, variableValue('SERVER_JARFILE'), server.image].join(' '),
  );

  if (loader && isProxyLoader(loader[0])) {
    return {
      loader: loader[0],
      loaderSource: loader[1],
      minecraftVersion: null,
      versionSource: null,
      versionApplicable: false,
    };
  }

  const version = await detectMinecraftVersion(server.uuid, versionHistory, paths, variableValue);

  return {
    loader: loader?.[0] ?? null,
    loaderSource: loader?.[1] ?? null,
    minecraftVersion: version?.[0] ?? null,
    versionSource: version?.[1] ?? null,
    versionApplicable: true,
  };
}
