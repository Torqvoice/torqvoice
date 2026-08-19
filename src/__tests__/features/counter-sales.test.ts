/**
 * Counter sales (service records without a vehicle)
 *
 * Verifies that vehicle-less records require a direct customer, that the
 * customer must belong to the caller's org, that created records carry the
 * org id themselves, and that attaching a vehicle later clears the direct
 * customer link.
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
vi.mock('@/lib/notification-bus', () => ({
  notificationBus: { emit: vi.fn() },
}))
vi.mock('@/features/inventory/Lib/onInventoryChanged', () => ({
  onInventoryChanged: vi.fn(),
}))
vi.mock('@/lib/db', () => ({
  db: {
    user: { findUnique: vi.fn() },
    vehicle: { findFirst: vi.fn(), update: vi.fn() },
    customer: { findFirst: vi.fn() },
    organization: { findUnique: vi.fn() },
    appSetting: { findMany: vi.fn(), updateMany: vi.fn() },
    technician: { findFirst: vi.fn() },
    serviceRecord: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  },
}))

import { getCachedSession, getCachedMembership } from '@/lib/cached-session'
import { db } from '@/lib/db'
import {
  createServiceRecord,
  updateServiceRecord,
} from '@/features/vehicles/Actions/serviceActions'
import { createDraftCounterSale } from '@/features/vehicles/Actions/createDraftServiceRecord'

const mockSession = vi.mocked(getCachedSession)
const mockMembership = vi.mocked(getCachedMembership)
const ORG_A = 'org-a'

function setupOrgAOwner() {
  mockSession.mockResolvedValue({ user: { id: 'user-a', email: 'a@example.com' } } as any)
  mockMembership.mockResolvedValue({
    organizationId: ORG_A,
    role: 'owner',
    roleId: null,
    customRole: null,
  } as any)
  vi.mocked(db.user.findUnique).mockResolvedValue({ isSuperAdmin: false } as any)
}

function setupCreateEnvironment() {
  vi.mocked(db.appSetting.findMany).mockResolvedValue([] as any)
  vi.mocked(db.appSetting.updateMany).mockResolvedValue({ count: 0 } as any)
  vi.mocked(db.organization.findUnique).mockResolvedValue({ name: 'Workshop A' } as any)
  vi.mocked(db.technician.findFirst).mockResolvedValue(null)
  vi.mocked(db.serviceRecord.findFirst).mockResolvedValue(null)
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('createServiceRecord — counter sale (no vehicle)', () => {
  it('rejects a vehicle-less record without a customer', async () => {
    setupOrgAOwner()
    setupCreateEnvironment()

    const result = await createServiceRecord({ vehicleId: null, title: 'Counter sale' })

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/customer is required/i)
  })

  it('rejects when the customer belongs to another org', async () => {
    setupOrgAOwner()
    setupCreateEnvironment()
    vi.mocked(db.customer.findFirst).mockResolvedValue(null)

    const result = await createServiceRecord({
      vehicleId: null,
      customerId: 'cust-other-org',
      title: 'Counter sale',
    })

    expect(result.success).toBe(false)
    expect(result.error).toBe('Customer not found')
    expect(vi.mocked(db.customer.findFirst)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'cust-other-org', organizationId: ORG_A }),
      })
    )
  })

  it('creates the record with organizationId and the direct customer link', async () => {
    setupOrgAOwner()
    setupCreateEnvironment()
    vi.mocked(db.customer.findFirst).mockResolvedValue({ id: 'cust-a', taxExempt: false } as any)

    const txCreate = vi
      .fn()
      .mockResolvedValue({ id: 'sr-new', invoiceNumber: '2026-1001', vehicleId: null })
    vi.mocked(db.$transaction).mockImplementation(async (fn: any) =>
      fn({ serviceRecord: { create: txCreate } })
    )

    const result = await createServiceRecord({
      vehicleId: null,
      customerId: 'cust-a',
      title: 'Counter sale',
    })

    expect(result.success).toBe(true)
    expect(txCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: ORG_A,
          vehicleId: null,
          customerId: 'cust-a',
        }),
      })
    )
    // No vehicle to update mileage on
    expect(vi.mocked(db.vehicle.update)).not.toHaveBeenCalled()
  })

  it('keeps customerId null for vehicle-linked records', async () => {
    setupOrgAOwner()
    setupCreateEnvironment()
    vi.mocked(db.vehicle.findFirst).mockResolvedValue({
      id: 'veh-a',
      mileage: 10000,
      customer: { taxExempt: false },
    } as any)
    vi.mocked(db.vehicle.update).mockResolvedValue({} as any)

    const txCreate = vi
      .fn()
      .mockResolvedValue({ id: 'sr-new', invoiceNumber: '2026-1001', vehicleId: 'veh-a' })
    vi.mocked(db.$transaction).mockImplementation(async (fn: any) =>
      fn({ serviceRecord: { create: txCreate } })
    )

    const result = await createServiceRecord({
      vehicleId: 'veh-a',
      // A stray customerId on a vehicle-linked record must be ignored: the
      // invoice follows the vehicle's current customer.
      customerId: 'cust-a',
      title: 'Oil change',
    })

    expect(result.success).toBe(true)
    expect(txCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: ORG_A,
          vehicleId: 'veh-a',
          customerId: null,
        }),
      })
    )
  })
})

describe('updateServiceRecord — counter sale semantics', () => {
  it('treats a null vehicleId as no-change (does not detach the vehicle)', async () => {
    setupOrgAOwner()
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue({
      id: 'sr-a',
      vehicleId: 'veh-a',
      customerId: null,
      status: 'pending',
      attachments: [],
      serviceDate: new Date(),
      vehicle: {
        id: 'veh-a',
        mileage: 10000,
        make: 'Toyota',
        model: 'Camry',
        year: 2020,
        licensePlate: null,
      },
    } as any)
    const txUpdate = vi.fn().mockResolvedValue({ id: 'sr-a', status: 'pending', title: 'x' })
    vi.mocked(db.$transaction).mockImplementation(async (fn: any) =>
      fn({ serviceRecord: { update: txUpdate } })
    )

    const result = await updateServiceRecord({ id: 'sr-a', vehicleId: null, title: 'x' })

    expect(result.success).toBe(true)
    expect(txUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ vehicleId: expect.anything() }),
      })
    )
  })

  it('verifies org ownership of the target vehicle when attaching one', async () => {
    setupOrgAOwner()
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue({
      id: 'sr-a',
      vehicleId: null,
      customerId: 'cust-a',
      status: 'pending',
      attachments: [],
      serviceDate: new Date(),
      vehicle: null,
    } as any)
    vi.mocked(db.vehicle.findFirst).mockResolvedValue(null)

    const result = await updateServiceRecord({ id: 'sr-a', vehicleId: 'veh-other-org' })

    expect(result.success).toBe(false)
    expect(result.error).toBe('Vehicle not found')
    expect(vi.mocked(db.vehicle.findFirst)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'veh-other-org', organizationId: ORG_A }),
      })
    )
  })

  it('clears the direct customer link when a vehicle is attached', async () => {
    setupOrgAOwner()
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue({
      id: 'sr-a',
      vehicleId: null,
      customerId: 'cust-a',
      status: 'pending',
      attachments: [],
      serviceDate: new Date(),
      vehicle: null,
    } as any)
    vi.mocked(db.vehicle.findFirst).mockResolvedValue({ id: 'veh-a' } as any)
    const txUpdate = vi.fn().mockResolvedValue({ id: 'sr-a', status: 'pending', title: 'x' })
    vi.mocked(db.$transaction).mockImplementation(async (fn: any) =>
      fn({ serviceRecord: { update: txUpdate } })
    )

    const result = await updateServiceRecord({ id: 'sr-a', vehicleId: 'veh-a' })

    expect(result.success).toBe(true)
    expect(txUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ vehicleId: 'veh-a', customerId: null }),
      })
    )
  })
})

describe('createDraftCounterSale — cross-org isolation', () => {
  it('rejects a customer from another org', async () => {
    setupOrgAOwner()
    vi.mocked(db.customer.findFirst).mockResolvedValue(null)

    const result = await createDraftCounterSale('cust-other-org')

    expect(result.success).toBe(false)
    expect(result.error).toBe('Customer not found')
  })

  it("creates a draft scoped to the caller's org with no vehicle", async () => {
    setupOrgAOwner()
    setupCreateEnvironment()
    vi.mocked(db.customer.findFirst).mockResolvedValue({ id: 'cust-a', taxExempt: false } as any)
    vi.mocked(db.serviceRecord.create).mockResolvedValue({
      id: 'sr-draft',
      invoiceNumber: '2026-1001',
      customerId: 'cust-a',
    } as any)

    const result = await createDraftCounterSale('cust-a')

    expect(result.success).toBe(true)
    expect(vi.mocked(db.serviceRecord.create)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: ORG_A,
          vehicleId: null,
          customerId: 'cust-a',
        }),
      })
    )
  })
})
