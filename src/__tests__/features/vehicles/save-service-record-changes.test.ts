/**
 * The two ways a work order's form reaches the server.
 *
 * saveServiceRecordChanges takes only what one tab changed, and none of the
 * money: a tab holding an old copy of the lines would otherwise write totals
 * that belong to them. The totals are worked out on the server from the lines,
 * the discount and the tax as stored once the save is written.
 *
 * updateServiceRecord keeps taking the whole form, money and all: a tab opened
 * before the deploy still calls it that way, and must still save.
 *
 * The job lives in memory here, and both actions write to it through the
 * same transaction calls Prisma would see.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/cached-session', () => ({
  getCachedSession: vi.fn(),
  getCachedMembership: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/workshop-timezone', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/workshop-timezone')>()),
  workshopTimeZone: async () => 'UTC',
}))
vi.mock('@/lib/features', () => ({
  getFeatures: vi.fn().mockResolvedValue({}),
  requireFeature: vi.fn().mockResolvedValue(undefined),
  FeatureGatedError: class FeatureGatedError extends Error {},
}))
vi.mock('@/lib/notification-bus', () => ({ notificationBus: { emit: vi.fn() } }))
vi.mock('@/lib/document-lock.server', () => ({
  assertInvoiceEditable: vi.fn(),
  getDocumentLockSettings: vi.fn().mockResolvedValue({}),
}))
vi.mock('@/features/inventory/Lib/reconcileStock', () => ({
  reconcileInventoryForParts: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/features/inventory/Lib/onInventoryChanged', () => ({
  onInventoryChanged: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/files/manager', () => ({ releaseFiles: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/db', () => ({
  db: {
    $queryRaw: async () => [],
    user: { findUnique: vi.fn() },
    appSetting: { findMany: vi.fn() },
    organization: { findUnique: vi.fn() },
    serviceRecord: { findFirst: vi.fn() },
    servicePart: { findMany: vi.fn() },
    serviceLabor: { findMany: vi.fn() },
    $transaction: vi.fn(),
  },
}))

import { getCachedMembership, getCachedSession } from '@/lib/cached-session'
import { db } from '@/lib/db'
import { assertInvoiceEditable } from '@/lib/document-lock.server'
import { saveServiceRecordChanges } from '@/features/vehicles/Actions/saveServiceRecordChanges'
import { updateServiceRecord } from '@/features/vehicles/Actions/serviceActions'

type Line = { total: number; taxable: boolean; [key: string]: unknown }

let job: Record<string, unknown>
let parts: Line[]
let labor: Line[]

const sum = (rows: Line[], where: { taxable?: boolean }) => ({
  _sum: {
    total: rows
      .filter((row) => where.taxable === undefined || row.taxable === where.taxable)
      .reduce((total, row) => total + row.total, 0),
  },
})

/** Writes what Prisma would be told to, leaving out what the update leaves alone. */
function write(data: Record<string, unknown>) {
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) job[key] = value
  }
  return { ...job }
}

const tx = {
  $queryRaw: async () => [],
  serviceRecord: {
    update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => write(data)),
    findUnique: async () => ({ ...job }),
    findUniqueOrThrow: async () => ({ ...job }),
  },
  servicePart: {
    findMany: async () => parts,
    deleteMany: async () => {
      parts = []
    },
    createMany: async ({ data }: { data: Line[] }) => {
      parts = data
    },
    aggregate: vi.fn(async ({ where }: { where: { taxable?: boolean } }) => sum(parts, where)),
  },
  serviceLabor: {
    findMany: async () => labor,
    deleteMany: async () => {
      labor = []
    },
    createMany: async ({ data }: { data: Line[] }) => {
      labor = data
    },
    aggregate: async ({ where }: { where: { taxable?: boolean } }) => sum(labor, where),
  },
  serviceConcern: { findMany: async () => [] },
  serviceRecordEquipment: { deleteMany: async () => ({ count: 0 }) },
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getCachedSession).mockResolvedValue({
    user: { id: 'user-1', email: 'a@example.com' },
  } as never)
  vi.mocked(getCachedMembership).mockResolvedValue({
    organizationId: 'org-1',
    role: 'owner',
    roleId: null,
    customRole: null,
  } as never)
  vi.mocked(db.user.findUnique).mockResolvedValue({ isSuperAdmin: false } as never)
  vi.mocked(db.appSetting.findMany).mockResolvedValue([])
  vi.mocked(assertInvoiceEditable).mockResolvedValue(undefined as never)
  // A counter sale, so no vehicle reading moves with these saves.
  job = {
    id: 'rec-1',
    organizationId: 'org-1',
    vehicleId: null,
    title: 'ZZ Brakes',
    status: 'in-progress',
    mileage: null,
    diagnosticNotes: '<p>Pads worn</p>',
    invoiceNumber: 'ZZ-1001',
    subtotal: 500,
    discountType: 'none',
    discountValue: 0,
    discountAmount: 0,
    taxRate: 10,
    taxInclusive: false,
    taxComponents: null,
    taxAmount: 50,
    totalAmount: 550,
    cost: 550,
    warrantyStatus: null,
    warrantyMonths: null,
    warrantyMileage: null,
    warrantyNotes: null,
    serviceDate: new Date('2026-11-20T12:00:00Z'),
  }
  parts = [{ name: 'ZZ Pads', quantity: 1, unitPrice: 200, total: 200, taxable: true }]
  labor = [{ description: 'ZZ Fit pads', hours: 3, rate: 100, total: 300, taxable: true }]
  vi.mocked(db.serviceRecord.findFirst).mockImplementation((async () => ({
    ...job,
    attachments: [],
    vehicle: null,
  })) as never)
  vi.mocked(db.$transaction).mockImplementation((async (fn: (client: typeof tx) => unknown) =>
    fn(tx)) as never)
})

