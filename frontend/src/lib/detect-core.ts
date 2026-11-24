import type { PluginLoader } from './loaders.ts';
// Pure module (no panel imports): also loaded by the node tests in tests/.
import { MINECRAFT_VERSION } from './format.ts';
import { type Family, isSoftware, pluginLoaderFor, type Software, softwareFamily, softwareLabel } from './software.ts';
import { STATE_FILE_NAME, type SoftwareOverride, type StateFileProblem } from './stateFormat.ts';

export type DetectionSource =
  | 'override'
  | 'args'
  | 'log'
  | 'version_history'
  | 'marker'
  | 'files'
  | 'variables'
  | 'egg';
export type Confidence = 'high' | 'medium' | 'low';

export interface DetectedValue<T> {
  value: T;
  source: DetectionSource;
  confidence: Confidence;
}

export interface Evidence {
  source: DetectionSource;
  /** A path, or a log line of at most 200 characters. */
  detail: string;
  value: string;
  /** A log or version_history.json older than the newest install artifact (it counts less). */
  stale: boolean;
}

export interface ServerDetection {
  software: DetectedValue<Software> | null;
  family: Family | null;
  /** `null` on proxies. */
  minecraftVersion: DetectedValue<string> | null;
  /** Paper/Purpur/Folia build, proxy version, or mod loader version. */
  loaderVersion: DetectedValue<string> | null;
  evidence: Evidence[];
  conflicts: Evidence[];
  /** Whether the log or version_history.json is older than the newest install artifact (`staleSources` not empty). */
  logStale: boolean;
  /** Which of the log and version_history.json are older than the newest install artifact. */
  staleSources: ('log' | 'version_history')[];
  override: SoftwareOverride | null;
  overrideSetAt: string | null;
  overrideProblem: StateFileProblem | null;
  /** An override is set and fresh artifacts (rank 2-5) point to different software or Minecraft version. */
  overrideDisagrees: boolean;
  /** false when nothing at all points to a Minecraft server. */
  minecraft: boolean;
  /** Plugin platform used for filtering (`pluginLoaderFor(software)`), null on mod loaders / vanilla / unknown. */
  loader: PluginLoader | null;
  /** false on proxies (no Minecraft-version filter). */
  versionApplicable: boolean;
  /** Whether file/log contents could be read (`files.read-content`). */
  contentReadable: boolean;
}

/** A directory entry as the detector needs it; `modified` in milliseconds since the epoch. */
export interface FileEntry {
  name: string;
  directory: boolean;
  modified: number;
}

export interface VariableInput {
  envVariable: string;
  value: string;
  isSecret: boolean;
}

export interface FileText {
  /** Path relative to the server root, e.g. `logs/latest.log`. */
  path: string;
  content: string;
}

/** Loader library folders whose version subfolders tell the loader, its version and when it was installed. */
export const LIBRARY_DIRS = {
  fabricLoader: 'libraries/net/fabricmc/fabric-loader',
  intermediary: 'libraries/net/fabricmc/intermediary',
  quiltLoader: 'libraries/org/quiltmc/quilt-loader',
  forge: 'libraries/net/minecraftforge/forge',
  neoforge: 'libraries/net/neoforged/neoforge',
  neoforgedForge: 'libraries/net/neoforged/forge',
} as const;

export type LibraryDir = keyof typeof LIBRARY_DIRS;

export const VERSION_CHANGER_MARKER = '.mcvc-type.json';
export const MODPACK_MARKER = '.modpack-installer.json';
/** How much of the log head is read. */
export const LOG_HEAD_LINES = 600;

export interface DetectionInputs {
  /** Whether the user has `files.read-content`; without it every content field below is ignored. */
  contentReadable: boolean;
  /** Listings (`null` when the folder is missing or could not be listed). */
  root: FileEntry[] | null;
  config: FileEntry[] | null;
  logs: FileEntry[] | null;
  versions: FileEntry[] | null;
  cache: FileEntry[] | null;
  libraries: Partial<Record<LibraryDir, FileEntry[] | null>>;
  /** Head of `logs/latest.log` (or BungeeCord's `proxy.log.0`). */
  log: FileText | null;
  /** Content of `version_history.json`. */
  versionHistory: string | null;
  /** Content of `unix_args.txt` in the server root. */
  unixArgs: string | null;
  /** Content of `run.sh`. */
  runScript: string | null;
  /** The `@libraries/.../unix_args.txt` file `run.sh` passes (see `referencedArgsFile`). */
  argsFile: FileText | null;
  /** Content of `.mcvc-type.json`. */
  versionChangerMarker: string | null;
  /** Content of `.modpack-installer.json`. */
  modpackMarker: string | null;
  /** The parsed override file. */
  state: { override: SoftwareOverride | null; setAt: string | null; problem: StateFileProblem | null } | null;
  /** Startup variables (`null` without `startup.read`); secret ones are skipped. */
  variables: VariableInput[] | null;
  eggName: string;
  /** `null` when the panel doesn't expose it. */
  nestName: string | null;
  startup: string;
  image: string;
}

/** One finding of one source: a software and/or versions, with how much it counts. */
interface Claim {
  source: DetectionSource;
  /** Ranking tier (contracts §2.2): 1 override … 8 egg; lower wins. */
  rank: number;
  detail: string;
  software: Software | null;
  /** Names the software itself, rather than an artifact that forks or hybrids leave as well. */
  exact: boolean;
  softwareConfidence: Confidence;
  minecraftVersion: string | null;
  loaderVersion: string | null;
  /** Software the loader version belongs to when `software` is only a family guess. */
  loaderFor: Software[];
  confidence: Confidence;
  /** File mtime or install time (ms) used to pick the newest of competing claims. */
  time: number | null;
}

