/**
 * @vitest-environment node
 *
 * Saving the fleet / unit number. The server decides whether the workshop
 * uses the field, whatever a form sends: off, nothing is stored on a new
 * vehicle and what an old one holds is left exactly as it was.
 */
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
vi.mock('@/lib/features', () => ({ getFeatures: vi.fn() }))
vi.mock('@/features/custom-fields/Lib/getCustomFieldsForPrint', () => ({
  getRecordCustomFieldsForPrint: vi.fn(async () => []),
}))
vi.mock('@/lib/db', () => ({
  db: {
    appSetting: { findMany: vi.fn() },
    vehicle: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'veh-1',
        ...data,
      })),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    vehicleInspectionStatus: { updateMany: vi.fn(), upsert: vi.fn() },
  },
}))

import { db } from '@/lib/db'
import { getFeatures } from '@/lib/features'
import {
  createVehicle,
  getVehicles,
  updateVehicle,
} from '@/features/vehicles/Actions/vehicleActions'

const created = () => vi.mocked(db.vehicle.create).mock.calls[0][0].data
const updated = () => vi.mocked(db.vehicle.updateMany).mock.calls[0][0].data
const base = { make: 'Testmobile', model: 'Fiction', year: 2020 }

function workshop({ field, plan = true }: { field: boolean; plan?: boolean }) {
  vi.mocked(db.appSetting.findMany).mockResolvedValue(
    (field ? [{ key: 'vehicle.fleetNumberEnabled', value: 'true' }] : []) as never
  )
  vi.mocked(getFeatures).mockResolvedValue({ customFields: plan } as never)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(db.vehicle.findFirst).mockResolvedValue({
    ...base,
    licensePlate: null,
    vin: null,
    imageUrl: null,
  } as never)
})

describe('a workshop that uses the fleet number', () => {
  beforeEach(() => workshop({ field: true }))

  it('stores what was typed, trimmed', async () => {
    expect((await createVehicle({ ...base, fleetNumber: '  T-208 ' })).success).toBe(true)
    expect(created().fleetNumber).toBe('T-208')
  })

  it('stores an edit, and clears the number when the box is emptied', async () => {
    await updateVehicle({ id: 'veh-1', fleetNumber: 'Unit 14' })
    expect(updated().fleetNumber).toBe('Unit 14')

    vi.mocked(db.vehicle.updateMany).mockClear()
    await updateVehicle({ id: 'veh-1', fleetNumber: '' })
    expect(updated().fleetNumber).toBeNull()
  })

  it('leaves the number alone on an edit that does not send it', async () => {
    await updateVehicle({ id: 'veh-1', color: 'Red' })
    expect(updated().fleetNumber).toBeUndefined()
  })

  it('shows it in the list', async () => {
    vi.mocked(db.vehicle.findMany).mockResolvedValue([{ id: 'v1', fleetNumber: 'T-208' }] as never)
    expect((await getVehicles()).data).toEqual([{ id: 'v1', fleetNumber: 'T-208' }])
  })
})

describe.each([
  ['has the switch off', { field: false }],
  ['is on a plan without custom fields', { field: true, plan: false }],
])('a workshop that %s', (_name, state) => {
  beforeEach(() => workshop(state))

  it('stores no number on a new vehicle, whatever the form sent', async () => {
    await createVehicle({ ...base, fleetNumber: 'T-208' })
    expect(created().fleetNumber).toBeNull()
  })

  it('never touches the number a vehicle already has', async () => {
    await updateVehicle({ id: 'veh-1', fleetNumber: '' })
    expect(updated().fleetNumber).toBeUndefined()
    vi.mocked(db.vehicle.updateMany).mockClear()
    await updateVehicle({ id: 'veh-1', fleetNumber: 'T-999' })
    expect(updated().fleetNumber).toBeUndefined()
  })

  it('is not shown the number a vehicle still holds', async () => {
    vi.mocked(db.vehicle.findMany).mockResolvedValue([{ id: 'v1', fleetNumber: 'T-208' }] as never)
    expect((await getVehicles()).data).toEqual([{ id: 'v1', fleetNumber: null }])
  })
})
