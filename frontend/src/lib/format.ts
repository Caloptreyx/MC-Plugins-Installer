const compactNumber = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });

export const formatCount = (value: number) => compactNumber.format(value);

/** Release-style Minecraft version such as `1.21.4` or `26.3`; snapshots and pre-releases do not match. */
export const RELEASE_VERSION = /^\d+\.\d+(?:\.\d+)?$/;

/**
 * Any Minecraft version a server can run (the same rule as MC Mod Installer's detector): `1.N`, `1.N.N`, year-numbered
 * `NN.N` / `NN.N.N` (NN ≥ 25), optionally with `-preN`, `-rcN` or `-snapshotN`, and weekly snapshots like `24w14a`.
 */
export const MINECRAFT_VERSION =
  /^(?:(?:1|2[5-9]|[3-9][0-9])\.[0-9]+(?:\.[0-9]+)?(?:-(?:pre|rc|snapshot)-?[0-9]+)?|[0-9]{2}w[0-9]{2}[a-z])$/;

/** Orders Minecraft versions numerically (`1.9` < `1.21` < `26.1`); non-numeric parts compare as text. */
export function compareGameVersions(a: string, b: string): number {
  const left = a.split(/[.-]/);
  const right = b.split(/[.-]/);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const l = left[i] ?? '0';
    const r = right[i] ?? '0';
    const ln = Number(l);
    const rn = Number(r);
    const diff = Number.isNaN(ln) || Number.isNaN(rn) ? l.localeCompare(r) : ln - rn;
    if (diff !== 0) return diff;
  }
  return 0;
}

/** Release versions from `versions`, deduplicated and newest first. */
export function newestFirst(versions: readonly string[]): string[] {
  return [...new Set(versions.filter((version) => RELEASE_VERSION.test(version)))].sort((a, b) =>
    compareGameVersions(b, a),
  );
}

/** Oldest to newest supported release, e.g. `1.20.1 – 1.21.4` (versions are sorted newest first). */
export function gameVersionRange(versions: readonly string[]): string | null {
  if (versions.length === 0) return null;
  if (versions.length === 1) return versions[0];
  return `${versions[versions.length - 1]} – ${versions[0]}`;
}
