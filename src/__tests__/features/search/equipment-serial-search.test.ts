/**
 * A serial number of equipment fitted to a vehicle (a crane, a tail lift)
 * finds the vehicle it is on now, in the search palette, the vehicle list and
 * the vehicle picker, for a workshop that records equipment. A workshop that
 * does not searches exactly as it always did.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/cached-session', () => ({
  getCachedSession: vi.fn(),
  getCachedMembership: vi.fn(),
}))
vi.mock('@/lib/workshop-timezone', () => ({
  workshopTimeZone: vi.fn(async () => 'Pacific/Auckland'),
}))
vi.mock('@/features/tire-hotel/Lib/tireHotelSettings', () => ({
  isTireHotelEnabled: vi.fn(async () => false),
}))
vi.mock('@/features/vehicles/Lib/fleetNumberSetting', async (original) => ({
  ...(await original<typeof import('@/features/vehicles/Lib/fleetNumberSetting')>()),
  isFleetNumberEnabled: vi.fn(async () => false),
}))
vi.mock('@/features/vehicles/Lib/typeKeySetting', () => ({
  isTypeKeyEnabled: vi.fn(async () => false),
}))
vi.mock('@/features/customer-reference/Lib/referenceSetting', async (original) => ({
  ...(await original<typeof import('@/features/customer-reference/Lib/referenceSetting')>()),
  isCustomerReferenceEnabled: vi.fn(async () => false),
}))
vi.mock('@/features/inventory/Lib/tagSearch.server', () => ({
  partIdsWithTagContaining: vi.fn(async () => []),
}))
vi.mock('@/features/equipment/Lib/equipmentGate.server', () => ({
  equipmentEnabled: vi.fn(async () => false),
}))
vi.mock('@/lib/db', () => ({
  db: {
    user: { findUnique: vi.fn() },
    auditLog: { create: vi.fn() },
    vehicle: { findMany: vi.fn(), count: vi.fn() },
    equipmentItem: { findMany: vi.fn() },
    vehicleInspectionStatus: { count: vi.fn() },
    customer: { findMany: vi.fn() },
    serviceRecord: { findMany: vi.fn() },
    inventoryPart: { findMany: vi.fn() },
    quote: { findMany: vi.fn() },
    reminder: { findMany: vi.fn() },
    inspection: { findMany: vi.fn() },
    tireSet: { findMany: vi.fn() },
    appointment: { findMany: vi.fn() },
  },
}))

import { getCachedMembership, getCachedSession } from '@/lib/cached-session'
import { db } from '@/lib/db'
import { equipmentEnabled } from '@/features/equipment/Lib/equipmentGate.server'
import { globalSearch } from '@/features/search/Actions/searchActions'
import { getVehiclesPaginated, searchVehicles } from '@/features/vehicles/Actions/vehicleActions'

const ORG = 'org-a'

const serialOn = (term: string) => ({
  equipment: {
    some: {
      organizationId: ORG,
      removedAt: null,
      serialNumber: { contains: term, mode: 'insensitive' },
    },
  },
})

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(getCachedSession).mockResolvedValue({
    user: { id: 'user-a', email: 'a@x.com' },
  } as never)
  vi.mocked(getCachedMembership).mockResolvedValue({
    organizationId: ORG,
    role: 'owner',
    roleId: null,
    customRole: null,
  } as never)
  vi.mocked(db.user.findUnique).mockResolvedValue({ isSuperAdmin: false } as never)
  vi.mocked(db.auditLog.create).mockResolvedValue({} as never)
  for (const model of [
    db.vehicle,
    db.equipmentItem,
    db.customer,
    db.serviceRecord,
    db.inventoryPart,
    db.quote,
    db.reminder,
    db.inspection,
    db.tireSet,
    db.appointment,
  ]) {
    vi.mocked(model.findMany).mockResolvedValue([] as never)
  }
  vi.mocked(db.vehicle.count).mockResolvedValue(0 as never)
  vi.mocked(db.vehicleInspectionStatus.count).mockResolvedValue(0 as never)
})

/** The vehicle query each search sends, with equipment off and then on. */
async function vehicleQueries(run: () => Promise<unknown>) {
  vi.mocked(equipmentEnabled).mockResolvedValue(false)
  await run()
  const off = vi.mocked(db.vehicle.findMany).mock.calls[0][0]
  vi.mocked(db.vehicle.findMany).mockClear()
  vi.mocked(equipmentEnabled).mockResolvedValue(true)
  await run()
  const on = vi.mocked(db.vehicle.findMany).mock.calls[0][0]
  return { off, on }
}

describe('a serial number of equipment', () => {
  it('finds its vehicle in the search palette, and the row says which item matched', async () => {
    const { off, on } = await vehicleQueries(() => globalSearch('HX4471'))
    expect(JSON.stringify(off)).not.toContain('equipment')
    expect(on?.where).toEqual({
      ...off?.where,
      AND: [{ OR: expect.arrayContaining([serialOn('HX4471')]) }],
    })

    vi.mocked(db.vehicle.findMany).mockResolvedValueOnce([
      { id: 'veh-1', make: 'Scania', model: 'R450', year: 2019, licensePlate: 'AB12345' },
      { id: 'veh-2', make: 'Volvo', model: 'FH', year: 2020, licensePlate: 'HX44710' },
    ] as never)
    vi.mocked(db.equipmentItem.findMany).mockResolvedValueOnce([
      {
        vehicleId: 'veh-1',
        make: 'HIAB',
        model: 'X-HiPro 192',
        serialNumber: 'HX4471',
        type: { name: 'Crane' },
      },
    ] as never)
    const result = await globalSearch('HX4471')
    // Only the items on the vehicles found, this workshop's, on them now.
    expect(vi.mocked(db.equipmentItem.findMany).mock.calls.at(-1)?.[0]?.where).toEqual({
      organizationId: ORG,
      vehicleId: { in: ['veh-1', 'veh-2'] },
      removedAt: null,
      OR: [{ serialNumber: { contains: 'HX4471', mode: 'insensitive' } }],
    })
    expect(result.data?.vehicles).toEqual([
      expect.objectContaining({ id: 'veh-1', equipment: ['Crane, HIAB X-HiPro 192 (HX4471)'] }),
      // Found by its plate: nothing to say about equipment.
      expect.not.objectContaining({ equipment: expect.anything() }),
    ])
  })

  it('finds its vehicle in the vehicle list', async () => {
    const { off, on } = await vehicleQueries(() => getVehiclesPaginated({ search: 'SN-4471' }))
    expect(JSON.stringify(off)).not.toContain('equipment')
    const before = (off?.where?.OR ?? []) as unknown[]
    expect(on?.where?.OR).toEqual([...before.slice(0, -1), serialOn('SN-4471'), before.at(-1)])
  })

  it('finds its vehicle in the vehicle picker', async () => {
    const { off, on } = await vehicleQueries(() => searchVehicles('4471'))
    expect(JSON.stringify(off)).not.toContain('equipment')
    expect(on?.where?.OR).toContainEqual(serialOn('4471'))
  })

  it('is not searched at all while the workshop records no equipment', async () => {
    vi.mocked(equipmentEnabled).mockResolvedValue(false)
    await globalSearch('HX4471')
    await getVehiclesPaginated({ search: '4471' })
    await searchVehicles('4471')
    for (const [args] of vi.mocked(db.vehicle.findMany).mock.calls) {
      expect(JSON.stringify(args)).not.toContain('equipment')
      expect(JSON.stringify(args)).not.toContain('serialNumber')
    }
    expect(db.equipmentItem.findMany).not.toHaveBeenCalled()
  })
})
