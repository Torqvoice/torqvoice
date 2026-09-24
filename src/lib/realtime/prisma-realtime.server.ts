import 'server-only'

import { Prisma } from '@/generated/prisma/client'
import { currentActor } from './actor.server'
import { publishRecordChange } from './publish.server'
import type { ChangeAuthor, RecordAction, RecordKind } from './events'

/**
 * Every write the app makes, announced without being asked.
 *
 * This is the answer to why live updates kept getting missed. Announcing used
 * to be a line somebody had to remember in the one place that wrote the row,
 * and a feature written later simply did not have it: the technician app's
 * labour endpoint wrote a line nobody was told about, and its status endpoint
 * announced a shape no listener knew. Neither was a bug in the socket. They
 * were both a forgotten line.
 *
 * So the announcement moved to the only place every write has to pass
 * through. A new server action, a new API route, a cron job, a script: all of
 * them write through this client, so all of them are live.
 *
 * What it can work out, and what it cannot:
 *
 * - A write to a record this app follows is announced with that record's id.
 * - A write to a row that *belongs* to one (a labour line, an attachment, a
 *   time entry) is announced as a change of its parent, because that is what
 *   a screen is showing. The parent's id comes off the row being written.
 * - A bulk write names a filter rather than rows, so it is announced without
 *   an id: the workshop's lists re-read themselves, and no record's page is
 *   woken by it.
 * - A write with no workshop to be found is not announced at all. That is a
 *   deliberate silence: without a workshop there is no room to send it to.
 */

/** Records a screen follows, by the Prisma model that holds them. */
const RECORD_MODELS: Record<string, RecordKind> = {
  ServiceRecord: 'serviceRecord',
  Inspection: 'inspection',
  Quote: 'quote',
  Vehicle: 'vehicle',
  Customer: 'customer',
  InventoryPart: 'inventoryPart',
  TireSet: 'tireSet',
}

/**
 * Rows that belong to one of those records: the foreign key that says which,
 * and the hint a page can use to react more precisely than "something changed".
 */
const CHILD_MODELS: Record<
  string,
  {
    parent: RecordKind
    fk: string
    hint: string
    /** A second record the row can belong to instead, when the first key is empty. */
    also?: { parent: RecordKind; fk: string }
  }
> = {
  ServiceLabor: { parent: 'serviceRecord', fk: 'serviceRecordId', hint: 'labor' },
  ServicePart: { parent: 'serviceRecord', fk: 'serviceRecordId', hint: 'parts' },
  ServiceAttachment: { parent: 'serviceRecord', fk: 'serviceRecordId', hint: 'attachments' },
  ServiceConcern: { parent: 'serviceRecord', fk: 'serviceRecordId', hint: 'concerns' },
  StatusReport: {
    parent: 'serviceRecord',
    fk: 'serviceRecordId',
    hint: 'statusReports',
    also: { parent: 'inspection', fk: 'inspectionId' },
  },
  TimeEntry: { parent: 'serviceRecord', fk: 'serviceRecordId', hint: 'clock' },
  Payment: { parent: 'serviceRecord', fk: 'serviceRecordId', hint: 'payments' },
  QuotePart: { parent: 'quote', fk: 'quoteId', hint: 'parts' },
  QuoteLabor: { parent: 'quote', fk: 'quoteId', hint: 'labor' },
  QuoteAttachment: { parent: 'quote', fk: 'quoteId', hint: 'attachments' },
  InspectionItem: { parent: 'inspection', fk: 'inspectionId', hint: 'items' },
  InspectionAttachment: { parent: 'inspection', fk: 'inspectionId', hint: 'attachments' },
  VehicleFinding: { parent: 'vehicle', fk: 'vehicleId', hint: 'findings' },
  TireSetAttachment: { parent: 'tireSet', fk: 'tireSetId', hint: 'attachments' },
  TireMeasurement: { parent: 'tireSet', fk: 'tireSetId', hint: 'measurements' },
}

const WRITES: Record<string, RecordAction | 'bulk'> = {
  create: 'created',
  createMany: 'bulk',
  createManyAndReturn: 'bulk',
  update: 'updated',
  updateMany: 'bulk',
  updateManyAndReturn: 'bulk',
  upsert: 'updated',
  delete: 'deleted',
  deleteMany: 'bulk',
}

/**
 * Which workshop a record belongs to, remembered.
 *
 * A row's id never changes workshop, so one lookup per record is enough for
 * the life of the process. Bounded, and oldest out first: a shop that touches
 * a hundred thousand rows must not grow this without end.
 */
const MAX_REMEMBERED = 5_000
const orgById = new Map<string, string>()

function remember(id: string, organizationId: string): void {
  if (orgById.size >= MAX_REMEMBERED) {
    const oldest = orgById.keys().next().value
    if (oldest) orgById.delete(oldest)
  }
  orgById.set(id, organizationId)
}

type Row = Record<string, unknown>

const stringOf = (value: unknown): string | null => (typeof value === 'string' ? value : null)

/** The workshop named anywhere in this operation's arguments or result. */
function organizationFrom(args: Row, result: unknown): string | null {
  const where = (args.where ?? {}) as Row
  // A plural create hands over a list of rows; any one of them names the workshop.
  const data = ((Array.isArray(args.data) ? args.data[0] : args.data) ?? {}) as Row
  const row = (result ?? {}) as Row
  return (
    stringOf(row.organizationId) ??
    stringOf(data.organizationId) ??
    stringOf(where.organizationId) ??
    null
  )
}

/** The row this operation acted on, when it names exactly one. */
function idFrom(args: Row, result: unknown): string | null {
  const row = (result ?? {}) as Row
  const where = (args.where ?? {}) as Row
  return stringOf(row.id) ?? stringOf(where.id) ?? null
}

