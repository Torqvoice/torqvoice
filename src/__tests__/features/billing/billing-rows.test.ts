/**
 * @vitest-environment node
 *
 * The billing list loads more invoices as it scrolls. Its query is raw SQL
 * (payment status and the shown date are computed), so it carries its own
 * keyset: walking it batch by batch has to show every invoice once and in
 * the list's order, whatever the sort and however many rows have no value in
 * it, and every batch keeps to the filters and to the workshop.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const queries = vi.hoisted(() => ({ calls: [] as { sql: string; values: unknown[] }[] }))
const rawRows = vi.hoisted(() => ({ next: [] as Record<string, unknown>[] }))
const auth = vi.hoisted(() => ({ options: [] as unknown[] }))

vi.mock('@/lib/db', () => ({
  db: {
    $queryRaw: vi.fn(async (query: { sql: string; values: unknown[] }) => {
      queries.calls.push({ sql: query.sql, values: query.values })
      if (query.sql.includes('COUNT(*) AS cnt')) return [{ cnt: BigInt(421) }]
      if (query.sql.includes('total_revenue')) return [{}]
      return rawRows.next
    }),
  },
}))
// Far from UTC, so a day boundary read on the wrong clock shows.
vi.mock('@/lib/workshop-timezone', () => ({
  workshopTimeZone: async () => 'Pacific/Auckland',
}))
vi.mock('@/lib/with-auth', () => ({
  withAuth: async (
    run: (ctx: { organizationId: string }) => Promise<unknown>,
    options: unknown
  ) => {
    auth.options.push(options)
    try {
      return { success: true, data: await run({ organizationId: 'org-1' }) }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  },
}))

import { getBillingRows } from '@/features/billing/Actions/getBillingRows'
import {
  type BillingSortPart,
  billingKeysetAfter,
  billingListSort,
  type KeyCondition,
} from '@/features/billing/Lib/billingList.server'
import type { Cursor, KeyValue } from '@/lib/keyset'

/** A row of the list by its sort values, the way the query's k0, k1… columns hold them. */
type KeyRow = { id: string; k: KeyValue[] }

function cmp(kind: BillingSortPart['kind'], a: KeyValue, b: KeyValue) {
  const x = kind === 'date' ? new Date(a as string).getTime() : a
  const y = kind === 'date' ? new Date(b as string).getTime() : b
  return (x as number) < (y as number) ? -1 : (x as number) > (y as number) ? 1 : 0
}

/** How Postgres would answer the condition for one row. */
function holds(parts: BillingSortPart[], row: KeyRow, cond: KeyCondition): boolean {
  if ('or' in cond) return cond.or.some((c) => holds(parts, row, c))
  if ('and' in cond) return cond.and.every((c) => holds(parts, row, c))
  if ('idAfter' in cond) return row.id > cond.idAfter
  const value = row.k[cond.part]
  if ('isNull' in cond) return cond.isNull ? value === null : value !== null
  if (value === null) return false
  const c = cmp(parts[cond.part].kind, value, cond.value)
  return cond.op === 'gt' ? c > 0 : cond.op === 'lt' ? c < 0 : c === 0
}

/** The rows in the order the query's ORDER BY gives them. */
function sorted(rows: KeyRow[], parts: BillingSortPart[]) {
  return [...rows].sort((a, b) => {
    for (let i = 0; i < parts.length; i++) {
      const x = a.k[i]
      const y = b.k[i]
      if (x === null && y === null) continue
      if (x === null) return parts[i].nulls === 'first' ? -1 : 1
      if (y === null) return parts[i].nulls === 'first' ? 1 : -1
      const c = cmp(parts[i].kind, x, y)
      if (c !== 0) return parts[i].dir === 'asc' ? c : -c
    }
    return a.id < b.id ? -1 : 1
  })
}

