/**
 * @vitest-environment node
 *
 * The tire hotel list loads more rows as it scrolls (getTireSetRows). Read
 * batch by batch, every sort has to show each set exactly once and in the same
 * order one long read would, the tabs and the search have to hold on every
 * batch (written-off sets stay out of the default view), and no batch may
 * reach another workshop's sets.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inMemoryTable, walkBatches } from '@/__tests__/helpers/in-memory-table'

const state = vi.hoisted(() => ({ org: 'org-1', rows: [] as Record<string, any>[] }))

vi.mock('@/lib/db', async () => {
  const { inMemoryTable } = await import('@/__tests__/helpers/in-memory-table')
  return {
    db: {
      tireSet: {
        findMany: vi.fn(inMemoryTable(() => state.rows).findMany),
        count: vi.fn(inMemoryTable(() => state.rows).count),
        groupBy: vi.fn(async () => [
          { status: 'stored', _count: { _all: 9 } },
          { status: 'released', _count: { _all: 4 } },
        ]),
      },
    },
  }
})
vi.mock('@/features/tire-hotel/Lib/tireHotelSettings', () => ({
  requireTireHotel: vi.fn(async () => undefined),
}))
vi.mock('@/features/vehicles/Lib/typeKeySetting', async (original) => ({
  ...(await original<typeof import('@/features/vehicles/Lib/typeKeySetting')>()),
  typeKeySearch: vi.fn(async () => []),
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
import { requireTireHotel } from '@/features/tire-hotel/Lib/tireHotelSettings'
import { getTireSetRows } from '@/features/tire-hotel/Actions/getTireSetRows'
import { TIRE_SET_BATCH_SIZE } from '@/features/tire-hotel/Lib/tireSetList.server'

/** 130 sets here and 15 in another workshop, with plenty of ties and gaps. */
function fixture() {
  return Array.from({ length: 145 }, (_, i) => ({
    id: `t${String(i).padStart(3, '0')}`,
    organizationId: i < 130 ? 'org-1' : 'org-2',
    reference: i % 5 === 0 ? null : `R-${i % 25}`,
    season: ['summer', 'winter', 'all_season'][i % 3],
    status: ['stored', 'released', 'stored', 'disposed'][i % 4],
    brand: ['Michelin', 'Nokian'][i % 2],
    model: null,
    size: '205/55R16',
    dotCode: null,
    checkedInAt: i % 6 === 0 ? null : new Date(Date.UTC(2026, 9, 1 + (i % 9))),
    updatedAt: new Date(Date.UTC(2026, 10, 1 + (i % 7))),
    location: i % 8 === 0 ? null : { code: `A-${i % 10}`, warehouseId: 'w1' },
    customer: i % 7 === 0 ? null : { id: `c${i % 3}`, name: ['Ola', 'Kari', 'Per'][i % 3] },
    vehicle: null,
    treatments: i % 10 === 0 ? [{ type: 'wash', status: 'pending' }] : [],
  }))
}

async function oneLongRead(input: Parameters<typeof getTireSetRows>[0]) {
  vi.mocked(db.tireSet.findMany).mockClear()
  await getTireSetRows(input)
  const args = vi.mocked(db.tireSet.findMany).mock.calls[0][0] as any
  const all = await inMemoryTable(() => state.rows).findMany({
    where: args.where,
    orderBy: args.orderBy,
  })
  return all.map((row) => row.id)
}

const live = (org = 'org-1') =>
  fixture().filter((row) => row.organizationId === org && row.status !== 'disposed').length

beforeEach(() => {
  state.org = 'org-1'
  state.rows = fixture()
  vi.mocked(db.tireSet.findMany).mockClear()
  vi.mocked(db.tireSet.count).mockClear()
})

const sorts: [string | undefined, 'asc' | 'desc'][] = [
  [undefined, 'desc'],
  [undefined, 'asc'],
  ['reference', 'asc'],
  ['reference', 'desc'],
  ['season', 'asc'],
  ['status', 'desc'],
  ['checkedInAt', 'asc'],
  ['checkedInAt', 'desc'],
  ['customer', 'asc'],
  ['customer', 'desc'],
]