type ClaimInit = Pick<Claim, 'source' | 'rank' | 'detail'> & Partial<Claim>;

function claim(init: ClaimInit): Claim {
  const confidence = init.confidence ?? 'medium';
  return {
    software: null,
    exact: true,
    softwareConfidence: confidence,
    minecraftVersion: null,
    loaderVersion: null,
    loaderFor: [],
    time: null,
    ...init,
    confidence,
  };
}

/** Software whose artifacts (configs, libraries) the key software leaves as well. */
const ALSO_LEAVES: Partial<Record<Software, Software[]>> = {
  paper: ['spigot', 'bukkit'],
  purpur: ['paper', 'spigot', 'bukkit'],
  folia: ['paper', 'spigot', 'bukkit'],
  spigot: ['bukkit'],
  mohist: ['forge', 'paper', 'spigot', 'bukkit'],
  arclight: ['forge', 'neoforge', 'fabric', 'paper', 'spigot', 'bukkit'],
  youer: ['neoforge', 'paper', 'spigot', 'bukkit'],
  waterfall: ['bungeecord'],
};

/** Whether a server running `running` explains a finding of `found`. */
const covers = (running: Software, found: Software) =>
  running === found || (ALSO_LEAVES[running]?.includes(found) ?? false);

const PAPER_FAMILY: Software[] = ['paper', 'purpur', 'folia'];

/** Names as they appear in egg names, jar names, startup commands and images, most specific first. */
const KEYWORDS: [pattern: RegExp, software: Software][] = [
  [/(?<![a-z0-9])folia/, 'folia'],
  [/(?<![a-z0-9])purpur/, 'purpur'],
  [/(?<![a-z0-9])(?:paper|pufferfish|leaves)/, 'paper'],
  [/(?<![a-z0-9])mohist/, 'mohist'],
  [/(?<![a-z0-9])arclight/, 'arclight'],
  [/(?<![a-z0-9])youer/, 'youer'],
  [/(?<![a-z0-9])velocity/, 'velocity'],
  [/(?<![a-z0-9])waterfall/, 'waterfall'],
  [/(?<![a-z0-9])bungee/, 'bungeecord'],
  [/(?<![a-z0-9])spigot/, 'spigot'],
  [/(?<![a-z0-9])(?:craft)?bukkit/, 'bukkit'],
  [/(?<![a-z0-9])sponge/, 'sponge'],
  [/(?<![a-z0-9])neoforge/, 'neoforge'],
  [/(?<![a-z0-9])(?:minecraft)?forge/, 'forge'],
  [/(?<![a-z0-9])quilt/, 'quilt'],
  [/(?<![a-z0-9])fabric/, 'fabric'],
  [/(?<![a-z0-9])vanilla/, 'vanilla'],
];

const keywordSoftware = (text: string) => KEYWORDS.find(([pattern]) => pattern.test(text.toLowerCase()))?.[1] ?? null;

/** Brand names in logs and `version_history.json`. */
const BRANDS: Record<string, Software> = {
  paper: 'paper',
  purpur: 'purpur',
  folia: 'folia',
  pufferfish: 'paper',
  leaves: 'paper',
  tuinity: 'paper',
  spigot: 'spigot',
  craftbukkit: 'bukkit',
  bukkit: 'bukkit',
  mohist: 'mohist',
  arclight: 'arclight',
  youer: 'youer',
};

/** mcjars type ids (`.mcvc-type.json`) of forks that run the same plugins as one of ours. */
const MCJARS_ALIASES: Record<string, Software> = {
  pufferfish: 'paper',
  leaves: 'paper',
  aspaper: 'paper',
  divinemc: 'paper',
  canvas: 'folia',
  legacy_fabric: 'fabric',
};

const MINECRAFT_VARIABLES = [
  'MINECRAFT_VERSION',
  'MC_VERSION',
  'MCVERSION',
  'VERSION',
  'MINECRAFT_VER',
  'VANILLA_VERSION',
  'GAME_VERSION',
];

/** Variables that only exist on eggs of one software, holding its version. */
const SOFTWARE_VARIABLES: [name: string, software: Software][] = [
  ['NEOFORGE_VERSION', 'neoforge'],
  ['QUILT_LOADER_VERSION', 'quilt'],
  ['QUILT_VERSION', 'quilt'],
  ['FABRIC_LOADER_VERSION', 'fabric'],
  ['FABRIC_VERSION', 'fabric'],
  ['FORGE_VERSION', 'forge'],
  ['VELOCITY_VERSION', 'velocity'],
  ['WATERFALL_VERSION', 'waterfall'],
  ['BUNGEECORD_VERSION', 'bungeecord'],
  ['BUNGEE_VERSION', 'bungeecord'],
];

const LOADER_VERSION = /^[0-9][0-9A-Za-z.+-]{0,63}$/;
const DETAIL_MAX = 200;

const validMinecraft = (value: string | null | undefined) => (value && MINECRAFT_VERSION.test(value) ? value : null);
const validLoaderVersion = (value: string | null | undefined) => (value && LOADER_VERSION.test(value) ? value : null);

/** A log line as evidence: trimmed and at most 200 characters. */
function clip(line: string) {
  const trimmed = line.trim();
  return trimmed.length > DETAIL_MAX ? `${trimmed.slice(0, DETAIL_MAX - 1)}…` : trimmed;
}

