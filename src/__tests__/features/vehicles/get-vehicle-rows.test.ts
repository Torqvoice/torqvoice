/**
 * @vitest-environment node
 *
 * The vehicle list loads more rows as it scrolls (getVehicleRows). Read batch
 * by batch, every sort has to show each vehicle exactly once and in the same
 * order one long read would, the filters have to hold on every batch, and no
 * batch may ever reach another workshop's vehicles.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inMemoryTable, walkBatches } from '@/__tests__/helpers/in-memory-table'

const state = vi.hoisted(() => ({ org: 'org-1', rows: [] as Record<string, any>[] }))

vi.mock('@/lib/db', async () => {
  const { inMemoryTable } = await import('@/__tests__/helpers/in-memory-table')
  return {
    db: {
      vehicle: {
        findMany: vi.fn(inMemoryTable(() => state.rows).findMany),
        count: vi.fn(inMemoryTable(() => state.rows).count),
      },
      vehicleInspectionStatus: { count: vi.fn(async () => 3) },
    },
  }
})
vi.mock('@/features/vehicles/Lib/fleetNumberSetting', async (original) => ({
  ...(await original<typeof import('@/features/vehicles/Lib/fleetNumberSetting')>()),
  isFleetNumberEnabled: vi.fn(async () => false),
}))
vi.mock('@/features/vehicles/Lib/typeKeySetting', () => ({
  isTypeKeyEnabled: vi.fn(async () => false),
}))
vi.mock('@/features/equipment/Lib/equipmentGate.server', () => ({
  equipmentEnabled: vi.fn(async () => false),
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
import { getVehicleRows } from '@/features/vehicles/Actions/getVehicleRows'
import { VEHICLE_BATCH_SIZE } from '@/features/vehicles/Lib/vehicleList.server'

const DAY = 86_400_000
const now = Date.now()
const makes = ['Volvo', 'Audi', 'Volvo', 'Tesla', 'Ford']

/** 130 vehicles here and 20 in another workshop, with plenty of ties and gaps. */
function fixture() {
  const rows: Record<string, any>[] = []
  for (let i = 0; i < 150; i++) {
    const org = i < 130 ? 'org-1' : 'org-2'
    rows.push({
      id: `v${String(i).padStart(3, '0')}`,
      organizationId: org,
      isArchived: i % 9 === 0,
      make: makes[i % 5],
      model: ['V70', 'A4', 'XC90'][i % 3],
      year: 2010 + (i % 4),
      vin: null,
      licensePlate: i % 7 === 0 ? null : `AB${1000 + (i % 40)}`,
      fleetNumber: `F-${i}`,
      mileage: (i % 6) * 10_000,
      // Many vehicles saved in the same instant, so the id has to break ties.
      updatedAt: new Date(Date.UTC(2026, 10, 1 + (i % 10))),
      customer: i % 8 === 0 ? null : { id: `c${i % 5}`, name: ['Ola', 'Kari', 'Per'][i % 3] },
      inspectionStatus:
        i % 5 === 0
          ? null
          : {
              dueAt: i % 5 === 1 ? null : new Date(now + ((i % 11) - 4) * 10 * DAY),
              source: 'manual',
            },
      serviceRecords: Array.from({ length: i % 4 }, (_, j) => ({ id: `s${i}-${j}` })),
      _count: { serviceRecords: i % 4 },
    })
  }
  return rows
}

/** What one long read of the whole list returns, in its order. */
async function oneLongRead(input: Parameters<typeof getVehicleRows>[0]) {
  vi.mocked(db.vehicle.findMany).mockClear()
  await getVehicleRows(input)
  const args = vi.mocked(db.vehicle.findMany).mock.calls[0][0] as any
  const all = await inMemoryTable(() => state.rows).findMany({
    where: args.where,
    orderBy: args.orderBy,
  })
  return all.map((row) => row.id)
}

beforeEach(() => {
  state.org = 'org-1'
  state.rows = fixture()
  vi.mocked(db.vehicle.findMany).mockClear()
  vi.mocked(db.vehicle.count).mockClear()
})

const sorts: [string | undefined, 'asc' | 'desc'][] = [
  [undefined, 'desc'],
  ['plate', 'asc'],
  ['plate', 'desc'],
  ['vehicle', 'asc'],
  ['vehicle', 'desc'],
  ['customer', 'asc'],
  ['customer', 'desc'],
  ['mileage', 'asc'],
  ['mileage', 'desc'],
  ['services', 'asc'],
  ['services', 'desc'],
]

