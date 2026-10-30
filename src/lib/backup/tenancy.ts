import { type Row, walkBackup } from './layout'
import { TENANCY_SCHEMA } from './tenancy-schema'

/**
 * What keeps a restore inside its own workshop.
 *
 * A backup file is data a person uploaded, and on Torqvoice Cloud hundreds
 * of workshops share one database. The rows it carries are written with the
 * ids they had, and the foreign keys inside them are read from the file. So
 * before anything is written, two things are checked: no id in the file may
 * already belong to a row of another workshop (the whole restore is refused
 * if one does), and every foreign key must point at a row the file itself
 * carries, or one this workshop already has. A foreign key that points
 * anywhere else is cleared, or takes its row with it when the link is
 * required. The wrapped transaction client (tenant-guard.ts) is the third
 * layer: a write the restore makes without naming the workshop never
 * reaches the database.
 */

export type RestoreRefusal = 'foreign_ids' | 'busy' | 'owner_only'

/** A refusal with a reason the browser can name, as opposed to a failure. */
export class RestoreRefusedError extends Error {
  readonly code: RestoreRefusal
  constructor(code: RestoreRefusal, message: string) {
    super(message)
    this.name = 'RestoreRefusedError'
    this.code = code
  }
}

export type IdsByModel = Map<string, Set<string>>

/** Columns that point at people or the workshop itself; the import sets those, never the file. */
const UNCHECKED_TARGETS = new Set(['User', 'Organization'])

const CHUNK = 5000

function add(map: IdsByModel, model: string, id: string): void {
  let set = map.get(model)
  if (!set) {
    set = new Set()
    map.set(model, set)
  }
  set.add(id)
}

function isId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

/** Every id the file carries, by the model the row is bound for. */
export function collectFileIds(data: Row): IdsByModel {
  const ids: IdsByModel = new Map()
  walkBackup(data, (model, row) => {
    if (isId(row.id)) add(ids, model, row.id)
    return 'keep'
  })
  return ids
}

type Reference = { target: string; required: boolean }

/**
 * The columns of a row that name another row, and what they point at: the
 * schema's foreign keys, plus a plain id column named after a model (a
 * part's `inventoryPartId`, which the schema keeps as text). The plain ones
 * are never required, so a dangling one is cleared.
 */
function checkedReferences(model: string, row: Row): [string, Reference][] {
  const known = TENANCY_SCHEMA[model]
  if (!known) return []
  const out: [string, Reference][] = []
  for (const [column, fk] of Object.entries(known.foreignKeys)) {
    if (column !== 'organizationId' && !UNCHECKED_TARGETS.has(fk.target)) out.push([column, fk])
  }
  for (const column of Object.keys(row)) {
    if (!column.endsWith('Id') || column in known.foreignKeys || column === 'organizationId') {
      continue
    }
    const target = column.charAt(0).toUpperCase() + column.slice(1, -2)
    if (TENANCY_SCHEMA[target] && !UNCHECKED_TARGETS.has(target)) {
      out.push([column, { target, required: false }])
    }
  }
  return out
}

/**
 * Foreign keys that point outside the file, by the model they point at:
 * the candidates for "a row this workshop already has", looked up before
 * the file is cleaned.
 */
export function danglingReferences(data: Row, fileIds: IdsByModel): IdsByModel {
  const out: IdsByModel = new Map()
  walkBackup(data, (model, row) => {
    for (const [column, fk] of checkedReferences(model, row)) {
      const value = row[column]
      if (isId(value) && !fileIds.get(fk.target)?.has(value)) add(out, fk.target, value)
    }
    return 'keep'
  })
  return out
}

export function mergeIds(...maps: IdsByModel[]): IdsByModel {
  const out: IdsByModel = new Map()
  for (const map of maps) {
    for (const [model, ids] of map) for (const id of ids) add(out, model, id)
  }
  return out
}

/**
 * Clears every foreign key that points at a row outside `allowed`, and
 * drops the row when the link is required. Mutates the file in place and
 * says how much it changed.
 */