describe('saveServiceRecordChanges', () => {
  it('writes the one field sent and leaves every other as stored', async () => {
    const result = await saveServiceRecordChanges({
      id: 'rec-1',
      diagnosticNotes: '<p>Pads worn</p><p>Rattle on the left</p>',
    })
    expect(result.success).toBe(true)
    expect(assertInvoiceEditable).toHaveBeenCalledWith('rec-1', 'org-1')
    expect(job).toMatchObject({
      diagnosticNotes: '<p>Pads worn</p><p>Rattle on the left</p>',
      title: 'ZZ Brakes',
      status: 'in-progress',
      invoiceNumber: 'ZZ-1001',
      totalAmount: 550,
    })
    // Nothing the money is made of moved, so the money is not reckoned again.
    expect(tx.servicePart.aggregate).not.toHaveBeenCalled()
  })

  it('takes no money from the page, and totals a new discount from the stored lines', async () => {
    const result = await saveServiceRecordChanges({
      id: 'rec-1',
      discountType: 'fixed',
      discountValue: 50,
      // What a tab holding an old copy of the lines would have worked out.
      subtotal: 300,
      discountAmount: 50,
      taxAmount: 25,
      totalAmount: 275,
      cost: 275,
    })
    expect(result.success).toBe(true)
    // 500 of lines, 50 off, 10% on the 450: 45, and 495 in all.
    expect(job).toMatchObject({
      discountType: 'fixed',
      discountValue: 50,
      subtotal: 500,
      discountAmount: 50,
      taxAmount: 45,
      totalAmount: 495,
      cost: 495,
    })
  })

  it('totals the lines it was sent as they are stored', async () => {
    await saveServiceRecordChanges({
      id: 'rec-1',
      partItems: [{ name: 'ZZ Pads', quantity: 2, unitPrice: 200, total: 400 }],
    })
    expect(job).toMatchObject({ subtotal: 700, taxAmount: 70, totalAmount: 770, cost: 770 })
  })

  it('stores each line to the cent and totals the job from the stored lines', async () => {
    await saveServiceRecordChanges({
      id: 'rec-1',
      // 2.5 h at 19.99, twice: 49.975 each as typed.
      laborItems: [
        { description: 'ZZ Front', hours: 2.5, rate: 19.99, total: 49.975, pricingType: 'hourly' },
        { description: 'ZZ Rear', hours: 2.5, rate: 19.99, total: 49.975, pricingType: 'hourly' },
      ],
    })
    expect(labor.map((line) => line.total)).toEqual([49.98, 49.98])
    // 200 of parts and 99.96 of labour; 10% tax.
    expect(job).toMatchObject({ subtotal: 299.96, taxAmount: 30, totalAmount: 329.96 })
  })

  it('is refused on a cancelled job before anything is written', async () => {
    vi.mocked(assertInvoiceEditable).mockRejectedValue(new Error('This invoice is cancelled.'))
    const result = await saveServiceRecordChanges({ id: 'rec-1', title: 'ZZ Renamed' })
    expect(result.success).toBe(false)
    expect(job.title).toBe('ZZ Brakes')
  })

  it('is refused on a locked invoice before anything is written', async () => {
    vi.mocked(assertInvoiceEditable).mockRejectedValue(new Error('This invoice is locked.'))
    const result = await saveServiceRecordChanges({ id: 'rec-1', diagnosticNotes: 'x' })
    expect(result.success).toBe(false)
    expect(job.diagnosticNotes).toBe('<p>Pads worn</p>')
  })
})

describe('updateServiceRecord, as a tab opened before the deploy calls it', () => {
  it('still saves the whole form, with the money the page worked out', async () => {
    const result = await updateServiceRecord({
      id: 'rec-1',
      vehicleId: null,
      title: 'ZZ Brakes and discs',
      type: 'repair',
      status: 'in-progress',
      cost: 660,
      mileage: null,
      serviceDate: '2026-11-20',
      diagnosticNotes: '<p>Pads worn</p>',
      invoiceNotes: '',
      invoiceNumber: 'ZZ-1001',
      concerns: [],
      partItems: [{ name: 'ZZ Pads', quantity: 1, unitPrice: 200, total: 200 }],
      laborItems: [
        { description: 'ZZ Fit pads', hours: 3, rate: 100, total: 300, pricingType: 'hourly' },
        { description: 'ZZ Discs', hours: 1, rate: 100, total: 100, pricingType: 'hourly' },
      ],
      subtotal: 600,
      taxRate: 10,
      taxInclusive: false,
      taxAmount: 60,
      totalAmount: 660,
      discountType: 'none',
      discountValue: 0,
      discountAmount: 0,
      warrantyStatus: 'none',
      warrantyMonths: 0,
      warrantyMileage: 0,
      warrantyNotes: '',
    })
    expect(result.success).toBe(true)
    expect(job).toMatchObject({
      title: 'ZZ Brakes and discs',
      subtotal: 600,
      taxAmount: 60,
      totalAmount: 660,
      cost: 660,
    })
    expect(labor.map((line) => line.description)).toEqual(['ZZ Fit pads', 'ZZ Discs'])
  })
})
