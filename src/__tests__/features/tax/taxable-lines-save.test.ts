/**
 * Saving a work order or a quote whose lines are not all taxed.
 *
 * The editors total a document as it is typed and send their figures with
 * the lines. These tests pin what the server does with them: every stored
 * line carries a plain yes or no, the tax is the server's own whenever a
 * line is left out of it, and a document whose every line is taxed is
 * stored exactly as it was sent, which is how it has always worked.
 *
 * They also pin the update that sends two dates and nothing else, which
 * used to reset the job's status and write its totals as zero.
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
vi.mock('@/lib/resolve-upload-path', () => ({ resolveUploadPath: vi.fn((u: string) => u) }))
vi.mock('@/lib/features', () => ({
  getFeatures: vi.fn().mockResolvedValue({}),
  requireFeature: vi.fn().mockResolvedValue(undefined),
  FeatureGatedError: class FeatureGatedError extends Error {},
}))
vi.mock('@/lib/notification-bus', () => ({ notificationBus: { emit: vi.fn() } }))
vi.mock('@/lib/document-lock.server', () => ({
  assertQuoteEditable: vi.fn().mockResolvedValue(undefined),
  assertInvoiceEditable: vi.fn().mockResolvedValue(undefined),
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
    user: { findUnique: vi.fn() },
    appSetting: { findMany: vi.fn(), updateMany: vi.fn() },
    organization: { findUnique: vi.fn() },
    vehicle: { findFirst: vi.fn(), update: vi.fn() },
    customer: { findFirst: vi.fn() },
    inspection: { findFirst: vi.fn() },
    serviceRecord: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    servicePart: { findMany: vi.fn() },
    serviceLabor: { findMany: vi.fn() },
    quote: { findFirst: vi.fn() },
    quotePart: { findMany: vi.fn() },
    quoteLabor: { findMany: vi.fn() },
    $transaction: vi.fn(),
  },
}))

import { getCachedMembership, getCachedSession } from '@/lib/cached-session'
import { db } from '@/lib/db'
import { createQuote, updateQuote } from '@/features/quotes/Actions/quoteActions'
import {
  createServiceRecord,
  updateServiceRecord,
} from '@/features/vehicles/Actions/serviceActions'

const ORG = 'org-1'

/** Settings for a workshop that taxes parts at 8% and nothing else. */
const PARTS_ONLY = [
  { key: 'workshop.taxEnabled', value: 'true' },
  { key: 'workshop.defaultTaxRate', value: '8' },
  { key: 'workshop.taxSelective', value: 'true' },
  { key: 'workshop.taxAppliesToParts', value: 'true' },
  { key: 'workshop.taxAppliesToLabor', value: 'false' },
  { key: 'workshop.taxAppliesToShopFee', value: 'false' },
]

/** The same three answers with the switch above them off: they decide nothing. */
const SWITCHED_OFF = PARTS_ONLY.map((s) =>
  s.key === 'workshop.taxSelective' ? { ...s, value: 'false' } : s
)

function settings(rows: { key: string; value: string }[]) {
  vi.mocked(db.appSetting.findMany).mockImplementation((async (args: {
    where?: { key?: { in?: string[] } }
  }) => {
    const wanted = args?.where?.key?.in
    return wanted ? rows.filter((r) => wanted.includes(r.key)) : rows
  }) as never)
}

