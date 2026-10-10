/**
 * Tests for addQuoteToServiceRecord: a quote put onto a job that already
 * exists instead of raising a second one.
 *
 * Diagnostics come first, so the car usually has a work order by the time the
 * quote is accepted. Adding the quote to it must leave the job's own lines
 * alone, re-total it through the shared path, and refuse any job the quote
 * has no business on: a locked one, another vehicle's, another workshop's.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/cached-session', () => ({
  getCachedSession: vi.fn(),
  getCachedMembership: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

vi.mock('@/lib/db', () => ({
  db: {
    user: { findUnique: vi.fn() },
    appSetting: { findMany: vi.fn() },
    quote: { findFirst: vi.fn() },
    vehicle: { findFirst: vi.fn() },
    inspection: { findFirst: vi.fn() },
    serviceRecord: { findFirst: vi.fn(), findMany: vi.fn() },
    $transaction: vi.fn(),
  },
}))

import { getCachedSession, getCachedMembership } from '@/lib/cached-session'
import { db } from '@/lib/db'
import {
  addQuoteToServiceRecord,
  getQuoteConversionConflicts,
  getWorkOrdersForQuoteConversion,
} from '@/features/quotes/Actions/quoteActions'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'

const ORG = 'org-1'
const USER_ID = 'user-1'
const VEHICLE_ID = 'veh-1'
const QUOTE_ID = 'quote-1'
const JOB_ID = 'sr-1'

function setupAuth() {
  vi.mocked(getCachedSession).mockResolvedValue({
    user: { id: USER_ID, email: 'user@example.com' },
  } as any)
  vi.mocked(getCachedMembership).mockResolvedValue({
    organizationId: ORG,
    role: 'owner',
    roleId: null,
    customRole: null,
  } as any)
  vi.mocked(db.user.findUnique).mockResolvedValue({ isSuperAdmin: false } as any)
}

const baseQuote = {
  id: QUOTE_ID,
  quoteNumber: 'Q-1',
  status: 'accepted',
  title: 'Brake job',
  inspectionId: null,
  tireSetId: null,
  discountAmount: 0,
  taxRate: 25,
  taxInclusive: false,
  taxComponents: null,
  warrantyStatus: null,
  warrantyMonths: null,
  warrantyMileage: null,
  warrantyNotes: null,
  partItems: [
    {
      name: 'Brake pad',
      partNumber: 'BP-1',
      quantity: 2,
      unitPrice: 50,
      total: 100,
      excluded: false,
      inventoryPartId: 'inv-1',
    },
    {
      name: 'Optional wiper',
      quantity: 1,
      unitPrice: 20,
      total: 20,
      excluded: true,
      inventoryPartId: 'inv-9',
    },
  ],
  laborItems: [{ description: 'Fit pads', hours: 1, rate: 80, total: 80, excluded: false }],
  attachments: [],
}

const baseJob = {
  id: JOB_ID,
  organizationId: ORG,
  title: 'Diagnostics',
  invoiceNumber: '1001',
  vehicleId: VEHICLE_ID,
  status: 'in-progress',
  inspectionId: null,
  tireSetId: null,
  discountType: null,
  discountValue: 0,
  subtotal: 250,
  taxRate: 25,
  taxInclusive: false,
  taxComponents: null,
  warrantyStatus: null,
  warrantyMonths: null,
  warrantyMileage: null,
  warrantyNotes: null,
  serviceDate: new Date('2026-10-01T10:00:00Z'),
  sentAt: null,
  manuallyPaid: false,
  totalAmount: 312.5,
  cost: 312.5,
  editUnlockedAt: null,
  payments: [],
}

/**
 * Wires up a quote and the job it is added to. The transaction client keeps
 * the job's lines in memory, so the re-total reads what was really written.
 */
