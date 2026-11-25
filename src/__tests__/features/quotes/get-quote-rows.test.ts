/**
 * @vitest-environment node
 *
 * The quote list loads more rows as it scrolls (getQuoteRows). Read batch by
 * batch, every sort has to show each quote exactly once and in the same order
 * one long read would, the status tab and the search have to hold on every
 * batch, and no batch may ever reach another workshop's quotes.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inMemoryTable, walkBatches } from '@/__tests__/helpers/in-memory-table'

const state = vi.hoisted(() => ({ org: 'org-1', rows: [] as Record<string, any>[] }))

vi.mock('@/lib/db', async () => {
  const { inMemoryTable } = await import('@/__tests__/helpers/in-memory-table')
  return {
    db: {
      quote: {
        findMany: vi.fn(inMemoryTable(() => state.rows).findMany),
        count: vi.fn(inMemoryTable(() => state.rows).count),
        groupBy: vi.fn(async () => [
          { status: 'draft', _count: 4 },
          { status: 'accepted', _count: 2 },
          { status: 'changes_requested', _count: 1 },
        ]),
      },
    },
  }
})
vi.mock('@/features/customer-reference/Lib/referenceSetting', async (original) => ({
  ...(await original<typeof import('@/features/customer-reference/Lib/referenceSetting')>()),
  isCustomerReferenceEnabled: vi.fn(async () => false),
}))
vi.mock('@/lib/with-auth', () => ({
  withAuth: vi.fn(async (run: (ctx: { organizationId: string }) => Promise<unknown>) => {
    try {
      return { success: true, data: await run({ organizationId: state.org }) }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  }),
}))

import { db } from '@/lib/db'
import { withAuth } from '@/lib/with-auth'
import { getQuoteRows } from '@/features/quotes/Actions/getQuoteRows'
import { QUOTE_BATCH_SIZE } from '@/features/quotes/Lib/quoteList.server'
import { ATTENTION_STATUSES } from '@/features/quotes/Lib/quoteStatus'

const statuses = ['draft', 'sent', 'accepted', 'rejected', 'converted', ...ATTENTION_STATUSES]

/** 140 quotes here and 20 in another workshop, with plenty of ties and gaps. */
function fixture() {
  return Array.from({ length: 160 }, (_, i) => ({
    id: `q${String(i).padStart(3, '0')}`,
    organizationId: i < 140 ? 'org-1' : 'org-2',
    quoteNumber: i % 6 === 0 ? null : `QT-${1000 + (i % 50)}`,
    title: ['Brakes', 'Service', 'Tyres', 'Timing belt'][i % 4],
    status: statuses[i % statuses.length],
    totalAmount: (i % 5) * 250.5,
    customerReference: null,
    createdAt: new Date(Date.UTC(2026, 10, 1 + (i % 12))),
    customer: i % 7 === 0 ? null : { id: `c${i % 4}`, name: ['Ola', 'Kari', 'Per'][i % 3] },
    vehicle:
      i % 5 === 0
        ? null
        : { id: `v${i % 9}`, make: ['Volvo', 'Audi'][i % 2], model: 'X', year: 2015 + (i % 3) },
  }))
}

async function oneLongRead(input: Parameters<typeof getQuoteRows>[0]) {
  vi.mocked(db.quote.findMany).mockClear()
  await getQuoteRows(input)
  const args = vi.mocked(db.quote.findMany).mock.calls[0][0] as any
  const all = await inMemoryTable(() => state.rows).findMany({
    where: args.where,
    orderBy: args.orderBy,
  })
  return all.map((row) => row.id)
}

beforeEach(() => {
  state.org = 'org-1'
  state.rows = fixture()
  vi.mocked(db.quote.findMany).mockClear()
  vi.mocked(db.quote.count).mockClear()
})

const sorts: [string | undefined, 'asc' | 'desc'][] = [
  [undefined, 'desc'],
  ['quoteNumber', 'asc'],
  ['quoteNumber', 'desc'],
  ['title', 'asc'],
  ['customer', 'asc'],
  ['customer', 'desc'],
  ['vehicle', 'asc'],
  ['vehicle', 'desc'],
  ['status', 'asc'],
  ['totalAmount', 'desc'],
  ['createdAt', 'asc'],
]

describe('reading the quote list batch by batch', () => {
  for (const [sortBy, sortOrder] of sorts) {
    it(`shows every quote once, in order, sorted by ${sortBy ?? 'newest'} ${sortOrder}`, async () => {
      const input = { sortBy, sortOrder }
      const { ids, batches, total } = await walkBatches(getQuoteRows, (cursor) => ({
        ...input,
        cursor,
      }))
      const expected = await oneLongRead(input)
      expect(expected.length).toBe(140)
      expect(ids).toEqual(expected)
      expect(new Set(ids).size).toBe(ids.length)
      expect(batches).toBe(Math.ceil(140 / QUOTE_BATCH_SIZE))
      expect(total).toBe(140)
    })
  }

  it('keeps the status tab and the search on every batch', async () => {
    const attention = await walkBatches(getQuoteRows, (cursor) => ({
      status: 'attention',
      sortBy: 'title',
      cursor,
    }))
    expect(attention.ids.length).toBeGreaterThan(0)
    for (const id of attention.ids) {
      expect(ATTENTION_STATUSES).toContain(state.rows.find((row) => row.id === id)?.status)
    }

    const brakes = await walkBatches(getQuoteRows, (cursor) => ({ search: 'brak', cursor }))
    expect(brakes.ids).toHaveLength(35)
    for (const id of brakes.ids) {
      expect(state.rows.find((row) => row.id === id)?.title).toBe('Brakes')
    }
  })

  it('carries the tab counts on the first batch only, attention summed', async () => {
    const first = await getQuoteRows({})
    expect(first.data?.statusCounts).toMatchObject({ draft: 4, accepted: 2 })
    expect(first.data?.statusCounts?.attention).toBe(3)
    const second = await getQuoteRows({ cursor: first.data?.nextCursor })
    expect(second.data?.statusCounts).toBeUndefined()
    expect(second.data?.total).toBeUndefined()
  })
})

describe('another workshop', () => {
  it('never sees this workshop’s quotes, in any batch', async () => {
    state.org = 'org-2'
    const { ids } = await walkBatches(getQuoteRows, (cursor) => ({ cursor }))
    expect(ids).toHaveLength(20)
    for (const id of ids) {
      expect(state.rows.find((row) => row.id === id)?.organizationId).toBe('org-2')
    }
    for (const [args] of vi.mocked(db.quote.count).mock.calls) {
      expect((args as any).where.organizationId).toBe('org-2')
    }
    expect(vi.mocked(db.quote.groupBy).mock.calls.at(-1)?.[0]).toMatchObject({
      where: { organizationId: 'org-2' },
    })
  })
})

describe('the action', () => {
  it('asks for permission to read quotes', async () => {
    await getQuoteRows({})
    expect(vi.mocked(withAuth).mock.calls.at(-1)?.[1]).toEqual({
      requiredPermissions: [{ action: 'read', subject: 'quotes' }],
    })
  })

  it('refuses a cursor that does not fit the sort', async () => {
    expect((await getQuoteRows({ cursor: { v: [], id: 'q001' } })).success).toBe(false)
    expect((await getQuoteRows({ sortBy: 'title', cursor: { v: [4], id: 'q001' } })).success).toBe(
      false
    )
  })
})