/**
 * NeoForge version → Minecraft version: `20.4.237` → `1.20.4`, `21.0.3` → `1.21`, year-numbered `26.1.0.5` → `26.1`
 * and `26.1.2.1` → `26.1.2`. Any `-beta` / `+build` suffix is ignored.
 */
export function neoforgeToMinecraft(neoforge: string): string | null {
  const numeric = neoforge.split(/[-+]/)[0];
  const parts = numeric.split('.');
  if (parts.some((part) => !/^[0-9]+$/.test(part))) return null;
  const [major, minor, patch] = parts.map(Number);
  if (parts.length < 2) return null;
  let version: string;
  if (major < 25) version = minor === 0 ? `1.${major}` : `1.${major}.${minor}`;
  else if (parts.length < 3) return null;
  else version = patch === 0 ? `${major}.${minor}` : `${major}.${minor}.${patch}`;
  return validMinecraft(version);
}

/** Cuts a line at a shell comment: a `#` starting a word outside quotes. */
function stripComment(line: string) {
  let quote: string | null = null;
  let wordStart = true;
  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (quote === null && char === '#' && wordStart) return line.slice(0, index);
    if (quote === null && (char === '"' || char === "'")) quote = char;
    else if (quote !== null && char === quote) quote = null;
    wordStart = quote === null && /\s/.test(char);
  }
  return line;
}

/** The words of a launch arguments file or start script, without `#` comments. */
const activeTokens = (text: string) =>
  text.split('\n').flatMap((line) =>
    stripComment(line)
      .split(/\s+/)
      .filter((token) => token !== ''),
  );

const FORGE_SHIM = /^forge-(\d[\w.+]*)-(\d[\w.+-]*)-shim\.jar$/;

export interface LoaderArgs {
  software: 'forge' | 'neoforge';
  minecraftVersion: string;
  loaderVersion: string;
}

/**
 * Reads the loader from Forge/NeoForge launch arguments: the `--fml.*` options of `unix_args.txt` (or ModLauncher's
 * log line), or the shim jar Forge 1.20.3+ starts.
 */