/** The parent record a child row belongs to. */
function parentIdFrom(fk: string, args: Row, result: unknown): string | null {
  const row = (result ?? {}) as Row
  const data = (args.data ?? {}) as Row
  const where = (args.where ?? {}) as Row
  return stringOf(row[fk]) ?? stringOf(data[fk]) ?? stringOf(where[fk]) ?? null
}

/** More parents than this in one bulk write and only the workshop is told. */
const MAX_BULK_PARENTS = 20

/**
 * The parents a bulk write over child rows names outright.
 *
 * A work order saves its lines by deleting all of them and writing them again:
 * `deleteMany({ where: { serviceRecordId } })`, then `createMany` with the
 * same id on every row. Both name the one record they belong to, so the record
 * is told, rather than the write being treated as anonymous because it was
 * plural.
 */
function bulkParentIds(fk: string, args: Row): string[] {
  const where = (args.where ?? {}) as Row
  const direct = stringOf(where[fk])
  if (direct) return [direct]
  const rows = Array.isArray(args.data) ? (args.data as Row[]) : []
  const ids = new Set<string>()
  for (const row of rows) {
    const id = stringOf(row?.[fk])
    if (id) ids.add(id)
    if (ids.size > MAX_BULK_PARENTS) return []
  }
  return [...ids]
}

export interface RealtimeHooks {
  /** Looks a record's workshop up when the write did not carry one. */
  organizationOf: (kind: RecordKind, id: string) => Promise<string | null>
}

/**
 * The hook itself: run the operation, then say what it changed.
 *
 * Built with the workshop lookup handed in, so this module never imports the
 * client it extends.
 *
 * Separate from the extension around it so it can be driven directly, which
 * is how the tests prove that every kind of write announces itself.
 */
export function realtimeQueryHook(hooks: RealtimeHooks) {
  return async function $allOperations({
    model,
    operation,
    args,
    query,
  }: {
    model?: string
    operation: string
    args: unknown
    query: (args: unknown) => Promise<unknown>
  }): Promise<unknown> {
    // Asked before the query runs, not after. Prisma resolves a query from
    // its own machinery, and what follows the await no longer knows whose
    // request it was: every save came out as the system's, so no page could
    // tell its own change from a colleague's.
    const by = currentActor()
    const result = await query(args)
    try {
      if (model) await announce(model, operation, (args ?? {}) as Row, result, hooks, by)
    } catch (error) {
      // A write must never fail because the screens could not be told.
      console.error('[realtime] could not announce a write:', error)
    }
    return result
  }
}

export function realtimeExtension(hooks: RealtimeHooks) {
  return Prisma.defineExtension({
    name: 'torqvoice-realtime',
    query: { $allModels: { $allOperations: realtimeQueryHook(hooks) } },
  })
}

async function announce(
  model: string,
  operation: string,
  args: Row,
  result: unknown,
  hooks: RealtimeHooks,
  by: ChangeAuthor
): Promise<void> {
  const action = WRITES[operation]
  if (!action) return

  const kind = RECORD_MODELS[model]
  const child = CHILD_MODELS[model]
  if (!kind && !child) return

  if (kind) {
    const id = action === 'bulk' ? null : idFrom(args, result)
    const organizationId =
      organizationFrom(args, result) ?? (id ? await organizationOf(kind, id, hooks) : null)
    if (!organizationId) return
    if (id) remember(id, organizationId)
    publishRecordChange({
      by,
      kind,
      id,
      organizationId,
      action: action === 'bulk' ? 'updated' : action,
    })
    return
  }

  if (!child) return
  // A status report is a work order's or an inspection's: whichever key the
  // write names is the record that is told.
  const links = [child, ...(child.also ? [{ ...child.also, hint: child.hint }] : [])]
  if (action === 'bulk') {
    for (const link of links) {
      const parents = bulkParentIds(link.fk, args)
      for (const id of parents) {
        const organizationId =
          organizationFrom(args, result) ?? (await organizationOf(link.parent, id, hooks))
        if (!organizationId) continue
        remember(id, organizationId)
        publishRecordChange({
          by,
          kind: link.parent,
          id,
          organizationId,
          hint: link.hint,
        })
      }
      if (parents.length > 0) return
    }
  }
  const owner =
    action === 'bulk'
      ? null
      : (links
          .map((link) => ({ link, id: parentIdFrom(link.fk, args, result) }))
          .find((entry) => entry.id !== null) ?? null)
  const parentId = owner?.id ?? null
  const parent = owner?.link.parent ?? child.parent
  if (!parentId) {
    // A bulk write over children names no parent: the workshop hears it if
    // the write said which one, and otherwise nothing is announced.
    const organizationId = organizationFrom(args, result)
    if (organizationId) {
      publishRecordChange({
        by,
        kind: child.parent,
        id: null,
        organizationId,
        hint: child.hint,
      })
    }
    return
  }
  const organizationId =
    organizationFrom(args, result) ?? (await organizationOf(parent, parentId, hooks))
  if (!organizationId) return
  remember(parentId, organizationId)
  publishRecordChange({
    by,
    kind: parent,
    id: parentId,
    organizationId,
    hint: child.hint,
  })
}

async function organizationOf(
  kind: RecordKind,
  id: string,
  hooks: RealtimeHooks
): Promise<string | null> {
  const known = orgById.get(id)
  if (known) return known
  const found = await hooks.organizationOf(kind, id)
  if (found) remember(id, found)
  return found
}

/** Only for tests: forget which workshop every record belongs to. */
export function resetRealtimeMemory(): void {
  orgById.clear()
}

export const REALTIME_RECORD_MODELS = RECORD_MODELS
export const REALTIME_CHILD_MODELS = CHILD_MODELS
