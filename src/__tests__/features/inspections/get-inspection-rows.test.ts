/**
 * @vitest-environment node
 *
 * The inspection list loads more rows as it scrolls (getInspectionRows). Read
 * batch by batch, every sort has to show each inspection exactly once and in
 * the same order one long read would, the status tab and the search have to
 * hold on every batch, and no batch may reach another workshop's inspections.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inMemoryTable, walkBatches } from '@/__tests__/helpers/in-memory-table'

const state = vi.hoisted(() => ({ org: 'org-1', rows: [] as Record<string, any>[] }))

vi.mock('@/lib/db', async () => {
  const { inMemoryTable } = await import('@/__tests__/helpers/in-memory-table')
  return {
    db: {
      inspection: {
        findMany: vi.fn(inMemoryTable(() => state.rows).findMany),
        count: vi.fn(inMemoryTable(() => state.rows).count),
        groupBy: vi.fn(async () => [
          { status: 'in_progress', _count: 5 },
          { status: 'completed', _count: 7 },
        ]),
      },
    },
  }
})
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
import { getInspectionRows } from '@/features/inspections/Actions/getInspectionRows'
import { INSPECTION_BATCH_SIZE } from '@/features/inspections/Lib/inspectionList.server'

/** 120 inspections here and 15 in another workshop, with plenty of ties. */
function fixture() {
  return Array.from({ length: 135 }, (_, i) => ({
    id: `i${String(i).padStart(3, '0')}`,
    organizationId: i < 120 ? 'org-1' : 'org-2',
    status: i % 3 === 0 ? 'completed' : 'in_progress',
    createdAt: new Date(Date.UTC(2026, 10, 1 + (i % 8))),
    vehicle: {
      id: `v${i % 10}`,
      make: ['Volvo', 'Audi', 'Scania'][i % 3],
      model: ['V70', 'A4'][i % 2],
      year: 2012 + (i % 4),
      licensePlate: i % 4 === 0 ? null : `ZZ${i % 30}`,
    },
    template: { id: `t${i % 3}`, name: ['Standard', 'EU control', 'Winter check'][i % 3] },
    items: [],
  }))
}

async function oneLongRead(input: Parameters<typeof getInspectionRows>[0]) {
  vi.mocked(db.inspection.findMany).mockClear()
  await getInspectionRows(input)
  const args = vi.mocked(db.inspection.findMany).mock.calls[0][0] as any
  const all = await inMemoryTable(() => state.rows).findMany({
    where: args.where,
    orderBy: args.orderBy,
  })
  return all.map((row) => row.id)
}

beforeEach(() => {
  state.org = 'org-1'
  state.rows = fixture()
  vi.mocked(db.inspection.findMany).mockClear()
  vi.mocked(db.inspection.count).mockClear()
})

const sorts: [string | undefined, 'asc' | 'desc'][] = [
  [undefined, 'desc'],
  ['vehicle', 'asc'],
  ['vehicle', 'desc'],
  ['template', 'asc'],
  ['template', 'desc'],
  ['status', 'asc'],
  ['createdAt', 'asc'],
  ['createdAt', 'desc'],
]

describe('reading the inspection list batch by batch', () => {
  for (const [sortBy, sortOrder] of sorts) {
    it(`shows every inspection once, in order, sorted by ${sortBy ?? 'newest'} ${sortOrder}`, async () => {
      const input = { sortBy, sortOrder }
      const { ids, batches, total } = await walkBatches(getInspectionRows, (cursor) => ({
        ...input,
        cursor,
      }))
      const expected = await oneLongRead(input)
      expect(expected.length).toBe(120)
      expect(ids).toEqual(expected)
      expect(new Set(ids).size).toBe(ids.length)
      expect(batches).toBe(Math.ceil(120 / INSPECTION_BATCH_SIZE))
      expect(total).toBe(120)
    })
  }

  it('keeps the status tab and the search on every batch', async () => {
    const done = await walkBatches(getInspectionRows, (cursor) => ({
      status: 'completed',
      sortBy: 'vehicle',
      cursor,
    }))
    expect(done.ids).toHaveLength(40)
    for (const id of done.ids) {
      expect(state.rows.find((row) => row.id === id)?.status).toBe('completed')
    }

    const winter = await walkBatches(getInspectionRows, (cursor) => ({ search: 'winter', cursor }))
    expect(winter.ids).toHaveLength(40)
    for (const id of winter.ids) {
      expect(state.rows.find((row) => row.id === id)?.template.name).toBe('Winter check')
    }
  })

  it('carries the tab counts on the first batch only', async () => {
    const first = await getInspectionRows({})
    expect(first.data?.statusCounts).toEqual({ in_progress: 5, completed: 7 })
    const second = await getInspectionRows({ cursor: first.data?.nextCursor })
    expect(second.data?.statusCounts).toBeUndefined()
    expect(second.data?.total).toBeUndefined()
  })
})

describe('another workshop', () => {
  it('never sees this workshop’s inspections, in any batch', async () => {
    state.org = 'org-2'
    const { ids } = await walkBatches(getInspectionRows, (cursor) => ({
      sortBy: 'template',
      cursor,
    }))
    expect(ids).toHaveLength(15)
    for (const id of ids) {
      expect(state.rows.find((row) => row.id === id)?.organizationId).toBe('org-2')
    }
    for (const [args] of vi.mocked(db.inspection.count).mock.calls) {
      expect((args as any).where.organizationId).toBe('org-2')
    }
  })
})

describe('the action', () => {
  it('asks for permission to read inspections', async () => {
    await getInspectionRows({})
    expect(vi.mocked(withAuth).mock.calls.at(-1)?.[1]).toEqual({
      requiredPermissions: [{ action: 'read', subject: 'inspections' }],
    })
  })

  it('refuses a cursor that does not fit the sort', async () => {
    expect((await getInspectionRows({ cursor: { v: ['soon'], id: 'i001' } })).success).toBe(false)
  })
})
