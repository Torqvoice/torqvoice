import { Prisma } from '@/generated/prisma/client'
import { effectiveDateSql } from '@/lib/date-sort'
import type { Cursor, KeyValue } from '@/lib/keyset'

/**
 * The billing list's query, in one place: the page's first batch and every
 * batch loaded while scrolling are built here, so the rows that arrive later
 * always continue the list the page started.
 *
 * Payment status and the effective total are computed values, and the date
 * shown is COALESCE(invoiceDate, startDateTime, serviceDate), so the list is
 * raw SQL and lib/keyset.ts (which builds Prisma filters) does not reach it.
 * The same idea is done here in SQL: each sort part is an expression with a
 * direction and a place for empty values, the id breaks the last tie, and a
 * batch asks for the rows that sort after the last one shown.
 */

/** Rows per batch: the page's first paint and each batch after it. */
export const BILLING_BATCH_SIZE = 50

export type BillingListFilters = {
  search?: string
  /** paid, partial, unpaid; anything else is every invoice. */
  status?: string
  /** 'unviewed' keeps only invoices that went out and were never opened. */
  delivery?: string
  /** Only work orders marked completed. */
  completedOnly?: boolean
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

type Direction = 'asc' | 'desc'
type Kind = 'string' | 'number' | 'date'

export type BillingSortPart = {
  /** The expression over the `sub` query it sorts by. */
  expr: Prisma.Sql
  dir: Direction
  /** Where rows without a value go. */
  nulls: 'first' | 'last'
  kind: Kind
}

/** Postgres's own placement when nothing is said: empty last ascending, first descending. */
function part(expr: Prisma.Sql, dir: Direction, kind: Kind, nulls?: 'first' | 'last') {
  return { expr, dir, kind, nulls: nulls ?? (dir === 'asc' ? 'last' : 'first') }
}

export function billingListSort(sortBy?: string, sortOrder?: Direction): BillingSortPart[] {
  const dir: Direction = sortOrder === 'asc' ? 'asc' : 'desc'
  switch (sortBy) {
    case 'invoiceNumber':
      return [part(Prisma.sql`sub."invoiceNumber"`, dir, 'string', 'last')]
    case 'title':
      return [part(Prisma.sql`sub.title`, dir, 'string')]
    case 'vehicle':
      return [
        part(Prisma.sql`sub.vehicle_make`, dir, 'string'),
        part(Prisma.sql`sub.vehicle_model`, dir, 'string'),
        part(Prisma.sql`sub.vehicle_year`, dir, 'number'),
      ]
    case 'customer':
      return [part(Prisma.sql`sub.customer_name`, dir, 'string', 'last')]
    case 'total':
      return [part(Prisma.sql`sub.effective_total`, dir, 'number')]
    case 'date':
      return [part(effectiveDateSql('sub'), dir, 'date')]
    // Grouped rather than by date: what the column is for is finding the
    // invoices that went out and were never opened, and those sit between the
    // ones never sent and the ones already read.
    case 'delivery':
      return [
        part(
          Prisma.sql`(CASE WHEN sub.view_count > 0 THEN 2 WHEN sub.sent_at IS NOT NULL THEN 1 ELSE 0 END)`,
          dir,
          'number'
        ),
        part(Prisma.sql`sub.last_viewed_at`, dir, 'date', 'last'),
      ]
    default:
      return [part(effectiveDateSql('sub'), 'desc', 'date')]
  }
}

/**
 * Which rows come after a cursor, as a small tree rather than SQL text, so
 * the same answer can be read as SQL here and checked against plain rows in
 * a test.
 */
export type KeyCondition =
  | { or: KeyCondition[] }
  | { and: KeyCondition[] }
  | { part: number; op: 'gt' | 'lt' | 'eq'; value: string | number }
  | { part: number; isNull: boolean }
  | { idAfter: string }

function checkValue(kind: Kind, value: string | number) {
  if (kind === 'number' && typeof value !== 'number') throw new Error('Invalid cursor')
  if (kind !== 'number' && typeof value !== 'string') throw new Error('Invalid cursor')
  if (kind === 'date' && Number.isNaN(new Date(value).getTime())) throw new Error('Invalid cursor')
}

/**
 * The rows that sort strictly after `cursor`: for each part in turn, every
 * earlier part equal and this one further along, and finally the same values
 * with a later id. A cursor that does not fit the sort (a tab from before the
 * sort changed) is refused rather than read some other way round.
 */
export function billingKeysetAfter(parts: BillingSortPart[], cursor: Cursor): KeyCondition {
  if (cursor.v.length !== parts.length) throw new Error('Invalid cursor')
  cursor.v.forEach((value, i) => {
    if (value !== null) checkValue(parts[i].kind, value)
  })

  const equal = (i: number): KeyCondition => {
    const value = cursor.v[i]
    return value === null ? { part: i, isNull: true } : { part: i, op: 'eq', value }
  }
  const after = (i: number): KeyCondition | null => {
    const p = parts[i]
    const value = cursor.v[i]
    if (value === null) return p.nulls === 'first' ? { part: i, isNull: false } : null
    const further: KeyCondition = { part: i, op: p.dir === 'asc' ? 'gt' : 'lt', value }
    return p.nulls === 'last' ? { or: [further, { part: i, isNull: true }] } : further
  }

  const branches: KeyCondition[] = []
  for (let i = 0; i <= parts.length; i++) {
    const tail = i === parts.length ? { idAfter: cursor.id } : after(i)
    if (!tail) continue
    const head = Array.from({ length: i }, (_, j) => equal(j))
    branches.push(head.length ? { and: [...head, tail] } : tail)
  }
  return { or: branches }
}

/** A cursor value as a typed SQL parameter, compared the way the column sorts. */
function param(kind: Kind, value: string | number): Prisma.Sql {
  if (kind === 'number') return Prisma.sql`CAST(${value} AS double precision)`
  // The columns are UTC wall-clock timestamps without a zone.
  if (kind === 'date') return Prisma.sql`(CAST(${value} AS timestamptz) AT TIME ZONE 'UTC')`
  return Prisma.sql`CAST(${value} AS text)`
}

export function keyConditionSql(parts: BillingSortPart[], cond: KeyCondition): Prisma.Sql {
  if ('or' in cond) {
    return Prisma.sql`(${Prisma.join(
      cond.or.map((c) => keyConditionSql(parts, c)),
      ' OR '
    )})`
  }
  if ('and' in cond) {
    return Prisma.sql`(${Prisma.join(
      cond.and.map((c) => keyConditionSql(parts, c)),
      ' AND '
    )})`
  }
  if ('idAfter' in cond) return Prisma.sql`sub.id > ${cond.idAfter}`
  const p = parts[cond.part]
  if ('isNull' in cond) {
    return cond.isNull ? Prisma.sql`${p.expr} IS NULL` : Prisma.sql`${p.expr} IS NOT NULL`
  }
  const op = Prisma.raw(cond.op === 'gt' ? '>' : cond.op === 'lt' ? '<' : '=')
  return Prisma.sql`${p.expr} ${op} ${param(p.kind, cond.value)}`
}

/** ORDER BY for a sort, empty values placed explicitly, the id last. */
export function billingOrderBySql(parts: BillingSortPart[]): Prisma.Sql {
  return Prisma.join(
    [
      ...parts.map(
        (p) =>
          Prisma.sql`${p.expr} ${Prisma.raw(p.dir === 'asc' ? 'ASC' : 'DESC')} ${Prisma.raw(
            p.nulls === 'first' ? 'NULLS FIRST' : 'NULLS LAST'
          )}`
      ),
      Prisma.sql`sub.id ASC`,
    ],
    ', '
  )
}

/** The sort values as selected columns `k0`, `k1`…, so the cursor can be read off the last row. */
export function billingSortKeysSql(parts: BillingSortPart[]): Prisma.Sql {
  return Prisma.join(
    parts.map((p, i) => Prisma.sql`${p.expr} AS ${Prisma.raw(`k${i}`)}`),
    ', '
  )
}

/** A sort value as it travels in a cursor. */
function keyValue(value: unknown): KeyValue {
  if (value == null) return null
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'number' || typeof value === 'string') return value
  // bigint, or a numeric Postgres hands back as a decimal.
  return Number(String(value))
}

