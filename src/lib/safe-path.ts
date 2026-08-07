import path from "path";

/**
 * Safely resolve an archive- or user-supplied relative path against a trusted
 * base directory, guaranteeing the result cannot escape that directory.
 *
 * Returns the absolute resolved path when it stays inside `baseDir`, or `null`
 * when the entry would escape it (zip-slip / path traversal). Absolute inputs
 * and `..` sequences that climb above the base both resolve to `null`.
 *
 * Callers should treat `null` as "reject this entry" — never fall back to the
 * raw joined path.
 */
export function resolveWithinDir(baseDir: string, relativePath: string): string | null {
  // Callers pass archive-/backup-relative entry paths; an absolute input is
  // never legitimate and could escape via a drive/root, so reject it outright.
  if (path.isAbsolute(relativePath)) {
    return null;
  }
  const base = path.resolve(baseDir);
  const target = path.resolve(base, relativePath);
  // Use path.relative rather than a string prefix check so this stays correct
  // when base is the filesystem root (where `base + sep` would be `//`) and on
  // Windows. `target` is inside `base` iff the relative path neither climbs
  // out ("..") nor is itself absolute.
  const rel = path.relative(base, target);
  if (rel === "" || (rel !== ".." && !rel.startsWith(".." + path.sep) && !path.isAbsolute(rel))) {
    return target;
  }
  return null;
}