describe('reading the vehicle list batch by batch', () => {
  for (const [sortBy, sortOrder] of sorts) {
    it(`shows every vehicle once, in order, sorted by ${sortBy ?? 'last saved'} ${sortOrder}`, async () => {
      const input = { sortBy, sortOrder }
      const { ids, batches, total } = await walkBatches(getVehicleRows, (cursor) => ({
        ...input,
        cursor,
      }))
      const expected = await oneLongRead(input)
      expect(expected.length).toBeGreaterThan(VEHICLE_BATCH_SIZE * 2)
      expect(ids).toEqual(expected)
      expect(new Set(ids).size).toBe(ids.length)
      expect(batches).toBe(Math.ceil(expected.length / VEHICLE_BATCH_SIZE))
      expect(total).toBe(expected.length)
    })
  }

  it('reads the soonest inspection first under a due filter, across batches', async () => {
    const input = { inspectionDue: 90 as const }
    const { ids } = await walkBatches(getVehicleRows, (cursor) => ({ ...input, cursor }))
    expect(ids).toEqual(await oneLongRead(input))
    const dues = ids.map(
      (id) => state.rows.find((row) => row.id === id)?.inspectionStatus?.dueAt.getTime() as number
    )
    expect(dues).toEqual([...dues].sort((a, b) => a - b))
    // Only vehicles due within 90 days.
    expect(dues.every((due) => due < now + 90 * DAY)).toBe(true)
  })

  it('keeps the archived and search filters on every batch', async () => {
    const archived = await walkBatches(getVehicleRows, (cursor) => ({ archived: true, cursor }))
    expect(archived.ids.length).toBeGreaterThan(0)
    for (const id of archived.ids) {
      expect(state.rows.find((row) => row.id === id)).toMatchObject({ isArchived: true })
    }

    const tesla = await walkBatches(getVehicleRows, (cursor) => ({
      search: 'tesla',
      sortBy: 'mileage',
      sortOrder: 'asc',
      cursor,
    }))
    expect(tesla.ids.length).toBeGreaterThan(0)
    for (const id of tesla.ids) {
      expect(state.rows.find((row) => row.id === id)).toMatchObject({
        make: 'Tesla',
        isArchived: false,
      })
    }
  })

  it('carries the totals on the first batch only', async () => {
    const first = await getVehicleRows({})
    expect(first.data).toMatchObject({
      total: state.rows.filter((r) => r.organizationId === 'org-1' && !r.isArchived).length,
      archivedCount: state.rows.filter((r) => r.organizationId === 'org-1' && r.isArchived).length,
      hasInspectionData: true,
    })
    const second = await getVehicleRows({ cursor: first.data?.nextCursor })
    expect(second.data?.total).toBeUndefined()
    expect(second.data?.archivedCount).toBeUndefined()
  })

  it('hides the fleet number while the workshop has it switched off', async () => {
    const result = await getVehicleRows({})
    expect(result.data?.rows.every((row) => row.fleetNumber == null)).toBe(true)
  })
})

describe('another workshop', () => {
  it('never sees this workshop’s vehicles, in any batch', async () => {
    state.org = 'org-2'
    const { ids } = await walkBatches(getVehicleRows, (cursor) => ({ sortBy: 'services', cursor }))
    expect(ids.length).toBeGreaterThan(0)
    for (const id of ids) {
      expect(state.rows.find((row) => row.id === id)?.organizationId).toBe('org-2')
    }
    for (const [args] of vi.mocked(db.vehicle.findMany).mock.calls) {
      expect(JSON.stringify((args as any).where)).toContain('"organizationId":"org-2"')
    }
  })

  it('is asked of every query, counts included', async () => {
    await getVehicleRows({})
    for (const [args] of vi.mocked(db.vehicle.count).mock.calls) {
      expect((args as any).where.organizationId).toBe('org-1')
    }
  })
})

describe('the action', () => {
  it('asks for permission to read vehicles', async () => {
    await getVehicleRows({})
    expect(vi.mocked(withAuth).mock.calls.at(-1)?.[1]).toEqual({
      requiredPermissions: [{ action: 'read', subject: 'vehicles' }],
    })
  })

  it('refuses input it does not understand, and a cursor from another sort', async () => {
    expect((await getVehicleRows({ sortOrder: 'sideways' as never })).success).toBe(false)
    expect(
      (await getVehicleRows({ sortBy: 'services', cursor: { v: ['x'], id: 'v001' } })).success
    ).toBe(false)
    expect(
      (await getVehicleRows({ sortBy: 'mileage', cursor: { v: [], id: 'v001' } })).success
    ).toBe(false)
  })
})
