import { AxiosError } from 'axios';
import { axiosInstance, getHttpStatus } from '@/api/axios.ts';
import createDirectory from '@/api/server/files/createDirectory.ts';
import deleteFiles from '@/api/server/files/deleteFiles.ts';
import getFileUploadUrl from '@/api/server/files/getFileUploadUrl.ts';
import type { PluginLoader } from './loaders.ts';
import { fileFor, type PluginVersion, type VersionFile } from './catalog.ts';
import { DISABLED_SUFFIX, isAllowedDownload, isValidJarName, temporaryUploadName } from './fileRules.ts';
import { deleteInPlugins, type InstalledPlugin, PLUGINS_DIRECTORY, renameInPlugins } from './plugins.ts';
import { listDirectory } from './serverFiles.ts';
import { forgetInstalled, recordInstalled } from './stateFile.ts';

// Installs run in the browser through the panel's own file routes (pull, rename, delete, upload); after every pull or
// upload this extension's backend fingerprints the new file and the install is undone when it doesn't match.

export type InstallErrorKind =
  /** The version has no jar for this platform. */
  | 'noFile'
  /** No direct download (CurseForge "Manual download", Hangar "External download"). */
  | 'notDownloadable'
  /** The file name or download host is not allowed. */
  | 'unsafeFile'
  /** The source gave no checksum, so the download can't be verified. */
  | 'noChecksum'
  /** Another file already has the target name. */
  | 'exists'
  /** The downloaded file doesn't match the published checksum; it was removed again. */
  | 'mismatch'
  /** Like `mismatch`, but the bad file could not be removed. */
  | 'mismatchLeft'
  /** The uploaded jar isn't the expected CurseForge file. */
  | 'uploadMismatch'
  /** Core's pull limit; `seconds` until the next pull is allowed. */
  | 'rateLimited'
  /** The new jar is in place, but the replaced one could not be deleted (two copies stop the plugin loading). */
  | 'oldNotRemoved'
  /** The new jar is in place, but the backup of the replaced one is left over. */
  | 'backupLeft'
  /** The switch failed and the old jar could not be put back from its backup. */
  | 'restoreFailed';

export class InstallError extends Error {
  readonly kind: InstallErrorKind;
  readonly file: string;
  readonly seconds: number;
  /** The underlying failure (e.g. the pull's HTTP error) when the install was rolled back. */
  readonly cause: unknown;

  constructor(kind: InstallErrorKind, file = '', options: { seconds?: number; cause?: unknown } = {}) {
    super(`${kind}${file ? `: ${file}` : ''}`);
    this.kind = kind;
    this.file = file;
    this.seconds = options.seconds ?? 0;
    this.cause = options.cause;
  }
}

interface ExpectedHash {
  algorithm: 'sha1' | 'sha256' | 'sha512' | 'curseforge';
  value: string;
}

/** The strongest checksum the source publishes: Modrinth SHA-512 (else SHA-1), CurseForge fingerprint (else SHA-1), Hangar SHA-256. */
function expectedHash(file: VersionFile): ExpectedHash | null {
  if (file.hashes.sha512) return { algorithm: 'sha512', value: file.hashes.sha512 };
  if (file.hashes.sha256) return { algorithm: 'sha256', value: file.hashes.sha256 };
  if (file.fingerprint) return { algorithm: 'curseforge', value: file.fingerprint };
  if (file.hashes.sha1) return { algorithm: 'sha1', value: file.hashes.sha1 };
  return null;
}

/** Asks this extension's backend whether `fileName` in `plugins/` has the expected checksum. */
async function verifyFile(uuid: string, fileName: string, expected: ExpectedHash): Promise<boolean> {
  const { data } = await axiosInstance.post(`/api/client/servers/${uuid}/mcplugins/verify`, {
    file: fileName,
    algorithm: expected.algorithm,
    expected: expected.value,
  });
  return data.matches === true;
}

function rateLimitSeconds(error: unknown): number | null {
  if (getHttpStatus(error) !== 429) return null;
  const header = error instanceof AxiosError ? Number(error.response?.headers?.['retry-after']) : Number.NaN;
  return Number.isFinite(header) && header > 0 ? header : 60;
}

/** Rewrites core's 429 as an `InstallError` with the wait time; other errors pass through. */
function asRateLimit(error: unknown): unknown {
  const seconds = rateLimitSeconds(error);
  return seconds === null ? error : new InstallError('rateLimited', '', { seconds, cause: error });
}

async function pull(uuid: string, url: string, name: string) {
  try {
    await axiosInstance.post(`/api/client/servers/${uuid}/files/pull`, {
      root: PLUGINS_DIRECTORY,
      url,
      name,
      foreground: true,
    });
  } catch (error) {
    throw asRateLimit(error);
  }
}

async function ensurePluginsDirectory(uuid: string): Promise<string[]> {
  const entries = await listDirectory(uuid, PLUGINS_DIRECTORY);
  if (entries === null) {
    await createDirectory(uuid, '/', PLUGINS_DIRECTORY.slice(1));
    return [];
  }
  return entries.map((entry) => entry.name);
}

const sameName = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * Puts a new jar at `target` with `put` (which leaves either a verified file or nothing), replacing `replacing`:
 * - same name: the old jar is renamed to `<name>.backup` first and restored when `put` fails;
 * - other name: the old jar is deleted only after the new one is verified, and a failed delete is reported by name.
 */
