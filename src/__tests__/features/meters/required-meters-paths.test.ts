/**
 * Every way a job is finished with asks for the readings the workshop
 * requires, and is refused naming them while one is missing: completing it
 * (the status, the work order's save, a job made completed), and handing its
 * invoice over (email, a texted or WhatsApp link, the share link). Nothing is
 * written, sent or issued when refused. And nothing else is ever asked: an
 * ordinary save, an earlier status, a job already completed, and never
 * money: a payment or a mark of paid is recorded and issues the invoice as
 * it always has, as for the customer's Reference / PO.
 *
 * Which meters are missing is the shared check's own test
 * (required-meters.test.ts); here it answers what a test sets.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const gaps = vi.hoisted(() => ({
  missing: [] as { vehicleMeterId: string; meterTypeId: string; name: string; item: null }[],
}))
vi.mock('@/features/meters/Lib/requiredMeters.server', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/features/meters/Lib/requiredMeters.server')>()
  return {
    ...real,
    missingRequiredMeters: vi.fn(async () => gaps.missing),
    missingRequiredMetersForNewJob: vi.fn(async () => gaps.missing),
    assertRequiredMetersRead: vi.fn(async (_org: string, _job: string, occasion: string) => {
      if (gaps.missing.length > 0) {
        throw await real.requiredMetersRefusal(occasion as 'complete', gaps.missing)
      }
    }),
  }
})

vi.mock('@/lib/cached-session', () => ({
  getCachedSession: vi.fn(),
  getCachedMembership: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn() }))
vi.mock('@/lib/notification-bus', () => ({ notificationBus: { publish: vi.fn(), emit: vi.fn() } }))
vi.mock('@/lib/demo', () => ({ demoGuard: vi.fn() }))
vi.mock('@/lib/workshop-timezone', () => ({ workshopTimeZone: vi.fn(async () => 'UTC') }))
vi.mock('@/lib/features', () => ({
  getFeatures: vi.fn(async () => ({ customFields: true, sms: true })),
  requireFeature: vi.fn(),
  isCloudMode: () => false,
}))
vi.mock('next-intl/server', () => ({
  getTranslations: async (namespace: string) => (key: string, values?: { meters?: string }) =>
    `${namespace}.${key}${values?.meters ? `: ${values.meters}` : ''}`,
}))
vi.mock('@/features/invoices/Lib/issueInvoice', () => ({ issueInvoice: vi.fn() }))
vi.mock('@/features/customer-reference/Lib/invoiceGuard.server', () => ({
  assertInvoiceHasRequiredReference: vi.fn(),
}))
vi.mock('@/features/email/Lib/emailAllowance', () => ({
  requireEmailSending: vi.fn(async () => 'smtp'),
  withPlatformMailAllowance: vi.fn(),
}))
vi.mock('@/features/sms/Lib/deliverSms.server', () => ({ deliverSms: vi.fn() }))
vi.mock('@/lib/sms', () => ({ normalizeOrgPhone: vi.fn(async () => '+4790000000') }))
vi.mock('@/lib/share-token.server', () => ({
  ensureShareToken: vi.fn(async () => 'tok'),
  renewShareLink: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  db: {
    user: { findUnique: vi.fn() },
    appSetting: { findMany: vi.fn(), findFirst: vi.fn() },
    organization: { findUnique: vi.fn() },
    vehicle: { findFirst: vi.fn() },
    customer: { findFirst: vi.fn() },
    serviceRecord: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    servicePart: { findMany: vi.fn() },
    payment: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}))

import { getCachedMembership, getCachedSession } from '@/lib/cached-session'
import { db } from '@/lib/db'
import { issueInvoice } from '@/features/invoices/Lib/issueInvoice'
import { deliverSms } from '@/features/sms/Lib/deliverSms.server'
import {
  assertRequiredMetersRead,
  missingRequiredMetersForNewJob,
} from '@/features/meters/Lib/requiredMeters.server'
import {
  createServiceRecord,
  generatePublicLink,
  toggleManuallyPaid,
  updateServiceRecord,
  updateServiceStatus,
} from '@/features/vehicles/Actions/serviceActions'
import { createPayment } from '@/features/payments/Actions/paymentActions'
import { sendInvoiceEmail } from '@/features/email/Actions/emailActions'
import { sendInvoiceLink } from '@/features/messaging/Actions/sendDocumentLink'
import { sendSmsToCustomer as sendSms } from '@/features/sms/Actions/smsActions'

const ORG = 'org-1'
const PTO = { vehicleMeterId: 'vm-pto', meterTypeId: 't-pto', name: 'PTO hours', item: null }
const CRANE = {
  vehicleMeterId: 'vm-crane',
  meterTypeId: 't-crane',
  name: 'Crane hours',
  item: null,
}

const JOB = {
  id: 'job-1',
  title: 'Service',
  status: 'in-progress',
  vehicleId: 'veh-1',
  customerId: null,
  invoiceNumber: 'WO-1',
  manuallyPaid: false,
  sentAt: null,
  totalAmount: 100,
  cost: 0,
  editUnlockedAt: null,
  payments: [],
  attachments: [],
  vehicle: { id: 'veh-1', customerId: 'c1' },
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(db.serviceRecord.updateMany).mockResolvedValue({ count: 1 } as never)
  gaps.missing = [PTO, CRANE]
  vi.mocked(getCachedSession).mockResolvedValue({ user: { id: 'user-1' } } as never)
  vi.mocked(getCachedMembership).mockResolvedValue({
    organizationId: ORG,
    role: 'owner',
    roleId: null,
    customRole: null,
  } as never)
  vi.mocked(db.user.findUnique).mockResolvedValue({ isSuperAdmin: false } as never)
  vi.mocked(db.appSetting.findMany).mockResolvedValue([] as never)
  vi.mocked(db.serviceRecord.findFirst).mockResolvedValue(JOB as never)
  vi.mocked(db.$transaction).mockImplementation((async (fn: (tx: unknown) => unknown) =>
    fn(db)) as never)
  vi.mocked(db.servicePart.findMany).mockResolvedValue([] as never)
})

const REFUSED = (key: string) => `vehicles.meters.${key}: PTO hours, Crane hours`

/** Refused, naming the meters, with the boxes to mark, and nothing written. */
function expectRefused(
  result: { success: boolean; error?: string; requiredMeters?: unknown },
  key: string
) {
  expect(result.success).toBe(false)
  expect(result.error).toBe(REFUSED(key))
  expect(result.requiredMeters).toEqual([PTO, CRANE])
  expect(db.serviceRecord.update).not.toHaveBeenCalled()
  expect(db.serviceRecord.updateMany).not.toHaveBeenCalled()
  expect(db.serviceRecord.create).not.toHaveBeenCalled()
  expect(db.$transaction).not.toHaveBeenCalled()
  expect(issueInvoice).not.toHaveBeenCalled()
}

