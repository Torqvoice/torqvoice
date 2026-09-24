import 'server-only'

import { db } from '@/lib/db'
import { UPLOAD_CATEGORIES } from '@/lib/upload-url'

/**
 * Every place in the database that can point at an uploaded file.
 *
 * The file manager (lib/files/manager.ts) keeps a file on disk for as long as
 * any row here still mentions it, which is what makes deleting safe when two
 * rows share one file: a tire set's photo copied onto a work order, a job
 * photo sent over WhatsApp, a logo used by the company settings and by an
 * invoice design, a gallery image that is also the part's main image.
 *
 * A file is matched by its folder and name (`/services/<uuid>.jpg`), not by
 * the whole URL: a row restored from another workshop's backup can still
 * carry that workshop's id in its URL while the file sits in this one's
 * folder, and that row still needs the file. Names the app generates are
 * random UUIDs, so the match is exact in practice.
 *
 * `src/__tests__/lib/files/references.test.ts` reads the Prisma schema and
 * fails when a column that could hold a file URL is missing from this list,
 * so a new column cannot be forgotten.
 */
export interface FileReference {
  /** Prisma model and field, for the schema test and for people. */
  model: string
  field: string
  /**
   * SQL listing every `/<folder>/<name>` the column mentions. Static text
   * only: the pattern it matches with arrives as a parameter.
   */
  sql: string
}

// Tables are named with their schema, as every raw query in the app is: the AI
// sandbox's temporary views share these names (see raw-sql-qualified.test.ts).
//
// Each entry lists the `/<folder>/<name>` its column mentions, as a plain
// subquery (not correlated with the candidates), so each table is read once
// per query however many files are being checked. Two ways of reading a value:
//
// - A column that holds one URL: its last two path segments, with any query
//   string cut off. String functions only, because a regular expression costs
//   about a hundred times more per row and these are the big tables.
// - A value that can hold URLs anywhere inside (JSON, and settings): the
//   STORED_SUFFIX pattern, `$2`, on the rows that mention `/files/` at all.
//   These tables are small.

/** `/<folder>/<name>` of a single URL: its last two segments, without `?…`. */
const lastTwo = (value: string) => {
  const path = `split_part(${value}, '?', 1)`
  return `'/' || reverse(split_part(reverse(${path}), '/', 2)) || '/' || reverse(split_part(reverse(${path}), '/', 1))`
}

/** A text column holding one URL. */
const text = (table: string, column: string) =>
  `SELECT ${lastTwo(`t."${column}"`)} FROM "public"."${table}" t WHERE t."${column}" LIKE '%/files/%'`

/** A text[] column holding one URL per element. */
const array = (table: string, column: string) =>
  `SELECT ${lastTwo('u.v')} FROM "public"."${table}" t, unnest(t."${column}") AS u(v) WHERE u.v LIKE '%/files/%'`

/** A value with URLs anywhere inside it: JSON, or a setting of any shape. */
const anywhere = (table: string, column: string, cast = '') =>
  `SELECT m[1] FROM "public"."${table}" t, regexp_matches(t."${column}"${cast}, $2, 'g') AS m WHERE t."${column}"${cast} LIKE '%/files/%'`

const json = (table: string, column: string) => anywhere(table, column, '::text')

