import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/with-auth', () => ({
  withAuth: async (fn: (ctx: { userId: string; organizationId: string }) => Promise<unknown>) => ({
    success: true,
    data: await fn({ userId: 'user-1', organizationId: 'org-1' }),
  }),
}))
vi.mock('@/lib/workshop-timezone', () => ({
  workshopTimeZone: vi.fn(async () => 'Pacific/Auckland'),
}))
vi.mock('@/lib/owned-records', () => ({ assertOwnedCustomer: vi.fn(async () => undefined) }))
vi.mock('@/features/integrations/Lib/inspection-sync', () => ({
  INSPECTION_CAPABILITY: 'inspection',
  recordRegistryAnswer: vi.fn(),
}))
vi.mock('@/integrations/registry', () => ({ getManifest: vi.fn(() => null) }))
vi.mock('@/lib/files/manager', () => ({ releaseFiles: vi.fn() }))
vi.mock('@/lib/files/collect', () => ({ vehicleFileUrls: vi.fn(async () => []) }))
// No fleet number and no fields of the workshop's own, as for every workshop
// that has asked for neither.
vi.mock('@/features/vehicles/Lib/fleetNumberSetting', async (original) => ({
  ...(await original<typeof import('@/features/vehicles/Lib/fleetNumberSetting')>()),
  isFleetNumberEnabled: vi.fn(async () => false),
}))
vi.mock('@/features/custom-fields/Lib/getCustomFieldsForPrint', () => ({
  getRecordCustomFieldsForPrint: vi.fn(async () => []),
}))
vi.mock('@/lib/db', () => ({
  db: {
    vehicle: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'veh-1',
        ...data,
      })),
      findFirst: vi.fn(),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    vehicleInspectionStatus: { updateMany: vi.fn(), upsert: vi.fn() },
  },
}))

import { db } from '@/lib/db'
import { createVehicle, updateVehicle } from '@/features/vehicles/Actions/vehicleActions'

const created = () => vi.mocked(db.vehicle.create).mock.calls[0][0].data
const updated = () => vi.mocked(db.vehicle.updateMany).mock.calls[0][0].data

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(db.vehicle.findFirst).mockResolvedValue({
    year: 2020,
    make: 'Testmobile',
    model: 'Fiction',
    licensePlate: 'OLD 1',
    vin: null,
    imageUrl: null,
  } as never)
})

describe('saving a vehicle', () => {
  it('stores a plate typed in lower case in upper case', async () => {
    const result = await createVehicle({
      make: 'Testmobile',
      model: 'Fiction',
      year: 2020,
      licensePlate: ' zz99  tst ',
    })
    expect(result.success).toBe(true)
    expect(created().licensePlate).toBe('ZZ99 TST')
  })

  it('stores no plate for a vehicle saved without one', async () => {
    await createVehicle({ make: 'Testmobile', model: 'Fiction', year: 2020, licensePlate: '' })
    expect(created().licensePlate).toBeNull()
  })

  it('stores an edited plate in upper case', async () => {
    await updateVehicle({ id: 'veh-1', licensePlate: 'ab-123 cd' })
    expect(updated().licensePlate).toBe('AB-123 CD')
  })

  it('clears the plate when the field is emptied', async () => {
    await updateVehicle({ id: 'veh-1', licensePlate: '' })
    expect(updated().licensePlate).toBeNull()
  })

  it('leaves the plate alone on an edit that does not send it', async () => {
    await updateVehicle({ id: 'veh-1', color: 'Red' })
    expect(updated().licensePlate).toBeUndefined()
  })
})