function walk(rows: KeyRow[], parts: BillingSortPart[], size: number) {
  const order = sorted(rows, parts)
  const seen: string[] = []
  let cursor: Cursor | null = null
  for (let guard = 0; guard < 100; guard++) {
    const after: KeyCondition | null = cursor ? billingKeysetAfter(parts, cursor) : null
    const batch: KeyRow[] = order.filter((row) => !after || holds(parts, row, after)).slice(0, size)
    if (batch.length === 0) break
    seen.push(...batch.map((row) => row.id))
    const last: KeyRow = batch[batch.length - 1]
    cursor = { v: last.k, id: last.id }
  }
  return { seen, expected: order.map((row) => row.id) }
}

/** Sort values for a row under each sort, with plenty of ties and empty values. */
function keysFor(sortBy: string, i: number): KeyValue[] {
  const date = new Date(Date.UTC(2026, 0, 1 + (i % 9))).toISOString()
  switch (sortBy) {
    case 'invoiceNumber':
      return [i % 5 === 0 ? null : `INV-${i % 13}`]
    case 'title':
      return [['Brakes', 'Service', 'Tyres'][i % 3]]
    case 'vehicle':
      // A counter sale has no vehicle at all.
      return i % 6 === 0 ? [null, null, null] : [['Volvo', 'Audi'][i % 2], 'V70', 2010 + (i % 3)]
    case 'customer':
      return [i % 7 === 0 ? null : ['Ola', 'Kari', 'Per'][i % 3]]
    case 'total':
      return [(i % 6) * 125.5]
    case 'delivery':
      return [i % 3, i % 3 === 2 && i % 4 !== 0 ? date : null]
    default:
      return [date]
  }
}

describe('walking the list batch by batch', () => {
  const sorts = ['', 'date', 'invoiceNumber', 'title', 'vehicle', 'customer', 'total', 'delivery']
  for (const sortBy of sorts) {
    for (const dir of ['asc', 'desc'] as const) {
      it(`shows every invoice once, sorted by ${sortBy || 'default'} ${dir}`, () => {
        const parts = billingListSort(sortBy || undefined, dir)
        const rows = Array.from({ length: 97 }, (_, i) => ({
          id: `r${String(i).padStart(3, '0')}`,
          k: keysFor(sortBy, i),
        }))
        for (const size of [1, 7, 50]) {
          const { seen, expected } = walk(rows, parts, size)
          expect(seen).toEqual(expected)
        }
      })
    }
  }

  // Grouped, the group's own sort parts come first; the walk must still show
  // every invoice once, groups kept together.
  const groupKeys: Record<string, (i: number) => KeyValue[]> = {
    // Two customers share a name; invoices with no customer group last.
    customer: (i) => (i % 8 === 0 ? [null, null] : [['Ola', 'Ola', 'Kari'][i % 3], `c${i % 3}`]),
    month: (i) => [`2026-0${1 + (i % 4)}`],
    status: (i) => [i % 4],
  }
  for (const groupBy of Object.keys(groupKeys)) {
    for (const sortBy of ['', 'total', 'customer']) {
      it(`shows every invoice once, grouped by ${groupBy}, sorted by ${sortBy || 'default'}`, () => {
        const parts = billingListSort(sortBy || undefined, 'asc', groupBy)
        const rows = Array.from({ length: 61 }, (_, i) => ({
          id: `r${String(i).padStart(3, '0')}`,
          k: [...groupKeys[groupBy](i), ...keysFor(sortBy, i)],
        }))
        expect(parts).toHaveLength(rows[0].k.length)
        for (const size of [1, 9, 50]) {
          const { seen, expected } = walk(rows, parts, size)
          expect(seen).toEqual(expected)
        }
      })
    }
  }

  it('refuses a cursor from another sort', () => {
    const parts = billingListSort('vehicle', 'asc')
    expect(() => billingKeysetAfter(parts, { v: ['x'], id: 'r1' })).toThrow('Invalid cursor')
    expect(() =>
      billingKeysetAfter(billingListSort('total', 'asc'), { v: ['lots'], id: 'r1' })
    ).toThrow('Invalid cursor')
  })
})

