/**
 * A backup's file URLs, pointed at the workshop restoring it.
 *
 * Every stored URL names the workshop the file belongs to
 * (`/api/protected/files/<org>/<folder>/<name>`), while a restore writes each
 * file into the folder of the workshop it is being restored into. A URL left
 * as it was then names a folder this workshop may not read, so the photo or
 * document simply stops showing, and its own copy of the file is orphaned.
 *
 * Restoring into the same workshop rewrites every URL to itself, which is why
 * these run on every restore rather than only on a cross-workshop one.
 */

/** One stored URL, in any shape uploads have had, under `newOrgId`. */
export function rewriteFileUrl(url: string | null | undefined, newOrgId: string): string | null {
  if (!url) return null
  // New format: /api/protected/files/OLD_ORG_ID/category/filename
  if (url.startsWith('/api/protected/files/')) {
    return url.replace(/^\/api\/protected\/files\/[^/]+\//, `/api/protected/files/${newOrgId}/`)
  }
  // Old format (pre-restructure): /api/files/OLD_ORG_ID/category/filename
  if (url.startsWith('/api/files/')) {
    return url.replace(/^\/api\/files\/[^/]+\//, `/api/protected/files/${newOrgId}/`)
  }
  // Legacy format: /uploads/category/filename → convert to new format
  if (url.startsWith('/uploads/')) {
    const relative = url.replace(/^\/uploads\//, '')
    return `/api/protected/files/${newOrgId}/${relative}`
  }
  // Anything else is not one of the app's own uploads: a link to a supplier,
  // a remote attachment, plain text. It is restored as it was.
  return url
}

/**
 * The named file columns of one restored row, rewritten. `columns` is what
 * `columnsOf` built; the values are read from the backup row, because
 * `columnsOf` drops every array (in a backup row an array is normally the
 * nested rows of another table) and a text[] of photo URLs is one.
 */
export function withFileUrls(
  row: Record<string, unknown>,
  columns: Record<string, unknown>,
  fields: readonly string[],
  newOrgId: string
): Record<string, unknown> {
  const rewrite = (value: unknown) =>
    typeof value === 'string' ? (rewriteFileUrl(value, newOrgId) ?? value) : value
  for (const field of fields) {
    const value = row[field]
    if (typeof value === 'string') columns[field] = rewrite(value)
    else if (Array.isArray(value)) columns[field] = value.map(rewrite)
  }
  return columns
}

/**
 * Every stored URL anywhere inside a value, for the JSON columns a look is
 * kept in: a design's logo, an email template's images. Everything that is
 * not a stored URL comes back unchanged, keys and order included.
 */
export function rewriteFileUrlsWithin(value: unknown, newOrgId: string): unknown {
  if (typeof value === 'string') return rewriteFileUrl(value, newOrgId) ?? value
  if (Array.isArray(value)) return value.map((item) => rewriteFileUrlsWithin(item, newOrgId))
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        rewriteFileUrlsWithin(item, newOrgId),
      ])
    )
  }
  return value
}
