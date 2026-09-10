import path from 'node:path'

/**
 * Where this installation keeps the files people upload.
 *
 * `DATA_ROOT` moves the whole data directory, which is what a self-hosted
 * install wants when the disk with room on it is not the disk the app was
 * unpacked on. Unset — which is every install that has not been told
 * otherwise — it is `data` beside the app, exactly where every file has
 * always been written.
 *
 * The seed script has honoured this variable since it was written and the app
 * never did, so anyone who set it had their uploads written to the default
 * anyway. Reads therefore try the configured root and then the old default,
 * which is what makes turning this on lossless: files already on disk keep
 * resolving, and new ones go where the variable says.
 */

/** The data directory: `DATA_ROOT`, or `data` beside the app. */
export function dataRoot(): string {
  return process.env.DATA_ROOT || path.join(process.cwd(), 'data')
}

/** Where uploads live now. */
export function uploadsRoot(): string {
  return path.join(dataRoot(), 'uploads')
}

/**
 * Where uploads lived before the app read `DATA_ROOT`. The same directory
 * unless the variable is set, and the reason an upgrade loses nothing.
 */
export function legacyUploadsRoot(): string {
  return path.join(process.cwd(), 'data', 'uploads')
}

/** Every root a stored file could be under, nearest first. */
export function uploadsRoots(): string[] {
  const roots = [uploadsRoot()]
  const legacy = legacyUploadsRoot()
  if (legacy !== roots[0]) roots.push(legacy)
  return roots
}

/** One organisation's upload directory, optionally a category within it. */
export function orgUploadDir(organizationId: string, ...segments: string[]): string {
  return path.join(uploadsRoot(), organizationId, ...segments)
}