/** A row as the batch query returns it. */
function rawRow(id: string, k0: unknown) {
  return {
    id,
    title: 'Brakes',
    invoiceNumber: null,
    serviceDate: new Date('2026-01-01T00:00:00Z'),
    startDateTime: null,
    invoiceDate: null,
    effective_total: 100,
    paid_amount: 0,
    manually_paid: false,
    vehicle_id: null,
    vehicle_make: null,
    vehicle_model: null,
    vehicle_year: null,
    vehicle_license_plate: null,
    customer_id: null,
    customer_name: null,
    sent_at: null,
    view_count: 0,
    last_viewed_at: null,
    job_status: 'completed',
    k0,
  }
}

describe('the billing batch action', () => {
  beforeEach(() => {
    queries.calls = []
    auth.options = []
    rawRows.next = []
  })

  const batchQuery = () => queries.calls.find((q) => q.sql.includes('ORDER BY'))

  it('reads 50 rows, says where the next batch starts, and counts only on the first', async () => {
    rawRows.next = Array.from({ length: 51 }, (_, i) =>
      rawRow(`r${String(i).padStart(3, '0')}`, new Date(Date.UTC(2026, 0, 51 - i)))
    )
    const first = await getBillingRows({})
    expect(first.success).toBe(true)
    expect(first.data?.rows).toHaveLength(50)
    expect(first.data?.total).toBe(421)
    expect(first.data?.summary).toBeDefined()
    expect(first.data?.nextCursor).toEqual({
      v: [new Date(Date.UTC(2026, 0, 2)).toISOString()],
      id: 'r049',
    })
    expect(batchQuery()?.values).toContain(51)

    queries.calls = []
    rawRows.next = [rawRow('r050', new Date(Date.UTC(2026, 0, 1)))]
    const next = await getBillingRows({ cursor: first.data?.nextCursor })
    expect(next.data?.rows.map((r) => r.id)).toEqual(['r050'])
    expect(next.data?.nextCursor).toBeNull()
    expect(next.data?.total).toBeUndefined()
    expect(next.data?.summary).toBeUndefined()
    // Only the batch itself is asked for: no count, no summary.
    expect(queries.calls).toHaveLength(1)
    // The batch carries on after the cursor.
    expect(batchQuery()?.values).toEqual(
      expect.arrayContaining([new Date(Date.UTC(2026, 0, 2)).toISOString(), 'r049'])
    )
  })

  it('keeps every batch to the workshop and the filters', async () => {
    await getBillingRows({
      search: 'volvo',
      status: 'unpaid',
      delivery: 'unviewed',
      completedOnly: true,
      cursor: { v: [new Date().toISOString()], id: 'r1' },
    })
    const query = batchQuery()
    expect(query?.values).toContain('org-1')
    expect(query?.values).toContain('%volvo%')
    expect(query?.sql).toContain('paid_amount = 0')
    expect(query?.sql).toContain('view_count = 0')
    expect(query?.sql).toContain(`sr.status = 'completed'`)
    expect(query?.sql).toContain('sub.id >')
  })

  it('counts and sums only this workshop on the first batch', async () => {
    await getBillingRows({})
    expect(queries.calls).toHaveLength(3)
    for (const query of queries.calls) expect(query.values).toContain('org-1')
  })

  it('asks for the right to read billing and refuses a cursor from another sort', async () => {
    await getBillingRows({})
    expect(auth.options[0]).toEqual({
      requiredPermissions: [{ action: 'read', subject: 'billing' }],
    })
    const result = await getBillingRows({ sortBy: 'vehicle', cursor: { v: [null], id: 'r1' } })
    expect(result.success).toBe(false)
  })
})