/** The cursor that carries on after `row`, read from its `k0`, `k1`… columns. */
export function billingCursor(
  parts: BillingSortPart[],
  row: { id: string } & Record<string, unknown>
): Cursor {
  return { v: parts.map((_, i) => keyValue(row[`k${i}`])), id: row.id }
}

/** The filters every batch and the count share, over the `sr` / `v` tables and the `sub` query. */
export function billingListConditions(params: BillingListFilters) {
  const search = params.search
    ? Prisma.sql`AND (
        sr.title ILIKE ${`%${params.search}%`}
        OR sr."invoiceNumber" ILIKE ${`%${params.search}%`}
        OR v.make ILIKE ${`%${params.search}%`}
        OR v.model ILIKE ${`%${params.search}%`}
      )`
    : Prisma.empty

  let status: Prisma.Sql
  if (params.status === 'paid') {
    status = Prisma.sql`AND job_status <> 'cancelled' AND (manually_paid = true OR (paid_amount >= effective_total AND effective_total > 0))`
  } else if (params.status === 'partial') {
    status = Prisma.sql`AND job_status <> 'cancelled' AND manually_paid = false AND paid_amount > 0 AND paid_amount < effective_total`
  } else if (params.status === 'unpaid') {
    status = Prisma.sql`AND job_status <> 'cancelled' AND manually_paid = false AND paid_amount = 0`
  } else {
    status = Prisma.empty
  }

  // Finished work only, for a workshop that bills a job once it is done.
  const completed = params.completedOnly ? Prisma.sql`AND sr.status = 'completed'` : Prisma.empty

  // Sent but never opened. A draft nobody has sent is not a chase, and
  // neither is one the customer has read, so both fall out here.
  const delivery =
    params.delivery === 'unviewed'
      ? Prisma.sql`AND sent_at IS NOT NULL AND view_count = 0`
      : Prisma.empty

  return { search, status, completed, delivery }
}