export function sanitiseForeignIds(
  data: Row,
  allowed: IdsByModel
): { cleared: number; dropped: number } {
  let cleared = 0
  let dropped = 0
  walkBackup(data, (model, row) => {
    for (const [column, fk] of checkedReferences(model, row)) {
      const value = row[column]
      if (!isId(value) || allowed.get(fk.target)?.has(value)) continue
      if (fk.required) {
        dropped++
        return 'drop'
      }
      row[column] = null
      cleared++
    }
    return 'keep'
  })
  return { cleared, dropped }
}

function nest(path: string[], leaf: Record<string, unknown>): Record<string, unknown> {
  let where = leaf
  for (let i = path.length - 1; i >= 0; i--) where = { [path[i]]: where }
  return where
}

/**
 * The where that selects a model's rows belonging to one workshop: its own
 * column, or the column of a parent reached through its relations. Null for
 * a model with neither, which the file layout test keeps out of a backup.
 */
export function ownershipWhere(
  model: string,
  organizationId: string
): Record<string, unknown> | null {
  const known = TENANCY_SCHEMA[model]
  if (!known) return null
  if (known.organizationId) return { organizationId }
  if (known.ownerPaths.length === 0) return null
  const paths = known.ownerPaths.map((path) => nest(path, { organizationId }))
  return paths.length === 1 ? paths[0] : { OR: paths }
}

type Reader = Record<
  string,
  { findMany(args: { where: unknown; select: { id: true } }): Promise<{ id: string }[]> }
>

function delegateOf(model: string): string {
  return model.charAt(0).toLowerCase() + model.slice(1)
}

function* chunks(ids: Set<string>): Generator<string[]> {
  const all = [...ids]
  for (let i = 0; i < all.length; i += CHUNK) yield all.slice(i, i + CHUNK)
}

/**
 * Refuses the restore when any id the file carries is already a row of
 * another workshop. A backup of this workshop never trips this: its ids are
 * its own rows, or gone. A crafted file does.
 */
export async function assertNoForeignRows(
  tx: unknown,
  organizationId: string,
  fileIds: IdsByModel
): Promise<void> {
  const reader = tx as Reader
  for (const [model, ids] of fileIds) {
    const ours = ownershipWhere(model, organizationId)
    const delegate = reader[delegateOf(model)]
    if (!ours || !delegate) continue
    for (const chunk of chunks(ids)) {
      const foreign = await delegate.findMany({
        where: { id: { in: chunk }, NOT: ours },
        select: { id: true },
      })
      if (foreign.length > 0) {
        throw new RestoreRefusedError(
          'foreign_ids',
          `The file holds ${foreign.length} ${model} id(s) that belong to another workshop`
        )
      }
    }
  }
}

/** Of the candidate ids, the ones that are rows of this workshop already. */
export async function lookupOwnIds(
  tx: unknown,
  organizationId: string,
  candidates: IdsByModel
): Promise<IdsByModel> {
  const reader = tx as Reader
  const out: IdsByModel = new Map()
  for (const [model, ids] of candidates) {
    const ours = ownershipWhere(model, organizationId)
    const delegate = reader[delegateOf(model)]
    if (!ours || !delegate) continue
    for (const chunk of chunks(ids)) {
      const rows = await delegate.findMany({
        where: { id: { in: chunk }, ...ours },
        select: { id: true },
      })
      for (const row of rows) add(out, model, row.id)
    }
  }
  return out
}

/** The server-wide restore lock: one restore at a time, whichever way it was started. */
const g = globalThis as unknown as { __torqvoiceRestoreLock?: string | null }

export function restoreLockHolder(): string | null {
  return g.__torqvoiceRestoreLock ?? null
}

export function acquireRestoreLock(token: string): boolean {
  if (g.__torqvoiceRestoreLock) return false
  g.__torqvoiceRestoreLock = token
  return true
}

export function releaseRestoreLock(token: string): void {
  if (g.__torqvoiceRestoreLock === token) g.__torqvoiceRestoreLock = null
}
