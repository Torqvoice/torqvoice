import { mkdir, readdir, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import { dataRoot } from '@/lib/upload-root'
import { type OpenedTarget, openTarget, type RunTarget } from './engine'
import { UPLOAD_CATEGORIES } from './manifest'
import { resticDumpToFile, resticFind } from './restic'
import { readJsonFile } from './zip-file'

/**
 * Looking inside a restore point without restoring it.
 *
 * A snapshot holds one `data.json` (every row of the workshop, megabytes)
 * and the uploads folder. Opening a restore point pulls only the data file
 * out of the repository, parses it and removes it from disk at once (it can
 * hold secret keys), and keeps the parsed rows in memory for a quarter of an
 * hour; from
 * there the explorer lists customers, vehicles, work orders, quotes and parts
 * as they were, and searches them. A photo or document is pulled out one at
 * a time when it is opened. Nothing here writes to the workshop.
 *
 * Scope: a restore point is only ever opened through the workshop's own
 * repository (its platform one, or a destination it connected), and a file
 * is only looked for under that workshop's uploads folder in the snapshot.
 */

/** Parsed restore points are dropped after this, and their folder with them. */
const KEEP_OPEN_MS = 15 * 60 * 1000
/** How many restore points one server keeps parsed at a time. */
const MAX_OPEN = 4
/** A data file larger than this is not a workshop's data file. */
const MAX_DATA_BYTES = 512 * 1024 * 1024
/** A single upload pulled out of a snapshot. */
const MAX_FILE_BYTES = 200 * 1024 * 1024
const SNAPSHOT_ID = /^[0-9a-f]{8,64}$/
const FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,200}$/

export type ExploreDataset =
  | 'customers'
  | 'vehicles'
  | 'serviceRecords'
  | 'quotes'
  | 'inventoryParts'
export const EXPLORE_DATASETS: ExploreDataset[] = [
  'customers',
  'vehicles',
  'serviceRecords',
  'quotes',
  'inventoryParts',
]

type Row = Record<string, unknown>

interface OpenPoint {
  key: string
  organizationId: string
  target: RunTarget
  snapshotId: string
  openedAt: number
  dir: string
  exportedAt: string | null
  version: number
  /** The datasets the explorer shows, as arrays of rows; work orders are lifted out of their vehicles. */
  rows: Record<ExploreDataset, Row[]>
  byId: Record<ExploreDataset, Map<string, Row>>
}

const g = globalThis as unknown as {
  __torqvoiceExplore?: Map<string, OpenPoint>
  __torqvoiceExploreOpening?: Map<string, Promise<RestorePointSummary>>
}
function open(): Map<string, OpenPoint> {
  if (!g.__torqvoiceExplore) g.__torqvoiceExplore = new Map()
  return g.__torqvoiceExplore
}
/** Opens in flight, so two requests for one snapshot share one download. */
function opening(): Map<string, Promise<RestorePointSummary>> {
  if (!g.__torqvoiceExploreOpening) g.__torqvoiceExploreOpening = new Map()
  return g.__torqvoiceExploreOpening
}

const ORGANIZATION_ID = /^[a-z0-9]+$/i

function exploreRoot(): string {
  return path.join(dataRoot(), 'restore-explore')
}

export function exploreDirFor(organizationId: string, snapshotId: string): string {
  if (!ORGANIZATION_ID.test(organizationId) || !SNAPSHOT_ID.test(snapshotId)) {
    throw new Error('Unexpected id')
  }
  return path.join(exploreRoot(), organizationId, snapshotId)
}

function keyOf(organizationId: string, snapshotId: string) {
  return `${organizationId}:${snapshotId}`
}

async function forget(point: OpenPoint): Promise<void> {
  open().delete(point.key)
  await rm(point.dir, { recursive: true, force: true }).catch(() => undefined)
}

/**
 * Drops restore points open too long and, when one more is about to be
 * added, the oldest beyond the cap. Then removes every folder on disk that
 * no open restore point owns: the registry lives in this process only, so
 * after a restart the folders of the points open before it are found here.
 */
async function sweep(makingRoom: boolean, now = Date.now()): Promise<void> {
  const points = [...open().values()].sort((a, b) => a.openedAt - b.openedAt)
  for (const p of points) if (now - p.openedAt > KEEP_OPEN_MS) await forget(p)
  if (makingRoom) {
    const left = [...open().values()].sort((a, b) => a.openedAt - b.openedAt)
    while (left.length >= MAX_OPEN) {
      const oldest = left.shift()
      if (oldest) await forget(oldest)
    }
  }
  await sweepOrphans()
}

