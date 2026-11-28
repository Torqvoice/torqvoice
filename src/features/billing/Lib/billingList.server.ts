import { Prisma } from '@/generated/prisma/client'
import { roundMoney } from '@/lib/money'
import { effectiveDateSql } from '@/lib/date-sort'
import type { Cursor, KeyValue } from '@/lib/keyset'
import { addZonedDays, startOfZonedDay } from '@/lib/timezone'
import { toSafeWorkshopDate } from '@/lib/workshop-datetime'
import {
  type BillingGroupBy,
  billingDayKey,
  billingGroupBy,
} from '@/features/billing/Schema/billingListSchema'

export {
  BILLING_GROUPS,
  type BillingGroupBy,
  billingDayKey,
  billingGroupBy,
  billingRowGroupKey,
} from '@/features/billing/Schema/billingListSchema'

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
  /** First invoice day, YYYY-MM-DD on the workshop's calendar. */
  from?: string
  /** Last invoice day, inclusive. */
  to?: string
  /** customer, month or status; anything else is one ungrouped list. */
  groupBy?: string
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

/**
 * The payment status as SQL over the `sub` query, the same reading as
 * billingRowFromSql: cancelled whatever was paid, then paid, partial, unpaid.
 */
export const billingStatusSql = Prisma.sql`(CASE
  WHEN sub.job_status = 'cancelled' THEN 'cancelled'
  WHEN sub.manually_paid = true OR (sub.paid_amount >= sub.effective_total AND sub.effective_total > 0) THEN 'paid'
  WHEN sub.paid_amount > 0 THEN 'partial'
  ELSE 'unpaid' END)`

/** Which group a row of the `sub` query falls in, as the text the list keys groups by. */
export function billingGroupKeySql(groupBy: BillingGroupBy): Prisma.Sql {
  if (groupBy === 'customer') return Prisma.sql`COALESCE(sub.customer_id, '')`
  if (groupBy === 'month') return Prisma.sql`sub.group_month`
  return billingStatusSql
}

/**
 * The sort parts that keep a group's rows together, ahead of the column the
 * list is sorted by: customers A to Z (the id parts two of the same name),
 * months newest first unless the dates run oldest first, and the statuses in
 * the order a workshop chases them.
 */
function groupParts(groupBy: BillingGroupBy, sortBy?: string, sortOrder?: Direction) {
  if (groupBy === 'customer') {
    return [
      part(Prisma.sql`sub.customer_name`, 'asc', 'string', 'last'),
      part(Prisma.sql`sub.customer_id`, 'asc', 'string', 'last'),
    ]
  }
  if (groupBy === 'month') {
    const dir: Direction = sortBy === 'date' && sortOrder === 'asc' ? 'asc' : 'desc'
    return [part(Prisma.sql`sub.group_month`, dir, 'string', 'last')]
  }
  return [
    part(
      Prisma.sql`(CASE ${billingStatusSql} WHEN 'unpaid' THEN 0 WHEN 'partial' THEN 1 WHEN 'paid' THEN 2 ELSE 3 END)`,
      'asc',
      'number'
    ),
  ]
}

export function billingListSort(
  sortBy?: string,
  sortOrder?: Direction,
  groupBy?: string | null
): BillingSortPart[] {
  const group = billingGroupBy(groupBy)
  const columns = columnSort(sortBy, sortOrder)
  return group ? [...groupParts(group, sortBy, sortOrder), ...columns] : columns
}

