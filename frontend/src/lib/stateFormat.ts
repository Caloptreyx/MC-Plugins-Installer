// Pure module (no panel imports): also loaded by the node tests in tests/.
import { isSoftware, type Software } from './software.ts';

/** This extension's own file in the server root: the manual override and the Hangar install records. */
export const STATE_FILE_NAME = '.mc-plugins-installer.json';
export const STATE_FILE_PATH = `/${STATE_FILE_NAME}`;
/** Larger files are ignored (the install list keeps it well below this). */
export const STATE_FILE_MAX_BYTES = 64 * 1024;

export interface SoftwareOverride {
  software: Software;
  minecraftVersion: string | null;
  loaderVersion: string | null;
}

/** A jar installed from Hangar, which has no hash lookup: it is recognised again by this record. */
export interface InstalledRecord {
  /** Jar name in `plugins/` (without `.disabled`). */
  file: string;
  /** Lowercase hex SHA-256 of the jar. */
  sha256: string;
  /** Hangar project id. */
  project: string;
  /** Hangar version id. */
  version: string;
}

export interface StateFile {
  override: SoftwareOverride | null;
  /** RFC 3339 time the override was set. */
  setAt: string | null;
  installed: InstalledRecord[];
}

export type StateFileProblem = 'invalid' | 'too_large';

export const EMPTY_STATE: StateFile = { override: null, setAt: null, installed: [] };

const optionalString = (value: unknown, max = 64): string | null =>
  typeof value === 'string' && value.trim() !== '' && value.length <= max ? value.trim() : null;

const HEX_64 = /^[0-9a-f]{64}$/;

function parseRecord(value: unknown): InstalledRecord | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const file = optionalString(record.file, 255);
  const sha256 = optionalString(record.sha256)?.toLowerCase() ?? null;
  const project = optionalString(record.project);
  const version = optionalString(record.version);
  if (!file || !sha256 || !HEX_64.test(sha256) || !project || !version) return null;
  return { file, sha256, project, version };
}

/**
 * Reads the state file. An override with an unknown software id makes the whole override invalid (it is ignored and
 * reported); broken install records are dropped one by one.
 */
export function parseStateFile(raw: string): { state: StateFile; problem: StateFileProblem | null } {
  if (raw.length > STATE_FILE_MAX_BYTES) return { state: EMPTY_STATE, problem: 'too_large' };

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { state: EMPTY_STATE, problem: 'invalid' };
  }
  if (!json || typeof json !== 'object' || Array.isArray(json)) return { state: EMPTY_STATE, problem: 'invalid' };
  const data = json as Record<string, unknown>;

  let problem: StateFileProblem | null = null;
  let override: SoftwareOverride | null = null;
  if (data.override !== undefined && data.override !== null) {
    const value = data.override as Record<string, unknown>;
    if (typeof value === 'object' && isSoftware(value.software)) {
      override = {
        software: value.software,
        minecraftVersion: optionalString(value.minecraftVersion),
        loaderVersion: optionalString(value.loaderVersion),
      };
    } else {
      problem = 'invalid';
    }
  }

  const installed = Array.isArray(data.installed)
    ? data.installed.map(parseRecord).filter((record): record is InstalledRecord => record !== null)
    : [];

  return {
    state: { override, setAt: override ? optionalString(data.setAt) : null, installed },
    problem,
  };
}

/** `null` when nothing is left to store (the file is then removed). */
export function serializeStateFile(state: StateFile): string | null {
  if (!state.override && state.installed.length === 0) return null;
  const data: Record<string, unknown> = {};
  if (state.override) {
    data.override = state.override;
    data.setAt = state.setAt ?? new Date().toISOString();
  }
  if (state.installed.length > 0) data.installed = state.installed;
  return `${JSON.stringify(data, null, 2)}\n`;
}