function setup(
  options: { quote?: Record<string, unknown>; job?: Record<string, unknown> | null } = {}
) {
  const job = options.job === null ? null : { ...baseJob, ...options.job }
  vi.mocked(db.quote.findFirst).mockResolvedValue({ ...baseQuote, ...options.quote } as any)
  vi.mocked(db.vehicle.findFirst).mockResolvedValue({ id: VEHICLE_ID } as any)
  vi.mocked(db.serviceRecord.findFirst).mockResolvedValue(job as any)

  const parts: any[] = [{ name: 'Diagnostic fuse', total: 200, serviceRecordId: JOB_ID }]
  const labor: any[] = [{ id: 'l-1', description: 'Diagnostics', total: 50, pricingType: 'hourly' }]
  const sum = (rows: any[]) => ({ _sum: { total: rows.reduce((s, r) => s + r.total, 0) } })

  const recordUpdate = vi.fn().mockResolvedValue({})
  const quoteUpdateMany = vi.fn().mockResolvedValue({ count: 1 })
  const queryRaw = vi.fn().mockResolvedValue([{ quantity: 7 }])
  const stockMovementCreateMany = vi.fn().mockResolvedValue({ count: 1 })
  const partDeleteMany = vi.fn()
  const laborDeleteMany = vi.fn()

  vi.mocked(db.$transaction).mockImplementation(async (fn: any) =>
    fn({
      serviceRecord: {
        findUnique: vi.fn().mockImplementation(async () => ({ ...job, subtotal: 430 })),
        update: recordUpdate,
      },
      servicePart: {
        createMany: vi.fn().mockImplementation(async ({ data }: any) => parts.push(...data)),
        aggregate: vi.fn().mockImplementation(async () => sum(parts)),
        deleteMany: partDeleteMany,
      },
      serviceLabor: {
        createMany: vi.fn().mockImplementation(async ({ data }: any) => labor.push(...data)),
        findMany: vi.fn().mockImplementation(async () => labor),
        aggregate: vi.fn().mockImplementation(async () => sum(labor)),
        deleteMany: laborDeleteMany,
      },
      serviceAttachment: { create: vi.fn() },
      quote: { updateMany: quoteUpdateMany },
      stockMovement: { createMany: stockMovementCreateMany },
      $queryRaw: queryRaw,
    })
  )

  return {
    parts,
    labor,
    recordUpdate,
    quoteUpdateMany,
    queryRaw,
    stockMovementCreateMany,
    partDeleteMany,
    laborDeleteMany,
  }
}

