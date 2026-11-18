/**
 * Saving a vehicle's photo: a removed photo is saved as none (and its file let
 * go), and a save that does not name the photo leaves it alone.
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
import { releaseFiles } from '@/lib/files/manager'

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

const OLD_PHOTO = `/api/protected/files/${ORG_A}/vehicles/old.jpg`

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(db.appSetting.findMany).mockResolvedValue([] as any)
  setupOrgAOwner()
  vi.mocked(db.vehicle.findFirst).mockResolvedValue({
    year: 2011,
    make: 'BMW',
    model: '5-Serie',
    licensePlate: 'BS48364',
    vin: null,
    imageUrl: OLD_PHOTO,
  } as any)
  vi.mocked(db.vehicle.updateMany).mockResolvedValue({ count: 1 } as any)
})

describe('updateVehicle and the photo', () => {
  it('saves a removed photo as no photo and lets the file go', async () => {
    const result = await updateVehicle({ id: 'veh-a', imageUrl: '' })

    expect(result.success).toBe(true)
    const data = vi.mocked(db.vehicle.updateMany).mock.calls[0][0].data as Record<string, unknown>
    expect(data.imageUrl).toBeNull()
    expect(releaseFiles).toHaveBeenCalledWith([OLD_PHOTO], expect.anything())
  })

  it('leaves the photo alone when the save does not name it', async () => {
    await updateVehicle({ id: 'veh-a', make: 'BMW' })

    const data = vi.mocked(db.vehicle.updateMany).mock.calls[0][0].data as Record<string, unknown>
    expect(data.imageUrl).toBeUndefined()
    expect(releaseFiles).not.toHaveBeenCalled()
  })
})
