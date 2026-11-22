/**
 * Putting a customer on a vehicle from the work order sends the vehicle's id
 * and the customer, nothing else. The update schema used to inherit the new
 * vehicle's `mileage` default of 0, which zod fills in even on an optional
 * field: the save wrote 0 over the reading and marked it as typed by hand.
 * An update writes only what it was sent.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/cached-session', () => ({
  getCachedSession: vi.fn(),
  getCachedMembership: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

vi.mock('@/lib/resolve-upload-path', () => ({
  resolveUploadPath: vi.fn((url: string) => `/uploads/${url}`),
}))

// These tests are about workshop scoping, not files: the file manager and the
// files a delete collects have tests of their own (src/__tests__/lib/files).
vi.mock('@/lib/files/collect', () => ({
  serviceRecordFileUrls: vi.fn(async () => []),
  inspectionFileUrls: vi.fn(async () => []),
  vehicleFileUrls: vi.fn(async () => []),
  quoteFileUrls: vi.fn(async () => []),
  tireSetFileUrls: vi.fn(async () => []),
  inventoryPartFileUrls: vi.fn(async () => []),
}))
vi.mock('@/lib/files/manager', () => ({
  releaseFiles: vi.fn(async () => ({ removed: [], kept: [], skipped: [] })),
  parseStoredFileUrl: vi.fn(() => null),
}))

vi.mock('@/lib/db', () => ({
  db: {
    user: { findUnique: vi.fn() },
    appSetting: { findMany: vi.fn() },
    vehicle: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    customer: { findFirst: vi.fn(), count: vi.fn() },
    quote: { findMany: vi.fn().mockResolvedValue([]) },
    serviceRecord: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      delete: vi.fn(),
    },
    serviceAttachment: {
      findFirst: vi.fn(),
      delete: vi.fn(),
    },
    servicePart: { findMany: vi.fn() },
    inventoryPart: { updateMany: vi.fn() },
    $transaction: vi.fn(),
  },
}))

import { getCachedSession, getCachedMembership } from '@/lib/cached-session'
import { db } from '@/lib/db'
import { updateVehicle } from '@/features/vehicles/Actions/vehicleActions'
import { createVehicleSchema, updateVehicleSchema } from '@/features/vehicles/Schema/vehicleSchema'

const mockSession = vi.mocked(getCachedSession)
const mockMembership = vi.mocked(getCachedMembership)
const mockUserFindUnique = vi.mocked(db.user.findUnique)

const ORG_A = 'org-a'
const ORG_B = 'org-b'

function setupOrgAOwner() {
  mockSession.mockResolvedValue({ user: { id: 'user-a', email: 'a@example.com' } } as any)
  mockMembership.mockResolvedValue({
    organizationId: ORG_A,
    role: 'owner',
    roleId: null,
    customRole: null,
  } as any)
  mockUserFindUnique.mockResolvedValue({ isSuperAdmin: false } as any)
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(db.appSetting.findMany).mockResolvedValue([] as any)
  setupOrgAOwner()
  vi.mocked(db.vehicle.findFirst).mockResolvedValue({
    year: 2013,
    make: 'Land Rover',
    model: 'Evoque',
    licensePlate: '094425-113-16',
    vin: null,
    imageUrl: null,
    mileage: 50000,
  } as any)
  vi.mocked(db.customer.findFirst).mockResolvedValue({ id: 'cus-1' } as any)
  vi.mocked(db.customer.count).mockResolvedValue(1 as any)
  vi.mocked(db.vehicle.updateMany).mockResolvedValue({ count: 1 } as any)
})

describe('the update schema', () => {
  it('leaves out the reading when it was not sent', () => {
    const parsed = updateVehicleSchema.parse({ id: 'veh-a', customerId: 'cus-1' })
    expect(parsed).toEqual({ id: 'veh-a', customerId: 'cus-1' })
    expect('mileage' in parsed).toBe(false)
  })

  it('adds nothing to an update that names only the vehicle', () => {
    expect(updateVehicleSchema.parse({ id: 'veh-a' })).toEqual({ id: 'veh-a' })
  })

  it('keeps a reading that was sent, a zero too', () => {
    expect(updateVehicleSchema.parse({ id: 'veh-a', mileage: '51200' }).mileage).toBe(51200)
    expect(updateVehicleSchema.parse({ id: 'veh-a', mileage: 0 }).mileage).toBe(0)
    expect(() => updateVehicleSchema.parse({ id: 'veh-a', mileage: -1 })).toThrow()
  })

  it('still starts a new vehicle at 0', () => {
    const parsed = createVehicleSchema.parse({ make: 'Land Rover', model: 'Evoque', year: 2013 })
    expect(parsed.mileage).toBe(0)
  })
})

describe('updateVehicle with only a customer', () => {
  it('writes the customer and leaves the reading and where it came from alone', async () => {
    const result = await updateVehicle({ id: 'veh-a', customerId: 'cus-1' })

    expect(result.success).toBe(true)
    const call = vi.mocked(db.vehicle.updateMany).mock.calls[0][0]
    expect(call.where).toEqual({ id: 'veh-a', organizationId: ORG_A })
    const data = call.data as Record<string, unknown>
    expect(data.customerId).toBe('cus-1')
    expect(data.mileage).toBeUndefined()
    expect('readingJobId' in data).toBe(false)
    expect('readingBeforeJob' in data).toBe(false)
    // Nothing but the customer is written.
    const written = Object.entries(data).filter(([, value]) => value !== undefined)
    expect(written).toEqual([['customerId', 'cus-1']])
    expect(result.data?.fields).toEqual(['customerId'])
  })

  it('marks a reading typed on the vehicle form as set by hand, as before', async () => {
    await updateVehicle({ id: 'veh-a', mileage: 51200 })

    const data = vi.mocked(db.vehicle.updateMany).mock.calls[0][0].data as Record<string, unknown>
    expect(data.mileage).toBe(51200)
    expect(data.readingJobId).toBeNull()
    expect(data.readingBeforeJob).toBeNull()
  })
})