describe('addQuoteToServiceRecord', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupAuth()
    vi.mocked(db.appSetting.findMany).mockResolvedValue([] as any)
    vi.mocked(db.inspection.findFirst).mockResolvedValue(null as any)
  })

  it('appends the included lines and keeps the ones the job had', async () => {
    const { parts, labor, partDeleteMany, laborDeleteMany } = setup()

    const result = await addQuoteToServiceRecord(QUOTE_ID, VEHICLE_ID, JOB_ID)

    expect(result.success).toBe(true)
    expect(parts.map((p) => p.name)).toEqual(['Diagnostic fuse', 'Brake pad'])
    expect(parts[1]).toMatchObject({ inventoryPartId: 'inv-1', serviceRecordId: JOB_ID })
    expect(labor.map((l) => l.description)).toEqual(['Diagnostics', 'Fit pads'])
    expect(labor[1]).toMatchObject({ pricingType: 'hourly', serviceRecordId: JOB_ID })
    expect(partDeleteMany).not.toHaveBeenCalled()
    expect(laborDeleteMany).not.toHaveBeenCalled()
  })

  it('re-totals the job from all of its lines', async () => {
    const { recordUpdate } = setup()

    await addQuoteToServiceRecord(QUOTE_ID, VEHICLE_ID, JOB_ID)

    // 200 + 100 in parts, 50 + 80 in labor, 25% tax on top.
    expect(recordUpdate).toHaveBeenCalledWith({
      where: { id: JOB_ID },
      data: expect.objectContaining({ subtotal: 430, taxAmount: 107.5, totalAmount: 537.5 }),
    })
  })

  it('takes the appended parts out of stock once, as a conversion does', async () => {
    const { queryRaw, stockMovementCreateMany } = setup()

    await addQuoteToServiceRecord(QUOTE_ID, VEHICLE_ID, JOB_ID)

    expect(queryRaw).toHaveBeenCalledTimes(1)
    const [, decrement, partId, orgId] = queryRaw.mock.calls[0]
    expect([decrement, partId, orgId]).toEqual([2, 'inv-1', ORG])
    expect(stockMovementCreateMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          inventoryPartId: 'inv-1',
          delta: -2,
          reason: 'quote_conversion',
          serviceRecordId: JOB_ID,
        }),
      ],
    })
  })

  it('marks the quote converted, pointing at the existing job', async () => {
    const { quoteUpdateMany } = setup()

    const result = await addQuoteToServiceRecord(QUOTE_ID, VEHICLE_ID, JOB_ID)

    expect(quoteUpdateMany).toHaveBeenCalledWith({
      where: { id: QUOTE_ID, organizationId: ORG, status: { not: 'converted' } },
      data: { status: 'converted', convertedToId: JOB_ID },
    })
    expect(result.data).toMatchObject({ id: JOB_ID, vehicleId: VEHICLE_ID })
  })

  it('refuses a locked job', async () => {
    vi.mocked(db.appSetting.findMany).mockResolvedValue([
      { key: SETTING_KEYS.INVOICE_LOCK_ENABLED, value: 'true' },
      { key: SETTING_KEYS.INVOICE_LOCK_TRIGGER, value: 'sent' },
    ] as any)
    setup({ job: { sentAt: new Date('2026-01-01T10:00:00Z') } })

    const result = await addQuoteToServiceRecord(QUOTE_ID, VEHICLE_ID, JOB_ID)

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/locked/)
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it('refuses a job that is already completed', async () => {
    setup({ job: { status: 'completed' } })

    const result = await addQuoteToServiceRecord(QUOTE_ID, VEHICLE_ID, JOB_ID)

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/no longer open/)
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it("refuses another vehicle's job", async () => {
    setup({ job: { vehicleId: 'veh-2' } })

    const result = await addQuoteToServiceRecord(QUOTE_ID, VEHICLE_ID, JOB_ID)

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/different vehicle/)
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it("refuses another organization's job", async () => {
    // The job is looked up by id and organization, so one belonging to
    // another workshop is simply not found.
    setup({ job: null })

    const result = await addQuoteToServiceRecord(QUOTE_ID, VEHICLE_ID, JOB_ID)

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/not found/)
    expect(db.serviceRecord.findFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { id: JOB_ID, organizationId: ORG } })
    )
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it('refuses a quote that was already converted', async () => {
    setup({ quote: { status: 'converted' } })

    const result = await addQuoteToServiceRecord(QUOTE_ID, VEHICLE_ID, JOB_ID)

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/already converted/)
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it("gives the job the quote's inspection when it has none", async () => {
    vi.mocked(db.inspection.findFirst).mockResolvedValue({ id: 'insp-1' } as any)
    const { recordUpdate } = setup({ quote: { inspectionId: 'insp-1' } })

    await addQuoteToServiceRecord(QUOTE_ID, VEHICLE_ID, JOB_ID)

    expect(db.inspection.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'insp-1', organizationId: ORG, vehicleId: VEHICLE_ID },
      })
    )
    expect(recordUpdate).toHaveBeenCalledWith({
      where: { id: JOB_ID },
      data: { inspectionId: 'insp-1' },
    })
  })

  it('never replaces an inspection the job already has', async () => {
    const { recordUpdate } = setup({
      quote: { inspectionId: 'insp-1' },
      job: { inspectionId: 'insp-0' },
    })

    await addQuoteToServiceRecord(QUOTE_ID, VEHICLE_ID, JOB_ID)

    expect(db.inspection.findFirst).not.toHaveBeenCalled()
    for (const [call] of recordUpdate.mock.calls) {
      expect(call.data).not.toHaveProperty('inspectionId')
    }
  })

  it("leaves the link empty when the quote's inspection is for another car", async () => {
    // The lookup is scoped to the vehicle, so it finds nothing.
    const { recordUpdate } = setup({ quote: { inspectionId: 'insp-1' } })

    await addQuoteToServiceRecord(QUOTE_ID, VEHICLE_ID, JOB_ID)

    for (const [call] of recordUpdate.mock.calls) {
      expect(call.data).not.toHaveProperty('inspectionId')
    }
  })

  it('does not put a second shop fee on a job that has one', async () => {
    const { labor } = setup({
      quote: {
        laborItems: [
          ...baseQuote.laborItems,
          {
            description: 'Shop fee',
            hours: 1,
            rate: 10,
            total: 10,
            pricingType: 'shopFee',
            excluded: false,
          },
        ],
      },
    })
    labor.push({ id: 'l-fee', description: 'Shop fee', total: 5, pricingType: 'shopFee' })

    await addQuoteToServiceRecord(QUOTE_ID, VEHICLE_ID, JOB_ID)

    expect(labor.filter((l) => l.pricingType === 'shopFee')).toHaveLength(1)
    expect(labor.map((l) => l.description)).toContain('Fit pads')
  })

  it("carries the quote's discount as the amount it came to", async () => {
    const { recordUpdate } = setup({ quote: { discountType: 'percentage', discountAmount: 18 } })

    await addQuoteToServiceRecord(QUOTE_ID, VEHICLE_ID, JOB_ID)

    expect(recordUpdate).toHaveBeenCalledWith({
      where: { id: JOB_ID },
      data: { discountType: 'fixed', discountValue: 18 },
    })
  })

  it("adds the quote's discount on top of a fixed one the job has", async () => {
    const { recordUpdate } = setup({
      quote: { discountAmount: 18 },
      job: { discountType: 'fixed', discountValue: 10 },
    })

    await addQuoteToServiceRecord(QUOTE_ID, VEHICLE_ID, JOB_ID)

    expect(recordUpdate).toHaveBeenCalledWith({
      where: { id: JOB_ID },
      data: { discountType: 'fixed', discountValue: 28 },
    })
  })

  it('writes the discount amount with the totals, so the stored amount follows the lines', async () => {
    const { recordUpdate } = setup({ job: { discountType: 'fixed', discountValue: 1000 } })

    await addQuoteToServiceRecord(QUOTE_ID, VEHICLE_ID, JOB_ID)

    // 1000 off a 430 subtotal is 430 off, not 1000.
    expect(recordUpdate).toHaveBeenLastCalledWith({
      where: { id: JOB_ID },
      data: expect.objectContaining({ subtotal: 430, discountAmount: 430, totalAmount: 0 }),
    })
  })

  it('asks for the right to change jobs and quotes, not the right to raise a job', async () => {
    setup()
    vi.mocked(getCachedMembership).mockResolvedValue({
      organizationId: ORG,
      role: 'member',
      roleId: 'role-creator',
      customRole: {
        isAdmin: false,
        permissions: [
          { action: 'create', subject: 'services' },
          { action: 'read', subject: 'services' },
          { action: 'read', subject: 'quotes' },
        ],
      },
    } as any)

    const result = await addQuoteToServiceRecord(QUOTE_ID, VEHICLE_ID, JOB_ID)

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/permission/i)
    expect(db.$transaction).not.toHaveBeenCalled()
  })
})

