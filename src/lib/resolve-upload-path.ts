import path from 'path'
import { resolveWithinDir } from './safe-path'

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

const UPLOAD_ROOT = () => path.join(process.cwd(), 'data', 'uploads')
const LEGACY_ROOT = () => path.join(process.cwd(), 'public')

function contained(root: string, relative: string, fileUrl: string): string {
  const resolved = resolveWithinDir(root, relative)
  if (!resolved) throw new UploadPathError(fileUrl)
  return resolved
}

export function resolveUploadPath(fileUrl: string): string {
  if (fileUrl.startsWith('/api/protected/files/')) {
    // /api/protected/files/orgId/category/filename → data/uploads/orgId/category/filename
    return contained(UPLOAD_ROOT(), fileUrl.replace('/api/protected/files/', ''), fileUrl)
  }

  if (fileUrl.startsWith('/api/files/')) {
    // /api/files/orgId/category/filename → data/uploads/orgId/category/filename
    return contained(UPLOAD_ROOT(), fileUrl.replace('/api/files/', ''), fileUrl)
  }

  // Legacy: /uploads/category/filename → public/uploads/category/filename
  return contained(LEGACY_ROOT(), fileUrl.replace(/^\/+/, ''), fileUrl)
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