describe('reading the tire hotel list batch by batch', () => {
  for (const [sortBy, sortOrder] of sorts) {
    it(`shows every set once, in order, sorted by ${sortBy ?? 'last saved'} ${sortOrder}`, async () => {
      const input = { sortBy, sortOrder }
      const { ids, batches, total } = await walkBatches(getTireSetRows, (cursor) => ({
        ...input,
        cursor,
      }))
      const expected = await oneLongRead(input)
      expect(expected.length).toBe(live())
      expect(expected.length).toBeGreaterThan(TIRE_SET_BATCH_SIZE)
      expect(ids).toEqual(expected)
      expect(new Set(ids).size).toBe(ids.length)
      expect(batches).toBe(Math.ceil(expected.length / TIRE_SET_BATCH_SIZE))
      expect(total).toBe(expected.length)
    })
  }

  it('keeps written-off sets out of the default view, and the tabs on every batch', async () => {
    const all = await walkBatches(getTireSetRows, (cursor) => ({ cursor }))
    for (const id of all.ids) {
      expect(state.rows.find((row) => row.id === id)?.status).not.toBe('disposed')
    }

    const disposed = await walkBatches(getTireSetRows, (cursor) => ({ status: 'disposed', cursor }))
    expect(disposed.ids.length).toBeGreaterThan(0)
    for (const id of disposed.ids) {
      expect(state.rows.find((row) => row.id === id)?.status).toBe('disposed')
    }

    const prep = await walkBatches(getTireSetRows, (cursor) => ({ status: 'needs_prep', cursor }))
    expect(prep.ids.length).toBeGreaterThan(0)
    for (const id of prep.ids) {
      const row = state.rows.find((r) => r.id === id)
      expect(row?.treatments).toEqual([{ type: 'wash', status: 'pending' }])
      expect(row?.status).not.toBe('disposed')
    }

    const nokian = await walkBatches(getTireSetRows, (cursor) => ({
      search: 'nokian',
      sortBy: 'reference',
      cursor,
    }))
    expect(nokian.ids.length).toBeGreaterThan(0)
    for (const id of nokian.ids) {
      expect(state.rows.find((row) => row.id === id)?.brand).toBe('Nokian')
    }
  })

  it('carries the tab counts on the first batch only', async () => {
    const first = await getTireSetRows({})
    expect(first.data?.statusCounts).toEqual({
      stored: 9,
      released: 4,
      needs_prep: expect.any(Number),
    })
    const second = await getTireSetRows({ cursor: first.data?.nextCursor })
    expect(second.data?.statusCounts).toBeUndefined()
    expect(second.data?.total).toBeUndefined()
  })
})

describe('another workshop', () => {
  it('never sees this workshop’s sets, in any batch', async () => {
    state.org = 'org-2'
    const { ids } = await walkBatches(getTireSetRows, (cursor) => ({ cursor }))
    expect(ids).toHaveLength(live('org-2'))
    for (const id of ids) {
      expect(state.rows.find((row) => row.id === id)?.organizationId).toBe('org-2')
    }
    for (const [args] of vi.mocked(db.tireSet.count).mock.calls) {
      expect((args as any).where.organizationId).toBe('org-2')
    }
  })
})

describe('the action', () => {
  it('asks for permission to read the tire hotel, and that the module is on', async () => {
    vi.mocked(requireTireHotel).mockClear()
    await getTireSetRows({})
    expect(vi.mocked(withAuth).mock.calls.at(-1)?.[1]).toEqual({
      requiredPermissions: [{ action: 'read', subject: 'tire_hotel' }],
    })
    expect(requireTireHotel).toHaveBeenCalledWith('org-1')
  })

  it('refuses a cursor that does not fit the sort', async () => {
    expect((await getTireSetRows({ cursor: { v: [1, 2], id: 't001' } })).success).toBe(false)
  })
})