/**
 * Removes the `<orgId>/<snapshotId>` folders under the explore root that no
 * open restore point owns and no open in flight is filling. Only names that
 * `exploreDirFor` accepts are touched, so nothing outside the root is.
 */
async function sweepOrphans(): Promise<void> {
  const orgs = await readdir(exploreRoot(), { withFileTypes: true }).catch(() => [])
  for (const org of orgs) {
    if (!org.isDirectory() || !ORGANIZATION_ID.test(org.name)) continue
    const snaps = await readdir(path.join(exploreRoot(), org.name), {
      withFileTypes: true,
    }).catch(() => [])
    for (const snap of snaps) {
      if (!snap.isDirectory() || !SNAPSHOT_ID.test(snap.name)) continue
      const key = keyOf(org.name, snap.name)
      if (open().has(key) || opening().has(key)) continue
      const dir = exploreDirFor(org.name, snap.name)
      await rm(dir, { recursive: true, force: true }).catch(() => undefined)
    }
  }
}

/** Closes every open restore point of a workshop, before a restore replaces it. */
export async function closeRestorePoints(organizationId: string): Promise<void> {
  for (const p of [...open().values()]) if (p.organizationId === organizationId) await forget(p)
}

/**
 * The staged data file inside the snapshot: `…/torqvoice-backup-staging/<orgId>/data.json`
 * as it was on the server that took it. Never a `data.json` someone uploaded.
 * The repository is this workshop's own, so the id in the path may be the
 * one an earlier install of the workshop had (a destination connected again
 * from a new server); this workshop's own is preferred when both exist.
 */
function isStagedDataFile(p: string): boolean {
  const parts = p.split('/')
  return parts.at(-1) === 'data.json' && parts.at(-3) === 'torqvoice-backup-staging'
}

const backupShape = z.object({
  version: z.number(),
  exportedAt: z.string().optional(),
  contents: z.enum(['data', 'dataAndSecrets']).optional(),
  data: z.record(z.string(), z.unknown()),
})

function rowsOf(value: unknown): Row[] {
  return Array.isArray(value)
    ? value.filter((r): r is Row => Boolean(r) && typeof r === 'object')
    : []
}

function index(rows: Row[]): Map<string, Row> {
  const m = new Map<string, Row>()
  for (const r of rows) if (typeof r.id === 'string') m.set(r.id, r)
  return m
}

/**
 * Opens a restore point: pulls its data file out of the repository (once),
 * parses it and keeps it for a while. `target` is the workshop's own
 * repository; the organisation id is taken from it, never from the caller.
 */
export async function openRestorePoint(
  target: RunTarget,
  snapshotId: string
): Promise<RestorePointSummary> {
  if (!SNAPSHOT_ID.test(snapshotId)) throw new Error('Invalid snapshot id')
  const opened: OpenedTarget = await openTarget(target)
  const organizationId = opened.organizationId
  const key = keyOf(organizationId, snapshotId)
  const existing = open().get(key)
  if (existing) {
    existing.openedAt = Date.now()
    await sweep(false)
    return summaryOf(existing)
  }
  const inFlight = opening().get(key)
  if (inFlight) return inFlight

  const promise = (async () => {
    await sweep(true)
    const dir = exploreDirFor(organizationId, snapshotId)
    await rm(dir, { recursive: true, force: true })
    await mkdir(dir, { recursive: true, mode: 0o700 })
    try {
      return await pull(opened, target, organizationId, snapshotId, key, dir)
    } catch (err) {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined)
      throw err
    }
  })()
  opening().set(key, promise)
  try {
    return await promise
  } finally {
    opening().delete(key)
  }
}