export function parseLoaderArgs(text: string): LoaderArgs | null {
  const tokens = activeTokens(text);
  const option = (name: string) => {
    const index = tokens.indexOf(name);
    return index >= 0 && index + 1 < tokens.length ? tokens[index + 1] : null;
  };

  const minecraftVersion = validMinecraft(option('--fml.mcVersion'));
  if (minecraftVersion) {
    const neoforge = validLoaderVersion(option('--fml.neoForgeVersion'));
    const forge = validLoaderVersion(option('--fml.forgeVersion'));
    if (neoforge) return { software: 'neoforge', minecraftVersion, loaderVersion: neoforge };
    if (forge) {
      // NeoForge for 1.20.1 still launches as Forge, under its own group.
      const software = option('--fml.forgeGroup') === 'net.neoforged' ? 'neoforge' : 'forge';
      return { software, minecraftVersion, loaderVersion: forge };
    }
  }

  for (const token of tokens) {
    const match = FORGE_SHIM.exec(token.replace(/^["']|["']$/g, ''));
    const shimMinecraft = validMinecraft(match?.[1]);
    if (match && shimMinecraft) return { software: 'forge', minecraftVersion: shimMinecraft, loaderVersion: match[2] };
  }
  return null;
}

const SAFE_RELATIVE = /^[A-Za-z0-9._+-]+(?:\/[A-Za-z0-9._+-]+)*$/;

/** The arguments file a start script passes (`@libraries/.../unix_args.txt` in Forge's `run.sh`). */
export function referencedArgsFile(script: string): string | null {
  for (const token of activeTokens(script)) {
    const path = token.replace(/^["']|["']$/g, '');
    if (!path.startsWith('@')) continue;
    const file = path.slice(1);
    if (
      file.startsWith('libraries/') &&
      file.endsWith('/unix_args.txt') &&
      SAFE_RELATIVE.test(file) &&
      !file.split('/').some((part) => part === '..' || part === '.')
    ) {
      return file;
    }
  }
  return null;
}

/** Splits `1.21.4-232-main@abc` / `26.3-32-dev/…` into Minecraft version and build. */
function splitVersionBuild(version: string): { minecraftVersion: string; build: string } | null {
  const parts = version.split('-');
  for (let index = 1; index < parts.length; index++) {
    const minecraftVersion = validMinecraft(parts.slice(0, index).join('-'));
    if (minecraftVersion && /^[0-9]+$/.test(parts[index])) return { minecraftVersion, build: parts[index] };
  }
  return null;
}

interface BrandedVersion {
  software: Software | null;
  minecraftVersion: string | null;
  build: string | null;
}

/** Reads a Paper-style version: old `git-Paper-196 (MC: 1.20.1)` or new `1.21.4-232-main@abc (MC: 1.21.4)`. */
function parseBrandedVersion(text: string): BrandedVersion {
  const fromMc = validMinecraft(/\(MC: ([^)\s]+)\)/.exec(text)?.[1]);
  const head = text.replace(/\s*\(.*$/, '').trim();
  const old = /^git-([A-Za-z]+)-(\d+)/.exec(head);
  if (old) return { software: BRANDS[old[1].toLowerCase()] ?? null, minecraftVersion: fromMc, build: old[2] };
  const split = splitVersionBuild(head);
  return { software: null, minecraftVersion: fromMc ?? split?.minecraftVersion ?? null, build: split?.build ?? null };
}

/** `git:Waterfall-Bootstrap:1.21-R0.1-SNAPSHOT:0d8d6a3:586` → `1.21-586`; anything else as it is. */
function bungeeVersion(version: string) {
  const parts = version.split(':');
  if (parts.length === 5 && /^[0-9]+$/.test(parts[4]))
    return `${parts[2].replace(/-R[0-9.]+-SNAPSHOT$/, '')}-${parts[4]}`;
  return version.slice(0, 64);
}

type PartialClaim = Omit<ClaimInit, 'source' | 'rank'>;

const SOFTWARE_WORDS =
  /paper|purpur|folia|spigot|bukkit|sponge|fabric|quilt|forge|mohist|arclight|youer|modlauncher|velocity|bungee|waterfall/i;

/** Findings in the first lines of the server log. */
function parseLog(content: string): PartialClaim[] {
  const found: PartialClaim[] = [];
  const seen = new Set<string>();
  const once = (kind: string, make: () => PartialClaim | null) => {
    if (seen.has(kind)) return;
    const result = make();
    if (result) {
      seen.add(kind);
      found.push(result);
    }
  };

  for (const line of content.split('\n')) {
    const running = /This server is running (\S+) version (\S+)(.*)$/.exec(line);
    if (running) {
      once('running', () => {
        const brand = running[1].toLowerCase();
        let software = BRANDS[brand] ?? null;
        if (brand === 'craftbukkit' && /spigot/i.test(running[2])) software = 'spigot';
        if (!software) return null;
        const version = parseBrandedVersion(`${running[2]}${running[3]}`);
        return {
          detail: clip(line),
          software,
          minecraftVersion: version.minecraftVersion,
          loaderVersion: PAPER_FAMILY.includes(software) ? version.build : null,
        };
      });
    }

    // Paper 1.20.5+ bootstrap line, logged even before the EULA check.
    const bootstrap = /Loading ([A-Za-z]+) (\S+) .*for Minecraft (\S+)/.exec(line);
    if (bootstrap && BRANDS[bootstrap[1].toLowerCase()]) {
      once('bootstrap', () => {
        const software = BRANDS[bootstrap[1].toLowerCase()];
        return {
          detail: clip(line),
          software,
          minecraftVersion: validMinecraft(bootstrap[3]),
          loaderVersion: PAPER_FAMILY.includes(software) ? (splitVersionBuild(bootstrap[2])?.build ?? null) : null,
        };
      });
    }

    const fabric = /Loading Minecraft (\S+) with (Fabric|Quilt) Loader (\S+)/.exec(line);
    if (fabric) {
      once('fabric', () => ({
        detail: clip(line),
        software: fabric[2] === 'Quilt' ? 'quilt' : 'fabric',
        minecraftVersion: validMinecraft(fabric[1]),
        loaderVersion: validLoaderVersion(fabric[3]),
      }));
    }

    if (line.includes('--launchTarget')) {
      once('modlauncher', () => {
        const args = parseLoaderArgs(line.replace(/[[\],]/g, ' '));
        return args ? { detail: clip(line), ...args } : null;
      });
    }

    const legacyForge = /Forge Mod Loader version (\S+) for Minecraft (\S+)/.exec(line);
    if (legacyForge) {
      once('legacy-forge', () => ({
        detail: clip(line),
        software: 'forge',
        minecraftVersion: validMinecraft(legacyForge[2]),
        loaderVersion: validLoaderVersion(legacyForge[1]),
      }));
    }

    const velocity = /Booting up Velocity (\S+?)(?:\.\.\.)?(?: \(git-[0-9a-f]+-b(\d+)\))?(?:\.\.\.)?\s*$/.exec(line);
    if (velocity) {
      once('velocity', () => ({
        detail: clip(line),
        software: 'velocity',
        loaderVersion: validLoaderVersion(velocity[2] ? `${velocity[1]}-${velocity[2]}` : velocity[1]),
      }));
    }

    const bungee = /Enabled (BungeeCord|Waterfall) version (\S+)/.exec(line);
    if (bungee) {
      once('bungee', () => ({
        detail: clip(line),
        software: bungee[1] === 'Waterfall' ? 'waterfall' : 'bungeecord',
        loaderVersion: bungeeVersion(bungee[2]),
      }));
    }

    const vanilla = /Starting minecraft server version (\S+)/i.exec(line);
    if (vanilla) {
      once('version', () => {
        const minecraftVersion = validMinecraft(vanilla[1]);
        return minecraftVersion ? { detail: clip(line), minecraftVersion } : null;
      });
    }
  }

  // A plain Mojang server names no software at all: only call it vanilla when the log mentions none.
  const versionLine = found.find((entry) => !entry.software);
  if (versionLine && found.every((entry) => !entry.software) && !SOFTWARE_WORDS.test(content)) {
    versionLine.software = 'vanilla';
  }
  return found;
}

function parseJson(raw: string | null): Record<string, unknown> | null {
  if (raw === null) return null;
  try {
    const json: unknown = JSON.parse(raw);
    return json && typeof json === 'object' && !Array.isArray(json) ? (json as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const text = (value: unknown, max = 64) =>
  typeof value === 'string' && value.trim() !== '' && value.length <= max ? value.trim() : null;

function parseTime(value: unknown): number | null {
  const raw = text(value);
  if (!raw) return null;
  const time = Date.parse(raw);
  return Number.isNaN(time) ? null : time;
}

function versionChangerMarker(raw: string | null): PartialClaim | null {
  const data = parseJson(raw);
  const type = text(data?.type)?.toLowerCase();
  if (!data || !type) return null;
  const software = isSoftware(type) ? type : (MCJARS_ALIASES[type] ?? null);
  if (!software) return null;
  const version = text(data.version);
  const build = text(data.buildName)?.replace(/^#/, '') ?? null;
  const proxy = softwareFamily(software) === 'proxy';
  return {
    detail: VERSION_CHANGER_MARKER,
    software,
    minecraftVersion: proxy ? null : validMinecraft(version),
    // Proxies have no Minecraft version: mcjars stores the proxy version there.
    loaderVersion: proxy
      ? validLoaderVersion(version && build && /^[0-9]+$/.test(build) ? `${version}-${build}` : version)
      : validLoaderVersion(build),
    time: parseTime(data.installedAt),
  };
}

function modpackMarker(raw: string | null): PartialClaim | null {
  const data = parseJson(raw);
  const loader = text(data?.loader)?.toLowerCase();
  if (!data || !loader || !isSoftware(loader)) return null;
  return {
    detail: MODPACK_MARKER,
    software: loader,
    minecraftVersion: validMinecraft(text(data.minecraft_version)),
    loaderVersion: validLoaderVersion(text(data.loader_version)),
    time: parseTime(data.installed_at),
  };
}

/** The entry of `list` with the newest mtime for which `parse` yields a value. */
function newest<T>(list: FileEntry[] | null | undefined, parse: (entry: FileEntry) => T | null) {
  let best: { entry: FileEntry; value: T } | null = null;
  for (const entry of list ?? []) {
    const value = parse(entry);
    if (value !== null && (!best || entry.modified > best.entry.modified)) best = { entry, value };
  }
  return best;
}

const toEvidence = (found: Claim): Evidence => ({
  source: found.source,
  detail: found.detail,
  value: [
    // An unbranded version_history.json only says "a Paper fork"; don't present it as Paper.
    found.software && (found.exact || found.source !== 'version_history') ? softwareLabel(found.software) : null,
    found.minecraftVersion,
    found.loaderVersion,
  ]
    .filter((part) => part)
    .join(' · '),
  stale: found.rank === 6,
});

/** Newest first; claims without a time keep their order behind those with one. */
const newerFirst = (a: Claim, b: Claim) => (b.time ?? -Infinity) - (a.time ?? -Infinity);

/** The winning software claim: best rank; within it the most specific software, then the newest. */
function pickSoftware(claims: Claim[]): Claim | null {
  const named = claims.filter((entry) => entry.software);
  if (named.length === 0) return null;
  const rank = Math.min(...named.map((entry) => entry.rank));
  const tier = named.filter((entry) => entry.rank === rank);
  const present = new Set(tier.map((entry) => entry.software as Software));
  const specific = tier.filter(
    (entry) => ![...present].some((other) => other !== entry.software && covers(other, entry.software as Software)),
  );
  return [...specific].sort(newerFirst)[0];
}

/**
 * Works out the server software, Minecraft version and build/loader version from everything `inputs` holds, ranking
 * sources per field (contracts §2.2) instead of taking the first hit.
 */
export function detect(inputs: DetectionInputs): ServerDetection {
  const readable = inputs.contentReadable;
  const root = inputs.root ?? [];
  const inRoot = (name: string, directory?: boolean) =>
    root.find((entry) => entry.name === name && (directory === undefined || entry.directory === directory)) ?? null;
  const inConfig = (name: string, directory?: boolean) =>
    inputs.config?.find((entry) => entry.name === name && (directory === undefined || entry.directory === directory)) ??
    null;
  const libraries = (dir: LibraryDir) => inputs.libraries[dir]?.filter((entry) => entry.directory) ?? null;

  const variables = (inputs.variables ?? []).filter((variable) => !variable.isSecret);
  const variable = (name: string) => {
    const value = variables.find((entry) => entry.envVariable === name)?.value.trim();
    return value ? value : null;
  };

  const claims: Claim[] = [];
  const add = (source: DetectionSource, rank: number, partial: PartialClaim | null) => {
    if (partial) claims.push(claim({ source, rank, ...partial }));
  };

  // 1. Manual override.
  const override = readable ? (inputs.state?.override ?? null) : null;
  const overrideProblem = readable ? (inputs.state?.problem ?? null) : null;
  if (override) {
    add('override', 1, {
      detail: STATE_FILE_NAME,
      software: override.software,
      minecraftVersion: override.minecraftVersion,
      loaderVersion: override.loaderVersion,
      confidence: 'high',
    });
  }

  // 2. Launch arguments.
  const argsFileDir = inputs.argsFile ? inputs.argsFile.path.split('/').slice(-2, -1)[0] : null;
  const argsFileTime = argsFileDir
    ? (Object.values(inputs.libraries)
        .flatMap((list) => list ?? [])
        .find((entry) => entry.directory && entry.name === argsFileDir)?.modified ?? null)
    : null;
  if (readable) {
    const args: [string, string | null, number | null][] = [
      ['unix_args.txt', inputs.unixArgs, inRoot('unix_args.txt', false)?.modified ?? null],
      ['run.sh', inputs.runScript, inRoot('run.sh', false)?.modified ?? null],
      [inputs.argsFile?.path ?? '', inputs.argsFile?.content ?? null, argsFileTime],
    ];
    for (const [path, content, time] of args) {
      const parsed = content === null ? null : parseLoaderArgs(content);
      if (parsed) add('args', 2, { detail: path, ...parsed, confidence: 'high', time });
    }
  }

  // 4. Install markers (parsed first: their install time decides whether the log is fresh).
  const markers = readable
    ? [versionChangerMarker(inputs.versionChangerMarker), modpackMarker(inputs.modpackMarker)].filter(
        (marker) => marker !== null,
      )
    : [];

  const rootJars = root.filter((entry) => !entry.directory && /\.jar$/i.test(entry.name));
  const libraryEntries = (Object.keys(LIBRARY_DIRS) as LibraryDir[]).flatMap((dir) => libraries(dir) ?? []);
  const installTimes = [
    ...rootJars.map((entry) => entry.modified),
    ...libraryEntries.map((entry) => entry.modified),
    inRoot('unix_args.txt', false)?.modified ?? null,
    argsFileTime,
    ...markers.map((marker) => marker.time ?? null),
  ].filter((time) => time !== null);
  const installedAt = installTimes.length > 0 ? Math.max(...installTimes) : null;
  const fresh = (time: number | null | undefined) => installedAt === null || (time != null && time >= installedAt);

  // 3 / 6. Log and version_history.json: fresh ones rank above markers, stale ones below files.
  const logEntry = inputs.log
    ? inputs.log.path === 'logs/latest.log'
      ? (inputs.logs?.find((entry) => entry.name === 'latest.log') ?? null)
      : inRoot(inputs.log.path, false)
    : null;
  const presentLog =
    logEntry ??
    inputs.logs?.find((entry) => entry.name === 'latest.log' && !entry.directory) ??
    inRoot('proxy.log.0', false);
  const historyEntry = inRoot('version_history.json', false);
  const staleSources: ServerDetection['staleSources'] = [];
  if (presentLog !== null && !fresh(presentLog.modified)) staleSources.push('log');
  if (historyEntry !== null && !fresh(historyEntry.modified)) staleSources.push('version_history');

  if (readable && inputs.log) {
    const logFresh = fresh(logEntry?.modified);
    for (const found of parseLog(inputs.log.content)) {
      add('log', logFresh ? 3 : 6, {
        ...found,
        confidence: logFresh ? 'high' : 'low',
        time: logEntry?.modified ?? null,
      });
    }
  }

  if (readable && inputs.versionHistory !== null) {
    const current = text(parseJson(inputs.versionHistory)?.currentVersion, 200);
    if (current) {
      const version = parseBrandedVersion(current);
      const historyFresh = fresh(historyEntry?.modified);
      add('version_history', historyFresh ? 3 : 6, {
        detail: 'version_history.json',
        // Only Paper and its forks write this file; newer ones no longer name themselves in it.
        software: version.software ?? 'paper',
        exact: version.software !== null,
        softwareConfidence: !historyFresh ? 'low' : version.software ? 'high' : 'low',
        minecraftVersion: version.minecraftVersion,
        loaderVersion: version.build,
        loaderFor: version.software ? [] : PAPER_FAMILY,
        confidence: historyFresh ? 'high' : 'low',
        time: historyEntry?.modified ?? null,
      });
    }
  }

  // 5. Files.
  const files: PartialClaim[] = [];
  const serverJarName = variable('SERVER_JARFILE')?.replace(/^\.\//, '') ?? null;
  const serverJar =
    (serverJarName ? inRoot(serverJarName, false) : null) ??
    [...rootJars].filter((entry) => !/-installer\.jar$/i.test(entry.name)).sort((a, b) => b.modified - a.modified)[0] ??
    null;

  // Paper-family configs only count when the current server jar has run since (a stale purpur.yml must not keep a
  // Paper server "Purpur").
  const paperConfig = (entry: FileEntry | null, detail: string, software: Software, exact: boolean) => {
    if (!entry || (serverJar && entry.modified < serverJar.modified)) return;
    files.push({
      detail,
      software,
      exact,
      confidence: software === 'paper' ? 'low' : 'medium',
      time: entry.modified,
    });
  };
  paperConfig(inRoot('purpur.yml', false), 'purpur.yml', 'purpur', true);
  paperConfig(inConfig('paper-global.yml', false), 'config/paper-global.yml', 'paper', false);
  paperConfig(inRoot('paper.yml', false), 'paper.yml', 'paper', false);
  paperConfig(inRoot('.paper-remapped', true), '.paper-remapped/', 'paper', false);
  paperConfig(inRoot('spigot.yml', false), 'spigot.yml', 'spigot', false);
  paperConfig(inRoot('bukkit.yml', false), 'bukkit.yml', 'bukkit', false);

  const marker = (entry: FileEntry | null, detail: string, software: Software, exact = true) => {
    if (entry) files.push({ detail, software, exact, time: entry.modified });
  };
  marker(inRoot('mohist-config', true), 'mohist-config/', 'mohist');
  marker(inRoot('arclight.conf', false), 'arclight.conf', 'arclight');
  marker(inRoot('youer-config', true), 'youer-config/', 'youer');
  marker(inRoot('velocity.toml', false), 'velocity.toml', 'velocity');
  marker(inRoot('waterfall.yml', false), 'waterfall.yml', 'waterfall');
  marker(inRoot('modules.yml', false), 'modules.yml', 'bungeecord', false);
  marker(inConfig('sponge', true), 'config/sponge/', 'sponge');
  marker(inRoot('.fabric', true), '.fabric/', 'fabric', false);
  marker(inRoot('fabric-server-launch.jar', false), 'fabric-server-launch.jar', 'fabric', false);
  marker(inRoot('fabric-server-launcher.properties', false), 'fabric-server-launcher.properties', 'fabric', false);
  marker(inRoot('.quilt', true), '.quilt/', 'quilt', false);
  marker(inRoot('quilt-server-launch.jar', false), 'quilt-server-launch.jar', 'quilt', false);

  // Loader libraries: the newest version folder of each (a leftover folder keeps its old mtime).
  const library = (dir: LibraryDir, parse: (name: string) => Omit<PartialClaim, 'detail' | 'time'> | null) => {
    const found = newest(libraries(dir), (entry) => parse(entry.name));
    if (found) {
      files.push({
        ...found.value,
        detail: `${LIBRARY_DIRS[dir]}/${found.entry.name}/`,
        exact: false,
        time: found.entry.modified,
      });
    }
  };
  const minecraftPrefixed = (name: string) => {
    const dash = name.indexOf('-');
    const minecraftVersion = dash > 0 ? validMinecraft(name.slice(0, dash)) : null;
    const loaderVersion = dash > 0 ? validLoaderVersion(name.slice(dash + 1)) : null;
    return minecraftVersion && loaderVersion ? { minecraftVersion, loaderVersion } : null;
  };
  library('fabricLoader', (name) => (validLoaderVersion(name) ? { software: 'fabric', loaderVersion: name } : null));
  library('quiltLoader', (name) => (validLoaderVersion(name) ? { software: 'quilt', loaderVersion: name } : null));
  library('forge', (name) => {
    const parsed = minecraftPrefixed(name);
    return parsed ? { software: 'forge', ...parsed } : null;
  });
  library('neoforge', (name) =>
    validLoaderVersion(name)
      ? { software: 'neoforge', minecraftVersion: neoforgeToMinecraft(name), loaderVersion: name }
      : null,
  );
  library('neoforgedForge', (name) => {
    const parsed = minecraftPrefixed(name);
    return parsed ? { software: 'neoforge', ...parsed } : null;
  });
  library('intermediary', (name) => {
    const minecraftVersion = validMinecraft(name);
    return minecraftVersion ? { minecraftVersion } : null;
  });

  // Jars in the root: launcher and shim names carry versions; otherwise the server jar's name.
  for (const jar of rootJars) {
    const name = jar.name;
    const shim = FORGE_SHIM.exec(name);
    const legacyForge = /^forge-([^-]+)-(\d[\w.]*?)(?:-universal)?\.jar$/i.exec(name);
    const fabricLauncher = /^fabric-server-mc\.([^-]+)-loader\.([^-]+)-launcher\.[^-]+\.jar$/i.exec(name);
    const vanillaJar = /^minecraft_server\.(.+)\.jar$/i.exec(name);
    const base = { detail: name, time: jar.modified };
    if (shim && validMinecraft(shim[1])) {
      files.push({ ...base, software: 'forge', minecraftVersion: shim[1], loaderVersion: shim[2] });
    } else if (legacyForge && validMinecraft(legacyForge[1])) {
      files.push({ ...base, software: 'forge', minecraftVersion: legacyForge[1], loaderVersion: legacyForge[2] });
    } else if (fabricLauncher && validMinecraft(fabricLauncher[1])) {
      files.push({
        ...base,
        software: 'fabric',
        exact: false,
        minecraftVersion: fabricLauncher[1],
        loaderVersion: validLoaderVersion(fabricLauncher[2]),
      });
    } else if (vanillaJar && validMinecraft(vanillaJar[1])) {
      files.push({ ...base, minecraftVersion: vanillaJar[1] });
    } else if (
      (serverJarName ? name === serverJarName : true) &&
      !/-installer\.jar$/i.test(name) &&
      !/^(?:fabric|quilt)-server-launch\.jar$/i.test(name)
    ) {
      const software = keywordSoftware(name);
      if (!software || software === 'vanilla') continue;
      // `paper-1.21.4-232.jar`, `velocity-3.4.0-SNAPSHOT-450.jar`
      const rest = name.replace(/\.jar$/i, '').replace(/^[A-Za-z]+-?/, '');
      const split = PAPER_FAMILY.includes(software) ? splitVersionBuild(rest) : null;
      files.push({
        ...base,
        software,
        minecraftVersion: split?.minecraftVersion ?? null,
        loaderVersion: split?.build ?? (softwareFamily(software) === 'proxy' ? validLoaderVersion(rest) : null),
      });
    }
  }

  // Extracted vanilla jars: newest folder/file, not the highest name (a downgrade leaves the newer one behind).
  const extracted = newest(inputs.versions, (entry) => (entry.directory ? validMinecraft(entry.name) : null));
  if (extracted) {
    files.push({
      detail: `versions/${extracted.entry.name}/`,
      minecraftVersion: extracted.value,
      time: extracted.entry.modified,
    });
  }
  const mojang = newest(inputs.cache, (entry) =>
    entry.directory ? null : validMinecraft(/^mojang_(.+)\.jar$/.exec(entry.name)?.[1]),
  );
  if (mojang) {
    files.push({ detail: `cache/${mojang.entry.name}`, minecraftVersion: mojang.value, time: mojang.entry.modified });
  }

  for (const found of files) add('files', 5, found);

  // A marker older than a newer conflicting artifact loses: it then competes with the files by time.
  for (const found of markers) {
    const outdated =
      found.time != null &&
      claims.some(
        (entry) =>
          entry.rank === 5 &&
          entry.software &&
          !covers(found.software as Software, entry.software) &&
          entry.time !== null &&
          entry.time > (found.time as number),
      );
    add('marker', outdated ? 5 : 4, found);
  }

  // 7. Startup variables (non-secret; the panel only returns ones the user may view).
  const variableVersion = MINECRAFT_VARIABLES.map((name) => [name, validMinecraft(variable(name))] as const).find(
    ([, value]) => value,
  );
  if (variableVersion) add('variables', 7, { detail: variableVersion[0], minecraftVersion: variableVersion[1] });
  const byValue = variables.find(
    (entry) => entry.envVariable !== 'SERVER_JARFILE' && isSoftware(entry.value.trim().toLowerCase()),
  );
  if (byValue) {
    add('variables', 7, {
      detail: byValue.envVariable,
      software: byValue.value.trim().toLowerCase() as Software,
      softwareConfidence: 'low',
    });
  } else {
    const byName = SOFTWARE_VARIABLES.find(([name]) => variable(name));
    if (byName) {
      add('variables', 7, {
        detail: byName[0],
        software: byName[1],
        softwareConfidence: 'low',
        loaderVersion: validLoaderVersion(variable(byName[0])),
      });
    }
  }

  // 8. Egg name, then nest name, startup command, image.
  const names = [inputs.eggName, inputs.nestName ?? '', inputs.startup, inputs.image];
  for (const name of names) {
    const software = keywordSoftware(name);
    if (software) {
      add('egg', 8, { detail: clip(name), software, confidence: 'low' });
      break;
    }
  }

  claims.sort((a, b) => a.rank - b.rank);

  // Software: best-ranked claim; a generic artifact (Paper configs, loader libraries) is refined by any source naming
  // a fork or hybrid that leaves it (a Folia egg on a server with paper-global.yml is Folia).
  let chosen = pickSoftware(claims);
  if (chosen && !chosen.exact) {
    const base = chosen.software as Software;
    const refined = claims
      .filter((entry) => entry.software && entry.software !== base && covers(entry.software, base))
      .sort((a, b) => a.rank - b.rank || newerFirst(a, b))[0];
    if (refined) chosen = refined;
  }
  const software = chosen?.software ?? null;
  const family = software ? softwareFamily(software) : null;
  const versionApplicable = family !== 'proxy';
  const fits = (entry: Claim) => !software || !entry.software || covers(software, entry.software);

  const minecraftClaim = versionApplicable
    ? (claims
        .filter((entry) => entry.minecraftVersion && fits(entry))
        .sort(
          (a, b) =>
            a.rank - b.rank || Number(b.software === software) - Number(a.software === software) || newerFirst(a, b),
        )[0] ?? null)
    : null;
  const loaderClaim = software
    ? (claims
        .filter((entry) => entry.loaderVersion && (entry.software === software || entry.loaderFor.includes(software)))
        .sort((a, b) => a.rank - b.rank || newerFirst(a, b))[0] ?? null)
    : null;

  const minecraftVersion = minecraftClaim?.minecraftVersion ?? null;
  // A finding that names its software disagrees unless it names the chosen one; a generic artifact (Paper configs,
  // loader libraries) only when the chosen software doesn't leave it.
  const disagrees = (entry: Claim, running: Software | null, version: string | null) =>
    (running !== null &&
      entry.software !== null &&
      (entry.exact ? entry.software !== running : !covers(running, entry.software))) ||
    (versionApplicable &&
      version !== null &&
      entry.minecraftVersion !== null &&
      entry.minecraftVersion !== version &&
      (running === null || entry.software === null || covers(running, entry.software)));

  // Ranks 2-5 and the stale log/version_history (6), which the UI marks as stale.
  const conflicts = claims
    .filter(
      (entry) => entry.rank >= 2 && entry.rank <= 6 && entry !== chosen && disagrees(entry, software, minecraftVersion),
    )
    .map(toEvidence);
  const overrideDisagrees =
    override !== null &&
    claims.some(
      (entry) => entry.rank >= 2 && entry.rank <= 5 && disagrees(entry, override.software, override.minecraftVersion),
    );

  const evidence = claims.map(toEvidence);
  if (overrideProblem) {
    evidence.unshift({ source: 'override', detail: STATE_FILE_NAME, value: overrideProblem, stale: false });
  }

  const minecraftSignal =
    inRoot('server.properties', false) !== null ||
    inRoot('eula.txt', false) !== null ||
    names.some((name) => /minecraft/i.test(name));

  return {
    software:
      chosen && software ? { value: software, source: chosen.source, confidence: chosen.softwareConfidence } : null,
    family,
    minecraftVersion:
      minecraftClaim && minecraftVersion
        ? { value: minecraftVersion, source: minecraftClaim.source, confidence: minecraftClaim.confidence }
        : null,
    loaderVersion: loaderClaim?.loaderVersion
      ? { value: loaderClaim.loaderVersion, source: loaderClaim.source, confidence: loaderClaim.confidence }
      : null,
    evidence,
    conflicts,
    logStale: staleSources.length > 0,
    staleSources,
    override,
    overrideSetAt: override ? (inputs.state?.setAt ?? null) : null,
    overrideProblem,
    overrideDisagrees,
    minecraft: claims.length > 0 || minecraftSignal,
    loader: software ? pluginLoaderFor(software) : null,
    versionApplicable,
    contentReadable: readable,
  };
}