function columnSort(sortBy?: string, sortOrder?: Direction): BillingSortPart[] {
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

/**
 * The invoice days a range covers, as instants: from the start of the first
 * day to the start of the day after the last, on the workshop's clock. A day
 * that is missing or not a day leaves that end open.
 */
export function billingDateWindow(
  params: Pick<BillingListFilters, 'from' | 'to'>,
  timeZone: string
): { gte?: Date; lt?: Date } {
  const from = toSafeWorkshopDate(billingDayKey(params.from), timeZone)
  const to = toSafeWorkshopDate(billingDayKey(params.to), timeZone)
  return {
    gte: from ? startOfZonedDay(from, timeZone) : undefined,
    lt: to ? addZonedDays(startOfZonedDay(to, timeZone), 1, timeZone) : undefined,
  }
}

/**
 * The range as SQL over the `sr` table, on the date the list shows. The
 * columns hold UTC wall-clock timestamps without a zone.
 */
export function billingDateRangeSql(
  params: Pick<BillingListFilters, 'from' | 'to'>,
  timeZone: string
): Prisma.Sql {
  const { gte, lt } = billingDateWindow(params, timeZone)
  const date = effectiveDateSql('sr')
  return Prisma.sql`${
    gte
      ? Prisma.sql`AND ${date} >= (CAST(${gte.toISOString()} AS timestamptz) AT TIME ZONE 'UTC')`
      : Prisma.empty
  } ${
    lt
      ? Prisma.sql`AND ${date} < (CAST(${lt.toISOString()} AS timestamptz) AT TIME ZONE 'UTC')`
      : Prisma.empty
  }`
}

/** The filters every batch and the count share, over the `sr` / `v` tables and the `sub` query. */
export function billingListConditions(params: BillingListFilters, timeZone = 'UTC') {
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

  const range = billingDateRangeSql(params, timeZone)

  return { search, status, completed, delivery, range }
}

export type BillingConditions = ReturnType<typeof billingListConditions>

/**
 * Every invoice of the workshop that the search, the completed switch and the
 * date range keep, with what the list, its totals and the report read off
 * it. Payment status and delivery are filtered over this, as `sub`.
 */
export function billingBaseSql(
  organizationId: string,
  cond: BillingConditions,
  timeZone: string
): Prisma.Sql {
  return Prisma.sql`
    SELECT
      sr.id,
      sr.title,
      sr."invoiceNumber",
      sr."serviceDate",
      sr."startDateTime",
      sr."invoiceDate",
      sr."manuallyPaid" AS manually_paid,
      CASE WHEN sr."totalAmount" > 0 THEN sr."totalAmount" ELSE sr.cost END AS effective_total,
      CASE WHEN sr."manuallyPaid" = true
        THEN CASE WHEN sr."totalAmount" > 0 THEN sr."totalAmount" ELSE sr.cost END
        ELSE COALESCE((SELECT SUM(p.amount) FROM "public"."payments" p WHERE p."serviceRecordId" = sr.id), 0)
      END AS paid_amount,
      v.id AS vehicle_id,
      v.make AS vehicle_make,
      v.model AS vehicle_model,
      v.year AS vehicle_year,
      v."licensePlate" AS vehicle_license_plate,
      c.id AS customer_id,
      c.name AS customer_name,
      sr."sentAt" AS sent_at,
      sr."viewCount" AS view_count,
      sr."lastViewedAt" AS last_viewed_at,
      sr.status AS job_status,
      to_char((${effectiveDateSql('sr')} AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone}, 'YYYY-MM') AS group_month
    FROM "public"."service_records" sr
    LEFT JOIN "public"."vehicles" v ON v.id = sr."vehicleId"
    LEFT JOIN "public"."customers" c ON c.id = COALESCE(sr."customerId", v."customerId")
    WHERE sr."organizationId" = ${organizationId}
    ${cond.search}
    ${cond.completed}
    ${cond.range}
  `
}

/**
 * Count and money over the rows a filter keeps. A cancelled invoice is
 * listed but owes nothing and was never charged, so it is counted and left
 * out of the sums, the same as the summary cards.
 */
export const billingTotalsSelectSql = Prisma.sql`
  COUNT(*) AS cnt,
  COALESCE(SUM(sub.effective_total) FILTER (WHERE sub.job_status <> 'cancelled'), 0) AS invoiced,
  COALESCE(SUM(sub.paid_amount) FILTER (WHERE sub.job_status <> 'cancelled'), 0) AS paid
`

export interface BillingTotals {
  count: number
  invoiced: number
  paid: number
  outstanding: number
}

export function billingTotalsFromSql(
  r: { cnt?: unknown; invoiced?: unknown; paid?: unknown } | undefined
): BillingTotals {
  const invoiced = roundMoney(r?.invoiced ?? 0)
  const paid = roundMoney(r?.paid ?? 0)
  return { count: Number(r?.cnt ?? 0), invoiced, paid, outstanding: roundMoney(invoiced - paid) }
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
  group_month?: string | null
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
    /** YYYY-MM of the shown date on the workshop's calendar, for grouping by month. */
    month: r.group_month ?? null,
  }
}
