import { existsSync } from 'node:fs'
import path from 'path'
import { resolveWithinDir } from './safe-path'
import { uploadsRoots } from './upload-root'

/**
 * Where a stored file URL lives on disk.
 *
 * Three shapes have been stored over time: the current protected route, the
 * older `/api/files/` route, and the legacy `/uploads/...` under `public`.
 * All three are resolved inside their own root and refused when the result
 * would leave it: a stored value is data somebody typed at some point, and
 * `..` in it must never reach `readFile` or `unlink`.
 */
export class UploadPathError extends Error {
  constructor(fileUrl: string) {
    super(`Upload path escapes the upload directory: ${fileUrl.slice(0, 80)}`)
    this.name = 'UploadPathError'
  }
}

const PUBLIC_ROOT = () => path.join(process.cwd(), 'public')

function contained(root: string, relative: string, fileUrl: string): string {
  const resolved = resolveWithinDir(root, relative)
  if (!resolved) throw new UploadPathError(fileUrl)
  return resolved
}

/**
 * The upload roots this file could be under, in order: where uploads are
 * written now, and where they were written before the app read `DATA_ROOT`.
 * The first that has the file wins; with nothing found the first is returned,
 * so the caller's own read fails with a missing file rather than a wrong path.
 */
function underUploads(relative: string, fileUrl: string): string {
  const candidates = uploadsRoots().map((root) => contained(root, relative, fileUrl))
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0]
}

export function resolveUploadPath(fileUrl: string): string {
  if (fileUrl.startsWith('/api/protected/files/')) {
    // /api/protected/files/orgId/category/filename → <uploads>/orgId/category/filename
    return underUploads(fileUrl.replace('/api/protected/files/', ''), fileUrl)
  }

  if (fileUrl.startsWith('/api/files/')) {
    // /api/files/orgId/category/filename → <uploads>/orgId/category/filename
    return underUploads(fileUrl.replace('/api/files/', ''), fileUrl)
  }

  // Legacy: /uploads/category/filename → public/uploads/category/filename
  return contained(PUBLIC_ROOT(), fileUrl.replace(/^\/+/, ''), fileUrl)
}

/** The same, but null instead of an error, for cleanup loops that must not stop. */
export function safeUploadPath(fileUrl: string | null | undefined): string | null {
  if (!fileUrl) return null
  try {
    return resolveUploadPath(fileUrl)
  } catch {
    return null
  }
}
