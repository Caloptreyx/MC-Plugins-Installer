import { getHttpStatus } from '@/api/axios.ts';
import deleteFiles from '@/api/server/files/deleteFiles.ts';
import getFileContent from '@/api/server/files/getFileContent.ts';
import saveFileContent from '@/api/server/files/saveFileContent.ts';
import {
  EMPTY_STATE,
  type InstalledRecord,
  parseStateFile,
  serializeStateFile,
  STATE_FILE_MAX_BYTES,
  STATE_FILE_NAME,
  STATE_FILE_PATH,
  type SoftwareOverride,
  type StateFile,
  type StateFileProblem,
} from './stateFormat.ts';

export interface StateFileRead {
  state: StateFile;
  /** Whether the file exists. */
  present: boolean;
  problem: StateFileProblem | null;
}

/** Reads `/.mc-plugins-installer.json` (needs `files.read-content`); a missing file is an empty state. */
export async function readStateFile(uuid: string): Promise<StateFileRead> {
  let blob: Blob;
  try {
    blob = await getFileContent(uuid, STATE_FILE_PATH);
  } catch (error) {
    if (getHttpStatus(error) === 404) return { state: EMPTY_STATE, present: false, problem: null };
    throw error;
  }
  if (blob.size > STATE_FILE_MAX_BYTES) return { state: EMPTY_STATE, present: true, problem: 'too_large' };
  return { ...parseStateFile(await blob.text()), present: true };
}

async function writeStateFile(uuid: string, state: StateFile) {
  const content = serializeStateFile(state);
  if (content === null) {
    await deleteFiles(uuid, '/', [STATE_FILE_NAME]).catch((error) => {
      if (getHttpStatus(error) !== 404) throw error;
    });
  } else {
    await saveFileContent(uuid, STATE_FILE_PATH, content);
  }
}

/** Saves (or with `null` clears) the manual server software override, keeping the install records. */
export async function saveOverride(uuid: string, override: SoftwareOverride | null) {
  const { state } = await readStateFile(uuid);
  await writeStateFile(uuid, {
    ...state,
    override,
    setAt: override ? new Date().toISOString() : null,
  });
}

/** Remembers a Hangar install (replacing any record for the same jar name). */
export async function recordInstalled(uuid: string, record: InstalledRecord) {
  const { state } = await readStateFile(uuid);
  await writeStateFile(uuid, {
    ...state,
    installed: [...state.installed.filter((entry) => entry.file !== record.file), record],
  });
}

/** Drops the records of jars that were removed or replaced. */
export async function forgetInstalled(uuid: string, files: string[]) {
  const { state } = await readStateFile(uuid);
  const installed = state.installed.filter((entry) => !files.includes(entry.file));
  if (installed.length !== state.installed.length) await writeStateFile(uuid, { ...state, installed });
}