/**
 * Where the quote and the job disagree on a standing answer, the dialog asks
 * and the action does nothing until every question has one.
 */
describe('addQuoteToServiceRecord with conflicts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupAuth()
    vi.mocked(db.appSetting.findMany).mockResolvedValue([] as any)
  })

  const percentJob = { discountType: 'percentage', discountValue: 10 }

  it('names them for the dialog without changing anything', async () => {
    setup({
      quote: { discountAmount: 18, taxRate: 0, warrantyStatus: 'included', warrantyMonths: 12 },
      job: percentJob,
    })

    const result = await getQuoteConversionConflicts(QUOTE_ID, JOB_ID)

    expect(result.success).toBe(true)
    expect(result.data?.map((c) => c.kind)).toEqual(['discount', 'tax', 'warranty'])
    expect(result.data?.[0]).toEqual({
      kind: 'discount',
      job: { percent: 10, amount: 25 },
      quote: { amount: 18 },
    })
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it('refuses to add the quote while a conflict is unanswered', async () => {
    const { quoteUpdateMany } = setup({ quote: { discountAmount: 18 }, job: percentJob })

    const result = await addQuoteToServiceRecord(QUOTE_ID, VEHICLE_ID, JOB_ID)

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/choose what the work order keeps/)
    expect(quoteUpdateMany).not.toHaveBeenCalled()
  })

  it('refuses an answer it does not know', async () => {
    setup({ quote: { discountAmount: 18 }, job: percentJob })

    const result = await addQuoteToServiceRecord(QUOTE_ID, VEHICLE_ID, JOB_ID, {
      discount: 'halve',
    })

    expect(result.success).toBe(false)
    expect(db.quote.findFirst).not.toHaveBeenCalled()
  })

  it("keeps the job's percentage and drops the quote's discount when told to", async () => {
    const { recordUpdate } = setup({ quote: { discountAmount: 18 }, job: percentJob })

    const result = await addQuoteToServiceRecord(QUOTE_ID, VEHICLE_ID, JOB_ID, {
      discount: 'keepJob',
    })

    expect(result.success).toBe(true)
    const discountWrites = recordUpdate.mock.calls.filter(
      ([args]: any[]) => 'discountType' in args.data
    )
    expect(discountWrites).toEqual([])
  })

  it("turns the job's percentage into its amount and adds the quote's when told to", async () => {
    const { recordUpdate } = setup({ quote: { discountAmount: 18 }, job: percentJob })

    await addQuoteToServiceRecord(QUOTE_ID, VEHICLE_ID, JOB_ID, { discount: 'combine' })

    // 10% of the 250 the job stood at, plus the quote's 18.
    expect(recordUpdate).toHaveBeenCalledWith({
      where: { id: JOB_ID },
      data: { discountType: 'fixed', discountValue: 43 },
    })
  })

  it("keeps the job's tax when told to, and the lines come across as quoted", async () => {
    const { recordUpdate, parts } = setup({ quote: { taxRate: 0, taxInclusive: true } })

    const result = await addQuoteToServiceRecord(QUOTE_ID, VEHICLE_ID, JOB_ID, { tax: 'keepJob' })

    expect(result.success).toBe(true)
    expect(parts.map((p) => p.total)).toEqual([200, 100])
    expect(recordUpdate.mock.calls.some(([args]: any[]) => 'taxRate' in args.data)).toBe(false)
  })

  it("switches the job to the quote's tax when told to, before re-totalling", async () => {
    const { recordUpdate } = setup({ quote: { taxRate: 0, taxInclusive: true } })

    await addQuoteToServiceRecord(QUOTE_ID, VEHICLE_ID, JOB_ID, { tax: 'useQuote' })

    const taxWrite = recordUpdate.mock.calls.findIndex(([args]: any[]) => 'taxRate' in args.data)
    const totalsWrite = recordUpdate.mock.calls.findIndex(
      ([args]: any[]) => 'totalAmount' in args.data
    )
    expect(taxWrite).toBeGreaterThanOrEqual(0)
    expect(recordUpdate.mock.calls[taxWrite][0].data).toMatchObject({
      taxRate: 0,
      taxInclusive: true,
    })
    expect(totalsWrite).toBeGreaterThan(taxWrite)
  })

  it("takes the quote's warranty when told to, with its expiry from the job's date", async () => {
    const { recordUpdate } = setup({
      quote: { warrantyStatus: 'included', warrantyMonths: 12, warrantyNotes: 'Parts and labor' },
    })

    await addQuoteToServiceRecord(QUOTE_ID, VEHICLE_ID, JOB_ID, { warranty: 'useQuote' })

    const write = recordUpdate.mock.calls.find(([args]: any[]) => 'warrantyStatus' in args.data)
    expect(write?.[0].data).toMatchObject({
      warrantyStatus: 'included',
      warrantyMonths: 12,
      warrantyMileage: null,
      warrantyNotes: 'Parts and labor',
    })
    expect(write?.[0].data.warrantyExpiresAt).toBeInstanceOf(Date)
    expect(write?.[0].data.warrantyExpiresAt.getUTCFullYear()).toBe(2027)
  })

  it("keeps the job's warranty when told to", async () => {
    const { recordUpdate } = setup({ quote: { warrantyStatus: 'not_included' } })

    const result = await addQuoteToServiceRecord(QUOTE_ID, VEHICLE_ID, JOB_ID, {
      warranty: 'keepJob',
    })

    expect(result.success).toBe(true)
    expect(recordUpdate.mock.calls.some(([args]: any[]) => 'warrantyStatus' in args.data)).toBe(
      false
    )
  })
})

describe('getWorkOrdersForQuoteConversion', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupAuth()
  })

  it("asks for the vehicle's open jobs in this organization and drops locked ones", async () => {
    vi.mocked(db.appSetting.findMany).mockResolvedValue([
      { key: SETTING_KEYS.INVOICE_LOCK_ENABLED, value: 'true' },
      { key: SETTING_KEYS.INVOICE_LOCK_TRIGGER, value: 'sent' },
    ] as any)
    vi.mocked(db.serviceRecord.findMany).mockResolvedValue([
      { ...baseJob, id: 'sr-open' },
      { ...baseJob, id: 'sr-sent', sentAt: new Date('2026-01-01T10:00:00Z') },
    ] as any)

    const result = await getWorkOrdersForQuoteConversion(VEHICLE_ID)

    expect(db.serviceRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: ORG,
          vehicleId: VEHICLE_ID,
          status: { in: ['pending', 'in-progress', 'waiting-parts', 'scheduled'] },
        },
      })
    )
    expect(result.data?.map((r) => r.id)).toEqual(['sr-open'])
  })
})
