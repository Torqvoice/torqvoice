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
  const base = path.resolve(baseDir);
  const target = path.resolve(base, relativePath);
  if (target === base || target.startsWith(base + path.sep)) {
    return target;
  }
  return null;
}