async function pull(
  opened: OpenedTarget,
  target: RunTarget,
  organizationId: string,
  snapshotId: string,
  key: string,
  dir: string
): Promise<RestorePointSummary> {
  const matches = await resticFind(opened.base, { snapshotId, pattern: 'data.json' })
  const staged = matches.filter((m) => isStagedDataFile(m.path))
  const dataPath = (staged.find((m) => m.path.split('/').at(-2) === organizationId) ?? staged[0])
    ?.path
  if (!dataPath) throw new Error('This restore point holds no data file')
  const dataFile = path.join(dir, 'data.json')
  let raw: unknown
  try {
    await resticDumpToFile(opened.base, {
      snapshotId,
      path: dataPath,
      target: dataFile,
      maxBytes: MAX_DATA_BYTES,
    })
    try {
      raw = await readJsonFile<unknown>(dataFile)
    } catch {
      throw new Error('The data file in this restore point could not be read')
    }
  } finally {
    // Every row of the workshop, and for a platform backup the secret keys:
    // kept parsed in memory only, never left on disk.
    await rm(dataFile, { force: true })
  }
  const parsed = backupShape.safeParse(raw)
  if (!parsed.success) throw new Error('The data file in this restore point could not be read')
  const data = parsed.data.data
  const vehicles = rowsOf(data.vehicles)
  // Work orders live inside their vehicle in the file (and counter sales on
  // their own); the explorer shows them as one list.
  const serviceRecords: Row[] = []
  for (const v of vehicles) {
    for (const sr of rowsOf(v.serviceRecords)) {
      serviceRecords.push({ ...sr, vehicleId: v.id, _vehicle: vehicleLabel(v) })
    }
  }
  for (const sr of rowsOf(data.counterSales)) serviceRecords.push({ ...sr, vehicleId: null })
  const rows: OpenPoint['rows'] = {
    customers: rowsOf(data.customers),
    vehicles,
    serviceRecords,
    quotes: rowsOf(data.quotes),
    inventoryParts: rowsOf(data.inventoryParts),
  }
  const point: OpenPoint = {
    key,
    organizationId,
    target,
    snapshotId,
    openedAt: Date.now(),
    dir,
    exportedAt: parsed.data.exportedAt ?? null,
    version: parsed.data.version,
    rows,
    byId: {
      customers: index(rows.customers),
      vehicles: index(rows.vehicles),
      serviceRecords: index(rows.serviceRecords),
      quotes: index(rows.quotes),
      inventoryParts: index(rows.inventoryParts),
    },
  }
  open().set(key, point)
  return summaryOf(point)
}

export interface RestorePointSummary {
  snapshotId: string
  exportedAt: string | null
  counts: Record<ExploreDataset, number>
}

function summaryOf(point: OpenPoint): RestorePointSummary {
  const counts = {} as Record<ExploreDataset, number>
  for (const d of EXPLORE_DATASETS) counts[d] = point.rows[d].length
  return { snapshotId: point.snapshotId, exportedAt: point.exportedAt, counts }
}

function getOpen(organizationId: string, snapshotId: string): OpenPoint {
  const point = open().get(keyOf(organizationId, snapshotId))
  if (!point || Date.now() - point.openedAt > KEEP_OPEN_MS) {
    throw new RestorePointClosedError()
  }
  point.openedAt = Date.now()
  return point
}

/** The restore point was never opened here, or has been closed again: open it first. */
export class RestorePointClosedError extends Error {
  constructor() {
    super('restorePointClosed')
    this.name = 'RestorePointClosedError'
  }
}

function text(v: unknown): string {
  return typeof v === 'string' ? v : typeof v === 'number' ? String(v) : ''
}

function vehicleLabel(v: Row): string {
  return [
    text(v.licensePlate),
    [text(v.year), text(v.make), text(v.model)].filter(Boolean).join(' '),
  ]
    .filter(Boolean)
    .join(' · ')
}

/** One row as the list shows it: a title, a line under it, and the fields searched. */
export interface ExploreListItem {
  id: string
  title: string
  subtitle: string
  /** ISO date the row is sorted by, newest first. */
  at: string | null
}

function listItem(dataset: ExploreDataset, row: Row, point: OpenPoint): ExploreListItem {
  const id = text(row.id)
  switch (dataset) {
    case 'customers':
      return {
        id,
        title: text(row.name) || text(row.company) || id,
        subtitle: [
          text(row.customerNumber) && `#${text(row.customerNumber)}`,
          text(row.company),
          text(row.email),
          text(row.phone),
        ]
          .filter(Boolean)
          .join(' · '),
        at: text(row.createdAt) || null,
      }
    case 'vehicles': {
      const customer =
        typeof row.customerId === 'string' ? point.byId.customers.get(row.customerId) : undefined
      return {
        id,
        title: vehicleLabel(row) || id,
        subtitle: customer ? listItem('customers', customer, point).title : text(row.vin),
        at: text(row.createdAt) || null,
      }
    }
    case 'serviceRecords':
      return {
        id,
        title: [text(row.invoiceNumber) && `#${text(row.invoiceNumber)}`, text(row.title)]
          .filter(Boolean)
          .join(' '),
        subtitle: [text(row._vehicle), text(row.status), text(row.serviceDate).slice(0, 10)]
          .filter(Boolean)
          .join(' · '),
        at: text(row.serviceDate) || text(row.createdAt) || null,
      }
    case 'quotes': {
      const customer =
        typeof row.customerId === 'string' ? point.byId.customers.get(row.customerId) : undefined
      return {
        id,
        title: [text(row.quoteNumber) && `#${text(row.quoteNumber)}`, text(row.title)]
          .filter(Boolean)
          .join(' '),
        subtitle: [customer ? listItem('customers', customer, point).title : '', text(row.status)]
          .filter(Boolean)
          .join(' · '),
        at: text(row.createdAt) || null,
      }
    }
    case 'inventoryParts':
      return {
        id,
        title: text(row.name) || id,
        subtitle: [text(row.partNumber), text(row.sku)].filter(Boolean).join(' · '),
        at: text(row.createdAt) || null,
      }
  }
}