export const FILE_REFERENCES: FileReference[] = [
  { model: 'ServiceAttachment', field: 'fileUrl', sql: text('service_attachments', 'fileUrl') },
  { model: 'QuoteAttachment', field: 'fileUrl', sql: text('quote_attachments', 'fileUrl') },
  { model: 'TireSetAttachment', field: 'fileUrl', sql: text('tire_set_attachments', 'fileUrl') },
  { model: 'Vehicle', field: 'imageUrl', sql: text('vehicles', 'imageUrl') },
  { model: 'InventoryPart', field: 'imageUrl', sql: text('inventory_parts', 'imageUrl') },
  { model: 'StoredImage', field: 'url', sql: text('stored_images', 'url') },
  { model: 'InspectionItem', field: 'imageUrls', sql: array('inspection_items', 'imageUrls') },
  {
    model: 'InspectionAttachment',
    field: 'fileUrl',
    sql: text('inspection_attachments', 'fileUrl'),
  },
  { model: 'VehicleFinding', field: 'imageUrls', sql: array('vehicle_findings', 'imageUrls') },
  { model: 'StatusReport', field: 'videoUrl', sql: text('status_reports', 'videoUrl') },
  { model: 'WhatsappMessage', field: 'mediaUrl', sql: text('whatsapp_messages', 'mediaUrl') },
  // Workshop logo, invoice and quote logos, the portal background. Every
  // setting is searched, so a new file-valued setting is covered too.
  { model: 'AppSetting', field: 'value', sql: anywhere('app_settings', 'value') },
  { model: 'DocumentDesign', field: 'template', sql: json('document_designs', 'template') },
  {
    model: 'DocumentDesignSnapshot',
    field: 'template',
    sql: json('document_design_snapshots', 'template'),
  },
  { model: 'EmailTemplate', field: 'theme', sql: json('email_templates', 'theme') },
  { model: 'EmailTemplate', field: 'blocks', sql: json('email_templates', 'blocks') },
]

/**
 * `/<folder>/<name>` as the upload URLs spell it (`…/files/<org>/<folder>/<name>`,
 * in either the `/api/protected/files/` or the older `/api/files/` form), for
 * the folders the app writes and the names the manager will act on
 * (lib/files/manager.ts). Anchored on `/files/<org>/`, so a workshop id can
 * never be read as a folder. A name ends where a URL or a JSON string does: at
 * a quote, a `?`, a space.
 */
export const STORED_SUFFIX = `/files/[^/"?\\s]+(/(?:${UPLOAD_CATEGORIES.join('|')})/[A-Za-z0-9][A-Za-z0-9._-]*)`

/**
 * Which of these suffixes (`/<folder>/<name>`) any row still mentions, in one
 * query. Throws if the database cannot answer: a caller that cannot tell
 * whether a file is in use must keep it.
 */
export async function referencedSuffixes(suffixes: string[]): Promise<Set<string>> {
  if (suffixes.length === 0) return new Set()
  const mentioned = FILE_REFERENCES.map((ref) => ref.sql).join('\n  UNION ALL\n  ')
  const rows = await db.$queryRawUnsafe<{ s: string }[]>(
    `SELECT DISTINCT candidates.s FROM (SELECT unnest($1::text[]) AS s) AS candidates
     WHERE candidates.s IN (\n  ${mentioned}\n)`,
    suffixes,
    STORED_SUFFIX
  )
  return new Set(rows.map((row) => row.s))
}

/**
 * Every `/<folder>/<name>` any row mentions, for the sweep: one read of each
 * table per run, compared in memory, instead of one per batch of files.
 */
export async function allReferencedSuffixes(): Promise<Set<string>> {
  // The pattern is the only parameter here, so `$2` in the entries becomes `$1`.
  const mentioned = FILE_REFERENCES.map((ref) => ref.sql.replaceAll('$2', '$1')).join(
    '\n  UNION\n  '
  )
  const rows = await db.$queryRawUnsafe<{ s: string }[]>(
    `SELECT used.s FROM (\n  ${mentioned}\n) AS used(s)`,
    STORED_SUFFIX
  )
  return new Set(rows.map((row) => row.s))
}

/**
 * Which of these workshops exist in the database the app is connected to.
 * The sweep only ever looks in the folders of these: a folder whose workshop
 * this database does not know is not this database's to judge.
 */
export async function existingOrganizationIds(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set()
  const rows = await db.organization.findMany({ where: { id: { in: ids } }, select: { id: true } })
  return new Set(rows.map((row) => row.id))
}

/** Whether the database has any workshop at all: an empty one is never swept against. */
export async function hasAnyOrganization(): Promise<boolean> {
  return (await db.organization.count()) > 0
}
