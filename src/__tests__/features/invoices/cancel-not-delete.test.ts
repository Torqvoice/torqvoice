/**
 * An invoice that went out is cancelled, never deleted.
 *
 * Most countries want invoice numbers without gaps, so once the customer
 * holds an invoice (issued, or sent or paid before issuing tracked it) the
 * job is kept, marked cancelled, and keeps its number. A draft nobody ever
 * saw is still deleted. These go through the actions as the page calls them.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/cached-session', () => ({
  getCachedSession: vi.fn(),
  getCachedMembership: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/notification-bus', () => ({ notificationBus: { emit: vi.fn() } }))
vi.mock('@/lib/audit', () => ({
  logAudit: vi.fn(),
  auditDetails: (key: string, params?: unknown) => ({ key, params }),
}))
vi.mock('@/lib/files/collect', () => ({
  serviceRecordFileUrls: vi.fn(async () => []),
  vehicleFileUrls: vi.fn(async () => []),
}))
vi.mock('@/lib/files/manager', () => ({ releaseFiles: vi.fn(async () => ({})) }))
vi.mock('@/features/inventory/Lib/onInventoryChanged', () => ({ onInventoryChanged: vi.fn() }))
vi.mock('@/features/inventory/Lib/reconcileStock', () => ({
  reconcileInventoryForParts: vi.fn(),
}))
vi.mock('@/features/meters/Lib/jobMeterReading.server', () => ({
  unlinkMeterReadingsOfDeletedJobs: vi.fn(),
  unlinkJobMeterReadingsFromOtherVehicles: vi.fn(),
}))
vi.mock('@/features/time-tracking/Lib/timeEntries', () => ({
  stopJobClocks: vi.fn(async () => []),
}))
vi.mock('@/features/invoices/Lib/issueInvoice', () => ({
  issueInvoice: vi.fn(async () => false),
  reissueInvoice: vi.fn(async () => true),
}))
vi.mock('@/features/invoices/Lib/reapplyDesign', () => ({
  ISSUED_WHERE: {},
  issuedDesignState: vi.fn(),
  reapplyDesign: vi.fn(async () => 1),
}))
vi.mock('@/features/custom-fields/Lib/deleteCustomFieldValues', () => ({
  deleteCustomFieldValuesOf: vi.fn(),
  workOrderIdsOfVehicles: vi.fn(async () => ['job-1']),
}))

vi.mock('@/lib/db', () => ({
  db: {
    user: { findUnique: vi.fn() },
    appSetting: { findMany: vi.fn() },
    serviceRecord: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
    },
    vehicle: { findFirst: vi.fn(), deleteMany: vi.fn() },
    servicePart: { findMany: vi.fn() },
    payment: { create: vi.fn(), findFirst: vi.fn(), delete: vi.fn(), aggregate: vi.fn() },
    $queryRaw: vi.fn(),
    workOrderStatus: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  },
}))

import { getCachedMembership, getCachedSession } from '@/lib/cached-session'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'
import {
  deleteServiceRecord,
  updateServiceRecord,
  updateServiceStatus,
} from '@/features/vehicles/Actions/serviceActions'
import { cancelServiceRecord } from '@/features/vehicles/Actions/cancelServiceRecord'
import { deleteVehicle } from '@/features/vehicles/Actions/vehicleActions'
import { toggleManuallyPaid } from '@/features/vehicles/Actions/serviceActions'
import { createPayment, deletePayment } from '@/features/payments/Actions/paymentActions'
import {
  reapplyDesignToInvoice,
  refreshIssuedInvoice,
} from '@/features/invoices/Actions/invoiceDesignActions'
import { setInvoiceEditUnlocked } from '@/features/settings/Actions/documentLockActions'
import { stopJobClocks } from '@/features/time-tracking/Lib/timeEntries'

const ORG = 'org-1'

function signIn(role = 'owner', permissions: { action: string; subject: string }[] = []) {
  vi.mocked(getCachedSession).mockResolvedValue({ user: { id: 'user-1' } } as any)
  vi.mocked(getCachedMembership).mockResolvedValue({
    organizationId: ORG,
    role,
    roleId: role === 'member' ? 'role-1' : null,
    customRole: role === 'member' ? { isAdmin: false, permissions } : null,
  } as any)
  vi.mocked(db.user.findUnique).mockResolvedValue({ isSuperAdmin: false } as any)
}

const JOB = {
  id: 'job-1',
  title: 'Brakes',
  status: 'completed',
  vehicleId: 'veh-1',
  invoiceNumber: '2026-1002',
  issuedAt: null as Date | null,
  sentAt: null as Date | null,
  manuallyPaid: false,
  totalAmount: 1000,
  cost: 0,
  editUnlockedAt: null,
  payments: [] as { amount: number }[],
  vehicle: { id: 'veh-1', make: 'Volvo', model: 'V70', year: 2010, licensePlate: 'AB12345' },
}
const ISSUED_AND_PAID = {
  ...JOB,
  issuedAt: new Date('2026-10-01T10:00:00Z'),
  sentAt: new Date('2026-10-01T10:00:00Z'),
  payments: [{ amount: 400 }, { amount: 600 }],
}
const DRAFT = { ...JOB, invoiceNumber: '2026-1003' }

beforeEach(() => {
  vi.resetAllMocks()
  signIn()
  vi.mocked(db.appSetting.findMany).mockResolvedValue([] as any)
  vi.mocked(db.servicePart.findMany).mockResolvedValue([] as any)
  vi.mocked(db.$transaction).mockImplementation(async (cb: any) => cb(db))
  vi.mocked(db.serviceRecord.updateMany).mockResolvedValue({ count: 1 } as any)
})

describe('deleting a job', () => {
  it('refuses an invoice that was issued, and deletes nothing', async () => {
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue(ISSUED_AND_PAID as any)

    const result = await deleteServiceRecord('job-1')

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/Invoice 2026-1002 has gone out .* cannot be deleted/)
    expect(result.error).toMatch(/Cancel it instead/)
    expect(db.serviceRecord.delete).not.toHaveBeenCalled()
  })

  it('refuses one sent before issuing was tracked', async () => {
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue({
      ...JOB,
      sentAt: new Date('2025-01-01T10:00:00Z'),
    } as any)

    const result = await deleteServiceRecord('job-1')

    expect(result.success).toBe(false)
    expect(db.serviceRecord.delete).not.toHaveBeenCalled()
  })

  it('still deletes a draft that never went out', async () => {
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue(DRAFT as any)

    const result = await deleteServiceRecord('job-1')

    expect(result.success).toBe(true)
    expect(db.serviceRecord.delete).toHaveBeenCalledWith({ where: { id: 'job-1' } })
  })
})

describe('cancelling an invoice that went out', () => {
  it('keeps the job and its number, and marks it cancelled', async () => {
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue(ISSUED_AND_PAID as any)

    const result = await cancelServiceRecord({ recordId: 'job-1' })

    expect(result.success).toBe(true)
    expect(db.serviceRecord.delete).not.toHaveBeenCalled()
    const write = vi.mocked(db.serviceRecord.updateMany).mock.calls[0][0] as any
    expect(write.where).toMatchObject({ id: 'job-1', organizationId: ORG })
    expect(write.data.status).toBe('cancelled')
    // Nothing that names the invoice is touched.
    expect(write.data).not.toHaveProperty('invoiceNumber')
    expect(write.data).not.toHaveProperty('issuedAt')
    expect(db.payment.create).not.toHaveBeenCalled()
  })

  it('records the event in the audit log, which the ledgers listen to', async () => {
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue(ISSUED_AND_PAID as any)

    await cancelServiceRecord({ recordId: 'job-1' })
    await vi.waitFor(() => expect(logAudit).toHaveBeenCalled())

    expect(vi.mocked(logAudit).mock.calls[0][1]).toMatchObject({
      action: 'service.cancel',
      entityId: 'job-1',
      details: { key: 'service_cancel', params: { ref: '2026-1002' } },
    })
  })

  it('books a refund as a negative payment when asked', async () => {
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue(ISSUED_AND_PAID as any)

    const result = await cancelServiceRecord({
      recordId: 'job-1',
      refund: { amount: 1000, method: 'transfer', note: 'Refund on cancelled invoice' },
    })

    expect(result.success).toBe(true)
    expect(db.payment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        serviceRecordId: 'job-1',
        amount: -1000,
        method: 'transfer',
      }),
    })
  })

  it('refuses a refund larger than what was paid, and cancels nothing', async () => {
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue(ISSUED_AND_PAID as any)

    const result = await cancelServiceRecord({
      recordId: 'job-1',
      refund: { amount: 1500, method: 'cash' },
    })

    expect(result.success).toBe(false)
    expect(db.serviceRecord.updateMany).not.toHaveBeenCalled()
    expect(db.payment.create).not.toHaveBeenCalled()
  })

  it('refuses a refund from someone who may not record payments', async () => {
    signIn('member', [{ action: 'delete', subject: 'services' }])
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue(ISSUED_AND_PAID as any)

    const result = await cancelServiceRecord({
      recordId: 'job-1',
      refund: { amount: 100, method: 'cash' },
    })

    expect(result.success).toBe(false)
    expect(db.serviceRecord.updateMany).not.toHaveBeenCalled()
  })

  it('refuses a draft, which is deleted instead', async () => {
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue(DRAFT as any)

    const result = await cancelServiceRecord({ recordId: 'job-1' })

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/never went out/)
    expect(db.serviceRecord.updateMany).not.toHaveBeenCalled()
  })

  it('refuses one already cancelled', async () => {
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue({
      ...ISSUED_AND_PAID,
      status: 'cancelled',
    } as any)

    const result = await cancelServiceRecord({ recordId: 'job-1' })

    expect(result.success).toBe(false)
    expect(db.serviceRecord.updateMany).not.toHaveBeenCalled()
  })

  it('only looks in the caller’s own workshop', async () => {
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue(null)

    const result = await cancelServiceRecord({ recordId: 'theirs' })

    expect(result.success).toBe(false)
    expect(vi.mocked(db.serviceRecord.findFirst).mock.calls[0][0]).toMatchObject({
      where: { id: 'theirs', organizationId: ORG },
    })
  })
})

describe('a cancelled job is final', () => {
  const CANCELLED = { ...ISSUED_AND_PAID, status: 'cancelled' }

  it('refuses a save of the work order', async () => {
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue(CANCELLED as any)

    const result = await updateServiceRecord({ id: 'job-1', title: 'Rewritten' })

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/cancelled/)
    expect(db.serviceRecord.update).not.toHaveBeenCalled()
  })

  it('refuses moving it to another status', async () => {
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue(CANCELLED as any)

    const result = await updateServiceStatus('job-1', 'pending')

    expect(result.success).toBe(false)
    expect(db.serviceRecord.update).not.toHaveBeenCalled()
  })
})

describe('deleting a vehicle', () => {
  it('refuses one whose invoices went out, naming them', async () => {
    vi.mocked(db.vehicle.findFirst).mockResolvedValue({
      year: 2010,
      make: 'Volvo',
      model: 'V70',
      licensePlate: 'AB12345',
    } as any)
    vi.mocked(db.serviceRecord.findMany).mockResolvedValue([
      { invoiceNumber: '2026-1001' },
      { invoiceNumber: '2026-1002' },
    ] as any)

    const result = await deleteVehicle('veh-1')

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/2026-1001, 2026-1002/)
    expect(result.error).toMatch(/Archive the vehicle instead/)
    expect(db.vehicle.deleteMany).not.toHaveBeenCalled()
  })

  it('deletes one with no invoice that went out', async () => {
    vi.mocked(db.vehicle.findFirst).mockResolvedValue({
      year: 2010,
      make: 'Volvo',
      model: 'V70',
      licensePlate: null,
    } as any)
    vi.mocked(db.serviceRecord.findMany).mockResolvedValue([] as any)

    const result = await deleteVehicle('veh-1')

    expect(result.success).toBe(true)
    expect(db.vehicle.deleteMany).toHaveBeenCalledWith({
      where: { id: 'veh-1', organizationId: ORG },
    })
  })
})

describe('cancelling stops the work on the job', () => {
  it('stops every clock still running on it', async () => {
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue(ISSUED_AND_PAID as any)

    expect((await cancelServiceRecord({ recordId: 'job-1' })).success).toBe(true)

    expect(stopJobClocks).toHaveBeenCalledWith({ organizationId: ORG, serviceRecordId: 'job-1' })
  })

  it('stops nothing when the cancel is refused', async () => {
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue(DRAFT as any)

    await cancelServiceRecord({ recordId: 'job-1' })

    expect(stopJobClocks).not.toHaveBeenCalled()
  })
})

describe('a status change on its way when the job is cancelled', () => {
  it('is refused rather than undoing the cancel', async () => {
    // Read before the cancel, written after it: the write finds nothing to move.
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue(ISSUED_AND_PAID as any)
    vi.mocked(db.serviceRecord.updateMany).mockResolvedValue({ count: 0 } as any)

    const result = await updateServiceStatus('job-1', 'pending')

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/cancelled/)
    const write = vi.mocked(db.serviceRecord.updateMany).mock.calls[0][0] as any
    expect(write.where).toMatchObject({ id: 'job-1', status: { not: 'cancelled' } })
  })
})

describe('money on a cancelled invoice', () => {
  const CANCELLED = { ...ISSUED_AND_PAID, status: 'cancelled' }

  it('takes no new payment', async () => {
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue(CANCELLED as any)

    const result = await createPayment({ serviceRecordId: 'job-1', amount: 50, method: 'cash' })

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/cancelled/)
    expect(db.payment.create).not.toHaveBeenCalled()
  })

  it('keeps its payments and refunds: none can be deleted', async () => {
    vi.mocked(db.payment.findFirst).mockResolvedValue({
      id: 'pay-1',
      amount: -1000,
      serviceRecord: { ...CANCELLED, editUnlockedAt: null },
    } as any)

    const result = await deletePayment('pay-1')

    expect(result.success).toBe(false)
    expect(db.payment.delete).not.toHaveBeenCalled()
  })

  it('is not marked paid or unpaid by hand', async () => {
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue(CANCELLED as any)

    const result = await toggleManuallyPaid('job-1')

    expect(result.success).toBe(false)
    expect(db.serviceRecord.update).not.toHaveBeenCalled()
  })

  it('still lets a locked invoice that is not cancelled take a payment', async () => {
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue(ISSUED_AND_PAID as any)
    vi.mocked(db.payment.create).mockResolvedValue({ id: 'pay-2' } as any)
    // The balance is read under the job's row lock: £1,000 with £400 paid.
    vi.mocked((db as any).$queryRaw).mockResolvedValue([{ totalAmount: 1000, cost: 1000 }])
    vi.mocked((db as any).payment.aggregate).mockResolvedValue({ _sum: { amount: 400 } })

    const result = await createPayment({ serviceRecordId: 'job-1', amount: 50, method: 'cash' })

    expect(result.success).toBe(true)
  })
})

describe('the copy of a cancelled invoice', () => {
  const CANCELLED = { ...ISSUED_AND_PAID, status: 'cancelled' }

  it('is not updated to today’s details', async () => {
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue(CANCELLED as any)

    const result = await refreshIssuedInvoice('job-1')

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/cancelled/)
  })

  it('is not given another design', async () => {
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue(CANCELLED as any)

    const result = await reapplyDesignToInvoice('job-1', null)

    expect(result.success).toBe(false)
    expect(db.serviceRecord.update).not.toHaveBeenCalled()
  })

  it('is not reopened for editing', async () => {
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue(CANCELLED as any)

    const result = await setInvoiceEditUnlocked('job-1', true)

    expect(result.success).toBe(false)
    expect(db.serviceRecord.update).not.toHaveBeenCalled()
  })
})
