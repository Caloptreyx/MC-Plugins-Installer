import getFileContent from '@/api/server/files/getFileContent.ts';
import getFileLines from '@/api/server/files/getFileLines.ts';
import getVariables from '@/api/server/startup/getVariables.ts';
import {
  type DetectionInputs,
  detect,
  type FileEntry,
  LIBRARY_DIRS,
  type LibraryDir,
  LOG_HEAD_LINES,
  MODPACK_MARKER,
  referencedArgsFile,
  type ServerDetection,
  VERSION_CHANGER_MARKER,
} from './detect-core.ts';
import { type DirectoryEntry, listDirectory } from './serverFiles.ts';
import { readStateFile } from './stateFile.ts';
import { STATE_FILE_NAME } from './stateFormat.ts';

interface DetectableServer {
  uuid: string;
  egg: { name: string };
  startup: string;
  image: string;
}

const KIB = 1024;
/** Largest files read whole; bigger ones are skipped rather than downloaded. */
const MAX_SMALL_FILE = 64 * KIB;
const MAX_SCRIPT = 256 * KIB;
const MAX_MODPACK_MARKER = 2 * KIB * KIB;

const toEntries = (entries: DirectoryEntry[] | null): FileEntry[] | null =>
  entries?.map((entry) => ({ name: entry.name, directory: entry.directory, modified: entry.modified.getTime() })) ??
  null;

/** A directory listing, `null` when it is missing or can't be listed. */
const list = (uuid: string, path: string) => listDirectory(uuid, path).catch(() => null);

/** The text of a small file, `null` when it is missing, unreadable or larger than `maxBytes`. */
async function readText(uuid: string, path: string, maxBytes: number) {
  try {
    const blob = await getFileContent(uuid, path);
    return blob.size > maxBytes ? null : await blob.text();
  } catch {
    return null;
  }
}

/**
 * Collects what the detector ranks (listings, the log head, `version_history.json`, launch arguments, install markers,
 * the override file, startup variables and the egg) and runs `detect` on it. File contents are only read with
 * `files.read-content` and variables only with `startup.read`; every probe is best effort, so a missing file or a
 * failed request only leaves that source out.
 */
export async function detectServer(
  server: DetectableServer,
  { canReadStartup, canReadContent }: { canReadStartup: boolean; canReadContent: boolean },
): Promise<ServerDetection> {
  const { uuid } = server;
  const [rootListing, variables] = await Promise.all([
    list(uuid, '/'),
    canReadStartup ? getVariables(uuid).catch(() => null) : Promise.resolve(null),
  ]);
  const root = rootListing ?? [];
  const rootEntry = (name: string, directory: boolean) =>
    root.find((entry) => entry.name === name && entry.directory === directory) ?? null;
  const hasDir = (name: string) => rootEntry(name, true) !== null;
  const smallFile = (name: string, maxBytes: number) => {
    const entry = rootEntry(name, false);
    return canReadContent && entry && entry.size <= maxBytes ? readText(uuid, `/${name}`, maxBytes) : null;
  };

  const libraryDirs = Object.keys(LIBRARY_DIRS) as LibraryDir[];
  const [config, logs, versions, cache, libraryListings] = await Promise.all([
    hasDir('config') ? list(uuid, '/config') : null,
    hasDir('logs') ? list(uuid, '/logs') : null,
    hasDir('versions') ? list(uuid, '/versions') : null,
    hasDir('cache') ? list(uuid, '/cache') : null,
    Promise.all(libraryDirs.map((dir) => (hasDir('libraries') ? list(uuid, `/${LIBRARY_DIRS[dir]}`) : null))),
  ]);

  // Paper, Fabric, Forge and Velocity log to logs/latest.log; BungeeCord to proxy.log.0.
  const logPath = logs?.some((entry) => entry.name === 'latest.log' && !entry.directory)
    ? 'logs/latest.log'
    : rootEntry('proxy.log.0', false)
      ? 'proxy.log.0'
      : null;

  const [log, versionHistory, unixArgs, runScript, versionChangerMarker, modpackMarker, state] = await Promise.all([
    canReadContent && logPath
      ? getFileLines(uuid, `/${logPath}`, 1, LOG_HEAD_LINES)
          .then((lines) => ({ path: logPath, content: lines.content }))
          .catch(() => null)
      : null,
    smallFile('version_history.json', MAX_SMALL_FILE),
    smallFile('unix_args.txt', MAX_SCRIPT),
    smallFile('run.sh', MAX_SCRIPT),
    smallFile(VERSION_CHANGER_MARKER, MAX_SMALL_FILE),
    smallFile(MODPACK_MARKER, MAX_MODPACK_MARKER),
    canReadContent && rootEntry(STATE_FILE_NAME, false) ? readStateFile(uuid).catch(() => null) : null,
  ]);

  const argsPath = runScript ? referencedArgsFile(runScript) : null;
  const argsContent = argsPath ? await readText(uuid, `/${argsPath}`, MAX_SCRIPT) : null;

  const inputs: DetectionInputs = {
    contentReadable: canReadContent,
    root: toEntries(rootListing),
    config: toEntries(config),
    logs: toEntries(logs),
    versions: toEntries(versions),
    cache: toEntries(cache),
    libraries: Object.fromEntries(libraryDirs.map((dir, index) => [dir, toEntries(libraryListings[index])])),
    log,
    versionHistory,
    unixArgs,
    runScript,
    argsFile: argsPath && argsContent !== null ? { path: argsPath, content: argsContent } : null,
    versionChangerMarker,
    modpackMarker,
    state: state ? { override: state.state.override, setAt: state.state.setAt, problem: state.problem } : null,
    variables:
      variables?.map((variable) => ({
        envVariable: variable.envVariable,
        value: variable.value,
        isSecret: variable.isSecret,
      })) ?? null,
    eggName: server.egg.name,
    // The client server API carries no nest, so the egg name, startup command and image are all there is.
    nestName: null,
    startup: server.startup,
    image: server.image,
  };

  return detect(inputs);
}