function matches(item: ExploreListItem, row: Row, query: string): boolean {
  const q = query.toLowerCase()
  if (item.title.toLowerCase().includes(q) || item.subtitle.toLowerCase().includes(q)) return true
  for (const key of [
    'vin',
    'licensePlate',
    'email',
    'phone',
    'partNumber',
    'sku',
    'invoiceNumber',
    'quoteNumber',
    'customerNumber',
    'company',
  ]) {
    if (text(row[key]).toLowerCase().includes(q)) return true
  }
  return false
}

const PAGE = 50

/** A page of one dataset, newest first, filtered by a free-text query. */
export function listRestorePointRows(
  organizationId: string,
  snapshotId: string,
  dataset: ExploreDataset,
  query: string,
  page: number
): { items: ExploreListItem[]; total: number; page: number; pages: number } {
  const point = getOpen(organizationId, snapshotId)
  const q = query.trim().slice(0, 100)
  const all = point.rows[dataset]
    .map((row) => ({ row, item: listItem(dataset, row, point) }))
    .filter(({ row, item }) => !q || matches(item, row, q))
    .sort((a, b) => (Date.parse(b.item.at ?? '') || 0) - (Date.parse(a.item.at ?? '') || 0))
  const pages = Math.max(1, Math.ceil(all.length / PAGE))
  const p = Math.min(Math.max(1, page), pages)
  return {
    items: all.slice((p - 1) * PAGE, p * PAGE).map(({ item }) => item),
    total: all.length,
    page: p,
    pages,
  }
}

/** Keys that mean nothing to a reader, or are ours. */
const HIDDEN_KEYS = new Set(['organizationId', 'userId', '_vehicle'])

/**
 * One row with its nested rows, as the record page shows it: the file's own
 * shape, minus the bookkeeping columns. For a work order that is the parts,
 * labour, concerns, attachments, payments and so on it carries.
 */
export function getRestorePointRow(
  organizationId: string,
  snapshotId: string,
  dataset: ExploreDataset,
  id: string
): { item: ExploreListItem; row: Row } | null {
  const point = getOpen(organizationId, snapshotId)
  const row = point.byId[dataset].get(id)
  if (!row) return null
  const shown: Row = {}
  for (const [k, v] of Object.entries(row)) if (!HIDDEN_KEYS.has(k)) shown[k] = v
  return { item: listItem(dataset, row, point), row: shown }
}

/**
 * One upload out of the restore point, written to a file under the restore
 * point's folder and returned for streaming. Looked for only under this
 * workshop's uploads folder in the snapshot, in a known category.
 */
export async function extractRestorePointFile(
  organizationId: string,
  snapshotId: string,
  category: string,
  name: string
): Promise<{ file: string; bytes: number }> {
  const point = getOpen(organizationId, snapshotId)
  if (!UPLOAD_CATEGORIES.includes(category)) throw new Error('Unknown file category')
  if (!FILE_NAME.test(name) || name.includes('..')) throw new Error('Invalid file name')
  const file = path.join(point.dir, 'files', category, name)
  const have = await stat(file).catch(() => null)
  if (have?.isFile()) return { file, bytes: have.size }
  const opened = await openTarget(point.target)
  const found = await resticFind(opened.base, { snapshotId, pattern: name })
  const inUploads = found.find((m) => {
    const parts = m.path.split('/')
    return (
      parts.at(-1) === name &&
      parts.at(-2) === category &&
      parts.at(-3) === organizationId &&
      parts.at(-4) === 'uploads'
    )
  })
  if (!inUploads) throw new Error('That file is not in this restore point')
  const { bytes } = await resticDumpToFile(opened.base, {
    snapshotId,
    path: inUploads.path,
    target: file,
    maxBytes: MAX_FILE_BYTES,
  })
  return { file, bytes }
}