async function placeSafely(
  uuid: string,
  target: string,
  replacing: InstalledPlugin | null,
  existing: string[],
  put: (target: string) => Promise<void>,
) {
  const taken = (name: string) => existing.some((entry) => sameName(entry, name));

  if (replacing && sameName(replacing.fileName, target)) {
    const backup = `${replacing.fileName}.backup`;
    if (taken(backup)) throw new InstallError('exists', backup);
    await renameInPlugins(uuid, replacing.fileName, backup);
    try {
      await put(replacing.fileName);
    } catch (error) {
      try {
        await renameInPlugins(uuid, backup, replacing.fileName);
      } catch {
        throw new InstallError('restoreFailed', backup, { cause: error });
      }
      throw error;
    }
    await deleteInPlugins(uuid, backup).catch(() => {
      throw new InstallError('backupLeft', backup);
    });
    return;
  }

  if (taken(target)) throw new InstallError('exists', target);
  await put(target);
  if (replacing) {
    await deleteInPlugins(uuid, replacing.fileName).catch(() => {
      throw new InstallError('oldNotRemoved', replacing.fileName);
    });
  }
}

/** Removes a file that failed verification; `false` when it couldn't be removed. */
const discard = (uuid: string, name: string) =>
  deleteFiles(uuid, PLUGINS_DIRECTORY, [name]).then(
    ({ deleted }) => deleted > 0,
    () => false,
  );

function targetName(file: VersionFile, replacing: InstalledPlugin | null) {
  return replacing && !replacing.enabled ? `${file.filename}${DISABLED_SUFFIX}` : file.filename;
}

/** After a Hangar install, remember the jar so it can be identified and updated later. */
async function rememberHangar(
  uuid: string,
  version: PluginVersion,
  file: VersionFile,
  replacing: InstalledPlugin | null,
) {
  try {
    if (replacing?.record && replacing.record.file !== file.filename)
      await forgetInstalled(uuid, [replacing.record.file]);
    if (version.source === 'hangar' && file.hashes.sha256) {
      await recordInstalled(uuid, {
        file: file.filename,
        sha256: file.hashes.sha256,
        project: version.projectId,
        version: version.id,
      });
    }
  } catch {
    // Without the record the jar still works; it just shows as unidentified.
  }
}

/** The installable file of `version` for `loader`, or the reason it can't be installed. */
function installableFile(version: PluginVersion, loader: PluginLoader | null): VersionFile {
  const file = fileFor(version, loader);
  if (!file) throw new InstallError('noFile');
  if (!file.url) throw new InstallError('notDownloadable', file.filename);
  if (!isValidJarName(file.filename) || !isAllowedDownload(version.source, file.url)) {
    throw new InstallError('unsafeFile', file.filename);
  }
  return file;
}

/**
 * Downloads `version` into the plugins folder, verifies it and, when `replacing` is given (update, switch version),
 * swaps it for the old jar, keeping the old jar's enabled/disabled state. Returns the new file name.
 */
export async function installPluginVersion(
  uuid: string,
  version: PluginVersion,
  loader: PluginLoader | null,
  replacing: InstalledPlugin | null,
): Promise<string> {
  const file = installableFile(version, loader);
  const expected = expectedHash(file);
  if (!expected) throw new InstallError('noChecksum', file.filename);
  const url = file.url!;

  const existing = await ensurePluginsDirectory(uuid);
  const target = targetName(file, replacing);

  await placeSafely(uuid, target, replacing, existing, async (name) => {
    await pull(uuid, url, name);
    if (!(await verifyFile(uuid, name, expected))) {
      throw new InstallError((await discard(uuid, name)) ? 'mismatch' : 'mismatchLeft', name);
    }
  });

  await rememberHangar(uuid, version, file, replacing);
  return target;
}

/**
 * Installs a jar the user downloaded from CurseForge themselves: it is uploaded under a temporary name, its CurseForge
 * fingerprint is checked against the expected file, and only then renamed into place.
 */
export async function installUploadedJar(
  uuid: string,
  version: PluginVersion,
  upload: File,
  replacing: InstalledPlugin | null,
): Promise<string> {
  const file = version.file;
  if (!file || !isValidJarName(file.filename)) throw new InstallError('noFile');
  const expected: ExpectedHash | null = file.fingerprint
    ? { algorithm: 'curseforge', value: file.fingerprint }
    : file.hashes.sha1
      ? { algorithm: 'sha1', value: file.hashes.sha1 }
      : null;
  if (!expected) throw new InstallError('noChecksum', file.filename);

  const existing = await ensurePluginsDirectory(uuid);
  const temporary = temporaryUploadName();

  const { url } = await getFileUploadUrl(uuid, PLUGINS_DIRECTORY);
  const form = new FormData();
  form.append('files', upload, temporary);
  await axiosInstance.post(url, form, { headers: { 'Content-Type': 'multipart/form-data' } });

  if (!(await verifyFile(uuid, temporary, expected))) {
    await discard(uuid, temporary);
    throw new InstallError('uploadMismatch', upload.name);
  }

  const target = targetName(file, replacing);
  try {
    await placeSafely(uuid, target, replacing, existing, (name) => renameInPlugins(uuid, temporary, name));
  } catch (error) {
    await discard(uuid, temporary);
    throw error;
  }
  return target;
}