describe('completing a job', () => {
  it('from the status bar, the work board list or the invoice-sent prompt is refused, naming the meters', async () => {
    expectRefused(await updateServiceStatus('job-1', 'completed'), 'requiredNotCompleted')
    expect(assertRequiredMetersRead).toHaveBeenCalledWith(ORG, 'job-1', 'complete')
  })

  it('goes through once the readings are there', async () => {
    gaps.missing = []
    const result = await updateServiceStatus('job-1', 'completed')
    expect(result.success).toBe(true)
    expect(db.serviceRecord.updateMany).toHaveBeenCalled()
  })

  it('is never asked of an earlier status', async () => {
    for (const status of ['pending', 'in-progress', 'waiting-parts']) {
      const result = await updateServiceStatus('job-1', status)
      expect(result.success).toBe(true)
    }
    expect(assertRequiredMetersRead).not.toHaveBeenCalled()
  })

  it('is not asked again of a job completed already', async () => {
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue({
      ...JOB,
      status: 'completed',
    } as never)
    const result = await updateServiceStatus('job-1', 'completed')
    expect(result.success).toBe(true)
    expect(assertRequiredMetersRead).not.toHaveBeenCalled()
  })

  it('by the work order’s save is refused whole, naming the meters', async () => {
    expectRefused(
      await updateServiceRecord({ id: 'job-1', title: 'Service', status: 'completed' }),
      'requiredNotCompleted'
    )
    expect(assertRequiredMetersRead).toHaveBeenCalledWith(ORG, 'job-1', 'complete', {
      vehicleId: 'veh-1',
    })
  })

  it('by a save that also moves the job asks about the vehicle it moves to', async () => {
    vi.mocked(db.vehicle.findFirst).mockResolvedValue({ id: 'veh-2' } as never)
    await updateServiceRecord({ id: 'job-1', vehicleId: 'veh-2', status: 'completed' })
    expect(assertRequiredMetersRead).toHaveBeenCalledWith(ORG, 'job-1', 'complete', {
      vehicleId: 'veh-2',
    })
  })

  it('by a save that moves a completed job asks about the vehicle it moves to, and is refused whole', async () => {
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue({
      ...JOB,
      status: 'completed',
    } as never)
    vi.mocked(db.vehicle.findFirst).mockResolvedValue({ id: 'veh-2' } as never)
    // The status the page sends with it, or none at all: completed either way.
    for (const input of [
      { id: 'job-1', vehicleId: 'veh-2', status: 'completed' },
      { id: 'job-1', vehicleId: 'veh-2' },
    ]) {
      // Said as a move: the job stays completed where it is.
      expectRefused(await updateServiceRecord(input), 'requiredNotMoved')
      expect(assertRequiredMetersRead).toHaveBeenLastCalledWith(ORG, 'job-1', 'move', {
        vehicleId: 'veh-2',
      })
    }
  })

  it('never asks a save that moves a job and leaves it short of completed', async () => {
    vi.mocked(db.vehicle.findFirst).mockResolvedValue({ id: 'veh-2' } as never)
    const moved = await updateServiceRecord({ id: 'job-1', vehicleId: 'veh-2', status: 'pending' })
    expect(moved.requiredMeters).toBeUndefined()
    expect(assertRequiredMetersRead).not.toHaveBeenCalled()
  })

  it('never stops an ordinary save, or one that keeps a completed job completed', async () => {
    const plain = await updateServiceRecord({
      id: 'job-1',
      title: 'Service',
      status: 'in-progress',
    })
    expect(plain.requiredMeters).toBeUndefined()
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue({
      ...JOB,
      status: 'completed',
    } as never)
    const kept = await updateServiceRecord({ id: 'job-1', title: 'Service', status: 'completed' })
    expect(kept.requiredMeters).toBeUndefined()
    expect(assertRequiredMetersRead).not.toHaveBeenCalled()
  })

  it('made completed straight away is refused for the vehicle’s required meters', async () => {
    vi.mocked(db.vehicle.findFirst).mockResolvedValue({
      id: 'veh-1',
      mileage: 0,
      customer: { taxExempt: false },
    } as never)
    expectRefused(
      await createServiceRecord({ vehicleId: 'veh-1', title: 'Service', status: 'completed' }),
      'requiredNotCompleted'
    )
    expect(missingRequiredMetersForNewJob).toHaveBeenCalledWith(ORG, 'veh-1')
  })

  it('is never asked of a job made open or booked', async () => {
    vi.mocked(db.vehicle.findFirst).mockResolvedValue({
      id: 'veh-1',
      mileage: 0,
      customer: { taxExempt: false },
    } as never)
    await createServiceRecord({ vehicleId: 'veh-1', title: 'Service', status: 'pending' })
    await createServiceRecord({ vehicleId: 'veh-1', title: 'Service', status: 'scheduled' })
    expect(missingRequiredMetersForNewJob).not.toHaveBeenCalled()
  })
})

