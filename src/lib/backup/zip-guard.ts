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

/** The declared sizes of a zip's entries, as JSZip exposes them. */
export interface ZipEntryLike {
  dir: boolean
  _data?: { uncompressedSize?: number }
}

export function assertZipWithinLimits(
  entries: Record<string, ZipEntryLike>,
  limits: ZipLimits = BACKUP_ZIP_LIMITS
): { entries: number; totalBytes: number } {
  const names = Object.keys(entries)
  if (names.length > limits.maxEntries) {
    throw new Error(`The archive has too many entries (${names.length})`)
  }
  let totalBytes = 0
  for (const name of names) {
    const entry = entries[name]
    if (entry.dir) continue
    const size = entry._data?.uncompressedSize ?? 0
    if (!Number.isFinite(size) || size < 0)
      throw new Error(`The archive entry ${name} has an invalid size`)
    totalBytes += size
    if (totalBytes > limits.maxTotalBytes) {
      throw new Error('The archive is too large to restore')
    }
  }
  return { entries: names.length, totalBytes }
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
