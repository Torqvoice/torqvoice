/**
 * What a backup archive may ask of the server before it is extracted.
 *
 * A zip is a list of promises about how big each entry will be once
 * inflated. A small upload can promise terabytes. The importer reads the
 * declared sizes first and refuses the archive when the count or the total
 * would not fit, before a single entry is inflated.
 */

export interface ZipLimits {
  maxEntries: number
  maxTotalBytes: number
}

export const BACKUP_ZIP_LIMITS: ZipLimits = {
  maxEntries: 20_000,
  maxTotalBytes: 2 * 1024 * 1024 * 1024,
}

/** The declared size of one zip entry, from the archive's table of contents. */
export interface ZipEntryLike {
  name: string
  dir: boolean
  uncompressedSize: number
}

export function assertZipWithinLimits(
  entries: readonly ZipEntryLike[],
  limits: ZipLimits = BACKUP_ZIP_LIMITS
): { entries: number; totalBytes: number } {
  if (entries.length > limits.maxEntries) {
    throw new Error(`The archive has too many entries (${entries.length})`)
  }
  let totalBytes = 0
  for (const entry of entries) {
    if (entry.dir) continue
    const size = entry.uncompressedSize
    if (!Number.isFinite(size) || size < 0)
      throw new Error(`The archive entry ${entry.name} has an invalid size`)
    totalBytes += size
    if (totalBytes > limits.maxTotalBytes) {
      throw new Error('The archive is too large to restore')
    }
  }
  return { entries: entries.length, totalBytes }
}

/** Refuses a request body that is too large before it is read. */
export function assertContentLength(request: Request, maxBytes: number): void {
  const header = request.headers.get('content-length')
  if (!header) return
  const length = Number(header)
  if (!Number.isFinite(length) || length > maxBytes) {
    throw new Error('The upload is too large')
  }
}