describe('handing the invoice over', () => {
  it('by email is refused before anything is issued or sent', async () => {
    expectRefused(
      await sendInvoiceEmail({ serviceRecordId: 'job-1', recipientEmail: 'ola@example.com' }),
      'requiredNotSent'
    )
    expect(assertRequiredMetersRead).toHaveBeenCalledWith(ORG, 'job-1', 'send')
  })

  it('by a texted or WhatsApp link is refused before anything is delivered', async () => {
    expectRefused(
      await sendInvoiceLink({ id: 'job-1', channel: 'sms', to: '+47 900 00 000' }),
      'requiredNotSent'
    )
    expect(deliverSms).not.toHaveBeenCalled()
  })

  it('by a text filed against the invoice is refused before it is delivered', async () => {
    vi.mocked(db.customer.findFirst).mockResolvedValue({
      id: 'c1',
      phone: '+4790000000',
      name: 'Ola',
    } as never)
    expectRefused(
      await sendSms({
        customerId: 'c1',
        body: 'Your invoice',
        relatedEntityType: 'invoice',
        relatedEntityId: 'job-1',
      }),
      'requiredNotSent'
    )
    expect(deliverSms).not.toHaveBeenCalled()
  })

  it('by a share link or pay code is refused before a link exists', async () => {
    expectRefused(await generatePublicLink('job-1'), 'requiredNotShared')
    expect(assertRequiredMetersRead).toHaveBeenCalledWith(ORG, 'job-1', 'share')
  })
})

describe('money, with a required reading missing', () => {
  it('a payment recorded at the desk is taken and issues the invoice as before', async () => {
    vi.mocked(db.payment.create).mockResolvedValue({ id: 'pay-1' } as never)
    const result = await createPayment({
      serviceRecordId: 'job-1',
      amount: 100,
      date: '2026-11-20',
      method: 'cash',
    })
    expect(result.success).toBe(true)
    expect(result.requiredMeters).toBeUndefined()
    expect(db.payment.create).toHaveBeenCalled()
    expect(issueInvoice).toHaveBeenCalledWith('job-1', ORG, 'paid')
    expect(assertRequiredMetersRead).not.toHaveBeenCalled()
  })

  it('marking it paid is taken and issues the invoice as before, and so is taking the mark off', async () => {
    const marked = await toggleManuallyPaid('job-1')
    expect(marked.success).toBe(true)
    expect(marked.data).toMatchObject({ manuallyPaid: true })
    expect(issueInvoice).toHaveBeenCalledWith('job-1', ORG, 'paid')
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue({ ...JOB, manuallyPaid: true } as never)
    expect((await toggleManuallyPaid('job-1')).success).toBe(true)
    expect(assertRequiredMetersRead).not.toHaveBeenCalled()
  })
})
