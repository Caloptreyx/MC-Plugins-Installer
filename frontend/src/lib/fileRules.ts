// Pure module (no panel imports). Rules for what may be pulled into `plugins/` and under which name.
import type { PluginSource } from './catalog.ts';

/** Suffix that keeps a jar in the plugins folder without the server loading it. */
export const DISABLED_SUFFIX = '.disabled';

/** Only these hosts (https, exact host) are handed to the node as download URLs. */
const DOWNLOAD_HOSTS: Record<PluginSource, string[]> = {
  modrinth: ['cdn.modrinth.com'],
  curseforge: ['edge.forgecdn.net', 'mediafilez.forgecdn.net'],
  hangar: ['hangarcdn.papermc.io'],
};

export function isAllowedDownload(source: PluginSource, url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && DOWNLOAD_HOSTS[source].includes(parsed.hostname);
  } catch {
    return false;
  }
}

/** A single path segment ending in `.jar` (any case): no leading dot, no control characters, not a sources jar. */
export function isValidJarName(name: string): boolean {
  return (
    name.length > 0 &&
    name.length <= 255 &&
    !name.startsWith('.') &&
    ![...name].some((char) => char === '/' || char === '\\' || char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) &&
    name.toLowerCase().endsWith('.jar') &&
    !name.toLowerCase().endsWith('-sources.jar')
  );
}

export const isDisabledName = (fileName: string) => fileName.toLowerCase().endsWith(`.jar${DISABLED_SUFFIX}`);

/** The jar name a plugin has when enabled. */
export const jarNameOf = (fileName: string) =>
  isDisabledName(fileName) ? fileName.slice(0, -DISABLED_SUFFIX.length) : fileName;

/** Only `http:` / `https:` links are rendered as links. */
export function safeHref(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : null;
  } catch {
    return null;
  }
}

/** Temporary name a manually uploaded jar gets until its fingerprint is checked. */
export function temporaryUploadName(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const random = crypto.getRandomValues(new Uint8Array(16));
  return `.mcpi-upload-${Array.from(random, (byte) => alphabet[byte % alphabet.length]).join('')}.tmp`;
}