/** One invoice as the list shows it, from a row of the batch query. */
export function billingRowFromSql(r: {
  id: string
  title: string | null
  invoiceNumber: string | null
  serviceDate: Date
  startDateTime: Date | null
  invoiceDate: Date | null
  effective_total: unknown
  paid_amount: unknown
  manually_paid: boolean
  vehicle_id: string | null
  vehicle_make: string | null
  vehicle_model: string | null
  vehicle_year: number | null
  vehicle_license_plate: string | null
  customer_id: string | null
  customer_name: string | null
  sent_at: Date | null
  view_count: unknown
  last_viewed_at: Date | null
  job_status: string
}) {
  const effectiveTotal = Number(r.effective_total)
  const paidAmount = Number(r.paid_amount)
  const manuallyPaid = r.manually_paid
  // A cancelled invoice says so, whatever was paid on it.
  const paymentStatus =
    r.job_status === 'cancelled'
      ? 'cancelled'
      : manuallyPaid || (paidAmount >= effectiveTotal && effectiveTotal > 0)
        ? 'paid'
        : paidAmount > 0
          ? 'partial'
          : 'unpaid'
  return {
    id: r.id,
    title: r.title || '',
    invoiceNumber: r.invoiceNumber,
    startDateTime: r.startDateTime,
    serviceDate: r.invoiceDate ?? r.startDateTime ?? r.serviceDate,
    totalAmount: effectiveTotal,
    totalPaid: paidAmount,
    status: paymentStatus,
    vehicle: r.vehicle_id
      ? {
          id: r.vehicle_id,
          make: r.vehicle_make || '',
          model: r.vehicle_model || '',
          year: r.vehicle_year || 0,
          licensePlate: r.vehicle_license_plate,
        }
      : null,
    customer: r.customer_id ? { id: r.customer_id, name: r.customer_name || '' } : null,
    sentAt: r.sent_at,
    viewCount: Number(r.view_count ?? 0),
    lastViewedAt: r.last_viewed_at,
  }
}