/** A transaction client that records what each table was told to write. */
function transaction(extra: Record<string, unknown> = {}) {
  const written = {
    record: vi.fn(async (args: { data: Record<string, unknown> }) => ({
      id: 'sr-1',
      invoiceNumber: 'INV-1',
      title: 'Job',
      status: 'pending',
      ...args.data,
    })),
    parts: vi.fn().mockResolvedValue({ count: 0 }),
    labor: vi.fn().mockResolvedValue({ count: 0 }),
  }
  const tx = {
    serviceRecord: { create: written.record, update: written.record },
    quote: { create: written.record, update: written.record },
    servicePart: {
      createMany: written.parts,
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    serviceLabor: {
      createMany: written.labor,
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    quotePart: { createMany: written.parts, deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    quoteLabor: { createMany: written.labor, deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    serviceConcern: { createMany: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
    serviceAttachment: { createMany: vi.fn(), deleteMany: vi.fn() },
    inventoryPart: { findFirst: vi.fn().mockResolvedValue(null) },
    ...extra,
  }
  vi.mocked(db.$transaction).mockImplementation((async (fn: (client: typeof tx) => unknown) =>
    fn(tx)) as never)
  return {
    data: () => written.record.mock.calls[0][0].data,
    parts: () =>
      (written.parts.mock.calls[0]?.[0].data ?? []) as { name: string; taxable: boolean }[],
    labor: () =>
      (written.labor.mock.calls[0]?.[0].data ?? []) as {
        description: string
        taxable: boolean
      }[],
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(getCachedSession).mockResolvedValue({
    user: { id: 'user-1', email: 'a@example.com' },
  } as never)
  vi.mocked(getCachedMembership).mockResolvedValue({
    organizationId: ORG,
    role: 'owner',
    roleId: null,
    customRole: null,
  } as never)
  vi.mocked(db.user.findUnique).mockResolvedValue({ isSuperAdmin: false } as never)
  vi.mocked(db.organization.findUnique).mockResolvedValue({ name: 'Shop' } as never)
  vi.mocked(db.vehicle.findFirst).mockResolvedValue({
    id: 'veh-1',
    mileage: 1,
    customer: { taxExempt: false },
  } as never)
  vi.mocked(db.serviceRecord.findFirst).mockResolvedValue(null)
  vi.mocked(db.quote.findFirst).mockResolvedValue(null)
  settings([])
})

const PART = { name: 'Brake pads', quantity: 1, unitPrice: 200, total: 200 }
const LABOR = { description: 'Fit pads', hours: 3, rate: 100, total: 300, pricingType: 'hourly' }
const FEE = { description: 'Shop supplies', hours: 1, rate: 20, total: 20, pricingType: 'shopFee' }

/* -------------------------------------------------------------------------- */

describe('creating a work order', () => {
  it('stores it exactly as sent while every line is taxed', async () => {
    const tx = transaction()
    const result = await createServiceRecord({
      vehicleId: 'veh-1',
      title: 'Brakes',
      partItems: [PART],
      laborItems: [LABOR],
      subtotal: 500,
      taxRate: 8,
      // Deliberately not what the server would compute: with nothing left out
      // of the tax the editor's figures stand, as they always have.
      taxAmount: 40.01,
      totalAmount: 540.01,
    })
    expect(result.success).toBe(true)
    expect(tx.data()).toMatchObject({
      subtotal: 500,
      taxAmount: 40.01,
      totalAmount: 540.01,
      taxableSubtotal: null,
    })
    expect(tx.parts().map((p) => p.taxable)).toEqual([true])
    expect(tx.labor().map((l) => l.taxable)).toEqual([true])
  })

  it('leaves labor and the shop fee out of the tax where the workshop says so', async () => {
    settings(PARTS_ONLY)
    const tx = transaction()
    const result = await createServiceRecord({
      vehicleId: 'veh-1',
      title: 'Brakes',
      partItems: [PART],
      laborItems: [LABOR, FEE],
      subtotal: 520,
      taxRate: 8,
      // What a client that knows nothing of untaxed lines would send.
      taxAmount: 41.6,
      totalAmount: 561.6,
    })
    expect(result.success).toBe(true)
    expect(tx.parts().map((p) => p.taxable)).toEqual([true])
    expect(tx.labor().map((l) => l.taxable)).toEqual([false, false])
    // 8% of the 200 of parts, and nothing else.
    expect(tx.data()).toMatchObject({
      subtotal: 520,
      taxableSubtotal: 200,
      taxAmount: 16,
      totalAmount: 536,
    })
  })

  it('takes a line at its word over the workshop rule', async () => {
    settings(PARTS_ONLY)
    const tx = transaction()
    await createServiceRecord({
      vehicleId: 'veh-1',
      title: 'Brakes',
      // A disposal fee among the parts, untaxed; fabrication labor, taxed.
      partItems: [
        PART,
        { name: 'Disposal', quantity: 1, unitPrice: 10, total: 10, taxable: false },
      ],
      laborItems: [LABOR, { ...LABOR, description: 'Fabrication', total: 100, taxable: true }],
      subtotal: 610,
      taxRate: 8,
      taxAmount: 0,
      totalAmount: 610,
    })
    expect(tx.parts().map((p) => p.taxable)).toEqual([true, false])
    expect(tx.labor().map((l) => l.taxable)).toEqual([false, true])
    // 200 of pads and 100 of fabrication.
    expect(tx.data()).toMatchObject({ taxableSubtotal: 300, taxAmount: 24, totalAmount: 634 })
  })

  it('shares the discount over taxed and untaxed lines', async () => {
    settings(PARTS_ONLY)
    const tx = transaction()
    await createServiceRecord({
      vehicleId: 'veh-1',
      title: 'Brakes',
      partItems: [PART],
      laborItems: [LABOR],
      subtotal: 500,
      discountType: 'percentage',
      discountValue: 10,
      discountAmount: 50,
      taxRate: 8,
      taxAmount: 36,
      totalAmount: 486,
    })
    expect(tx.data()).toMatchObject({ taxableSubtotal: 200, taxAmount: 14.4, totalAmount: 464.4 })
  })

  it('ignores the three answers while the switch above them is off', async () => {
    settings(SWITCHED_OFF)
    const tx = transaction()
    await createServiceRecord({
      vehicleId: 'veh-1',
      title: 'Brakes',
      partItems: [PART],
      laborItems: [LABOR],
      subtotal: 500,
      taxRate: 8,
      taxAmount: 40,
      totalAmount: 540,
    })
    expect(tx.labor().map((l) => l.taxable)).toEqual([true])
    expect(tx.data()).toMatchObject({ taxableSubtotal: null, taxAmount: 40, totalAmount: 540 })
  })

  it('charges an exempt customer nothing, whatever the lines say', async () => {
    settings(PARTS_ONLY)
    vi.mocked(db.vehicle.findFirst).mockResolvedValue({
      id: 'veh-1',
      mileage: 1,
      customer: { taxExempt: true },
    } as never)
    const tx = transaction()
    await createServiceRecord({
      vehicleId: 'veh-1',
      title: 'Brakes',
      partItems: [PART],
      laborItems: [LABOR],
      subtotal: 500,
      taxRate: 8,
      taxAmount: 16,
      totalAmount: 516,
    })
    expect(tx.data()).toMatchObject({ taxRate: 0, taxAmount: 0, totalAmount: 500 })
  })
})

/* -------------------------------------------------------------------------- */

describe('saving an existing work order', () => {
  const existing = {
    id: 'sr-1',
    organizationId: ORG,
    vehicleId: 'veh-1',
    customerId: null,
    title: 'Brakes',
    status: 'completed',
    serviceDate: new Date('2026-01-10'),
    subtotal: 500,
    discountAmount: 0,
    taxRate: 8,
    taxAmount: 16,
    taxInclusive: false,
    taxComponents: null,
    taxableSubtotal: 200,
    totalAmount: 516,
    warrantyStatus: null,
    warrantyMonths: null,
    warrantyMileage: null,
    warrantyNotes: null,
    attachments: [],
    vehicle: { id: 'veh-1', mileage: 50000 },
  }

  beforeEach(() => {
    vi.mocked(db.serviceRecord.findFirst).mockResolvedValue(existing as never)
  })

  it('restates the tax from the lines it is about to store', async () => {
    settings(PARTS_ONLY)
    const tx = transaction()
    const result = await updateServiceRecord({
      id: 'sr-1',
      partItems: [{ ...PART, quantity: 2, total: 400 }],
      laborItems: [LABOR],
      subtotal: 700,
      taxRate: 8,
      // An old tab's arithmetic: tax on everything.
      taxAmount: 56,
      totalAmount: 756,
    })
    expect(result.success).toBe(true)
    expect(tx.parts().map((p) => p.taxable)).toEqual([true])
    expect(tx.labor().map((l) => l.taxable)).toEqual([false])
    expect(tx.data()).toMatchObject({
      subtotal: 700,
      taxableSubtotal: 400,
      taxAmount: 32,
      totalAmount: 732,
    })
  })

  it('keeps a choice made on a line through a save', async () => {
    settings(PARTS_ONLY)
    const tx = transaction()
    await updateServiceRecord({
      id: 'sr-1',
      partItems: [{ ...PART, taxable: false }],
      laborItems: [{ ...LABOR, taxable: true }],
      subtotal: 500,
      taxRate: 8,
      taxAmount: 0,
      totalAmount: 500,
    })
    expect(tx.parts().map((p) => p.taxable)).toEqual([false])
    expect(tx.labor().map((l) => l.taxable)).toEqual([true])
    expect(tx.data()).toMatchObject({ taxableSubtotal: 300, taxAmount: 24, totalAmount: 524 })
  })

  it('reads the lines already on the job when the save sends only a new rate', async () => {
    vi.mocked(db.servicePart.findMany).mockResolvedValue([{ total: 200, taxable: true }] as never)
    vi.mocked(db.serviceLabor.findMany).mockResolvedValue([
      { total: 300, taxable: false, pricingType: 'hourly' },
    ] as never)
    const tx = transaction()
    await updateServiceRecord({ id: 'sr-1', taxRate: 10 })
    expect(tx.data()).toMatchObject({ taxableSubtotal: 200, taxAmount: 20, totalAmount: 520 })
  })

  it('clears the taxable subtotal once every line is taxed again', async () => {
    const tx = transaction()
    await updateServiceRecord({
      id: 'sr-1',
      partItems: [PART],
      laborItems: [{ ...LABOR, taxable: true }],
      subtotal: 500,
      taxRate: 8,
      taxAmount: 40,
      totalAmount: 540,
    })
    expect(tx.data()).toMatchObject({ taxableSubtotal: null, taxAmount: 40, totalAmount: 540 })
  })

  it('leaves the status, the date and the money alone when only two dates are sent', async () => {
    const tx = transaction()
    const result = await updateServiceRecord({
      id: 'sr-1',
      invoiceDate: '2026-10-13',
      invoiceDueDate: '2026-10-27',
    })
    expect(result.success).toBe(true)
    const data = tx.data()
    expect(data.invoiceDate).toEqual(new Date('2026-10-13T00:00:00.000Z'))
    expect(data.invoiceDueDate).toEqual(new Date('2026-10-27T00:00:00.000Z'))
    // None of these were sent, so none of them may be written. They used to
    // arrive as the create form's defaults: pending, zero, today.
    for (const field of [
      'status',
      'type',
      'cost',
      'subtotal',
      'taxRate',
      'taxAmount',
      'taxInclusive',
      'totalAmount',
      'discountValue',
      'discountAmount',
      'serviceDate',
      'taxableSubtotal',
      'customStatusId',
    ]) {
      expect(data[field], field).toBeUndefined()
    }
    // And the lines were not touched or even read.
    expect(db.servicePart.findMany).not.toHaveBeenCalled()
    expect(tx.parts()).toEqual([])
  })
})

/* -------------------------------------------------------------------------- */

describe('creating a quote', () => {
  it('stores it as sent while every line is taxed', async () => {
    const tx = transaction()
    const result = await createQuote({
      title: 'Brakes',
      partItems: [PART],
      laborItems: [LABOR],
      subtotal: 500,
      taxRate: 8,
      taxAmount: 40,
      totalAmount: 540,
    })
    expect(result.success).toBe(true)
    expect(tx.data()).toMatchObject({ taxableSubtotal: null, taxAmount: 40, totalAmount: 540 })
    expect(tx.labor().map((l) => l.taxable)).toEqual([true])
  })

  it('taxes the parts alone where the workshop says so', async () => {
    settings(PARTS_ONLY)
    const tx = transaction()
    await createQuote({
      title: 'Brakes',
      partItems: [PART],
      laborItems: [LABOR],
      subtotal: 500,
      taxRate: 8,
      taxAmount: 40,
      totalAmount: 540,
    })
    expect(tx.parts().map((p) => p.taxable)).toEqual([true])
    expect(tx.labor().map((l) => l.taxable)).toEqual([false])
    expect(tx.data()).toMatchObject({ taxableSubtotal: 200, taxAmount: 16, totalAmount: 516 })
  })

  it('does not count a line the customer declined toward the tax', async () => {
    settings(PARTS_ONLY)
    const tx = transaction()
    await createQuote({
      title: 'Brakes',
      partItems: [
        PART,
        { name: 'Rotors', quantity: 1, unitPrice: 400, total: 400, excluded: true },
      ],
      laborItems: [LABOR],
      // The subtotal leaves the declined rotors out, as the editor's does.
      subtotal: 500,
      taxRate: 8,
      taxAmount: 0,
      totalAmount: 500,
    })
    expect(tx.data()).toMatchObject({ taxableSubtotal: 200, taxAmount: 16, totalAmount: 516 })
  })
})

describe('saving an existing quote', () => {
  const existing = {
    id: 'q-1',
    organizationId: ORG,
    status: 'draft',
    subtotal: 500,
    discountAmount: 0,
    taxRate: 8,
    taxAmount: 16,
    taxInclusive: false,
    taxComponents: null,
    taxableSubtotal: 200,
    totalAmount: 516,
    warrantyStatus: null,
    warrantyMonths: null,
    warrantyMileage: null,
    warrantyNotes: null,
  }

  beforeEach(() => {
    vi.mocked(db.quote.findFirst).mockResolvedValue(existing as never)
  })

  it('restates the tax from the lines it is about to store', async () => {
    settings(PARTS_ONLY)
    const tx = transaction()
    const result = await updateQuote({
      id: 'q-1',
      title: 'Brakes',
      partItems: [PART, { name: 'Rotors', quantity: 1, unitPrice: 400, total: 400 }],
      laborItems: [LABOR],
      subtotal: 900,
      taxRate: 8,
      taxAmount: 72,
      totalAmount: 972,
    })
    expect(result.success).toBe(true)
    expect(tx.labor().map((l) => l.taxable)).toEqual([false])
    expect(tx.data()).toMatchObject({ taxableSubtotal: 600, taxAmount: 48, totalAmount: 948 })
  })

  it('does not reset the status of a quote it was not told about', async () => {
    vi.mocked(db.quote.findFirst).mockResolvedValue({ ...existing, status: 'accepted' } as never)
    const tx = transaction()
    await updateQuote({ id: 'q-1', title: 'Brakes, front' })
    const data = tx.data()
    expect(data.title).toBe('Brakes, front')
    for (const field of ['status', 'subtotal', 'taxRate', 'taxAmount', 'totalAmount']) {
      expect(data[field], field).toBeUndefined()
    }
  })
})
