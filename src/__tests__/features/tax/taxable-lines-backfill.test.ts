/**
 * The paths that write a job or re-price one without anyone at an editor:
 * an invoice generated from a recurring template, and the one-off switch of
 * every stored document between tax-exclusive and tax-inclusive prices.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/cached-session', () => ({
  getCachedSession: vi.fn(),
  getCachedMembership: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn() }))
vi.mock('@/lib/workshop-timezone', () => ({ workshopTimeZone: async () => 'UTC' }))
vi.mock('@/lib/document-lock.server', () => ({
  getDocumentLockSettings: vi.fn().mockResolvedValue({}),
}))

vi.mock('@/lib/db', () => ({
  db: {
    user: { findUnique: vi.fn() },
    appSetting: { findMany: vi.fn() },
    recurringInvoice: { findMany: vi.fn() },
    serviceRecord: { findFirst: vi.fn(), findMany: vi.fn() },
    quote: { findMany: vi.fn() },
    $transaction: vi.fn(),
  },
}))

import { processRecurringInvoices } from '@/features/billing/Actions/recurringInvoiceActions'
import {
  convertRecordsToExclusive,
  convertRecordsToInclusive,
} from '@/features/settings/Actions/applyTaxRateToExisting'
import { getCachedMembership, getCachedSession } from '@/lib/cached-session'
import { db } from '@/lib/db'
import { calculateTotals } from '@/lib/tax'

function settings(rows: { key: string; value: string }[]) {
  vi.mocked(db.appSetting.findMany).mockImplementation((async (args: {
    where?: { key?: { in?: string[] } }
  }) => {
    const wanted = args?.where?.key?.in
    return wanted ? rows.filter((r) => wanted.includes(r.key)) : rows
  }) as never)
}

beforeEach(() => {
  vi.resetAllMocks()
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
  vi.mocked(db.serviceRecord.findFirst).mockResolvedValue(null)
  settings([])
})

describe('an invoice generated from a recurring template', () => {
  const template = {
    id: 'ri-1',
    title: 'Fleet service',
    description: null,
    frequency: 'monthly',
    nextRunDate: new Date('2026-10-01T00:00:00Z'),
    endDate: null,
    type: 'maintenance',
    cost: 0,
    taxRate: 8,
    taxInclusive: false,
    taxComponents: null,
    invoiceNotes: null,
    vehicleId: 'veh-1',
    vehicle: { organizationId: 'org-1' },
    templateParts: [{ name: 'Oil', partNumber: null, quantity: 2, unitPrice: 100 }],
    templateLabor: [{ description: 'Service', hours: 3, rate: 100, pricingType: 'hourly' }],
  }

  function generate() {
    vi.mocked(db.recurringInvoice.findMany).mockResolvedValue([template] as never)
    const create = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'sr-1',
      ...data,
    }))
    vi.mocked(db.$transaction).mockImplementation((async (run: (tx: unknown) => unknown) =>
      run({
        serviceRecord: { create },
        recurringInvoice: { update: vi.fn() },
      })) as never)
    return processRecurringInvoices().then((result) => ({
      result,
      data: create.mock.calls[0]?.[0].data as {
        taxAmount: number
        totalAmount: number
        taxableSubtotal: number | null
        partItems: { create: { taxable: boolean }[] }
        laborItems: { create: { taxable: boolean }[] }
      },
    }))
  }

  it('is taxed in full where the workshop taxes everything', async () => {
    const { result, data } = await generate()
    expect(result.success).toBe(true)
    expect(data).toMatchObject({ taxableSubtotal: null, taxAmount: 40, totalAmount: 540 })
    expect(data.partItems.create.map((p) => p.taxable)).toEqual([true])
    expect(data.laborItems.create.map((l) => l.taxable)).toEqual([true])
  })

  it('follows the workshop rule on the day it is generated', async () => {
    settings([
      { key: 'workshop.taxSelective', value: 'true' },
      { key: 'workshop.taxAppliesToLabor', value: 'false' },
    ])
    const { data } = await generate()
    expect(data).toMatchObject({ taxableSubtotal: 200, taxAmount: 16, totalAmount: 516 })
    expect(data.partItems.create.map((p) => p.taxable)).toEqual([true])
    expect(data.laborItems.create.map((l) => l.taxable)).toEqual([false])
  })
})

describe('switching every stored document between tax modes', () => {
  /** A job with 200 of taxed parts, 300 of untaxed labor, 10% off, at 8%. */
  const record = (taxInclusive: boolean) => {
    const parts = taxInclusive ? 216 : 200
    const subtotal = parts + 300
    const discountAmount = subtotal / 10
    return {
      id: 'sr-1',
      subtotal,
      taxableSubtotal: parts,
      discountType: 'percentage',
      discountValue: 10,
      discountAmount,
      taxRate: 8,
      taxComponents: null,
      partItems: [{ id: 'p1', unitPrice: parts, total: parts, taxable: true }],
      laborItems: [{ id: 'l1', rate: 100, total: 300, taxable: false }],
    }
  }

  function run(action: () => Promise<{ success: boolean }>, rows: unknown[]) {
    vi.mocked(db.serviceRecord.findMany).mockResolvedValue(rows as never)
    vi.mocked(db.quote.findMany).mockResolvedValue([] as never)
    const written = {
      record: vi.fn(async () => ({})),
      part: vi.fn(async () => ({})),
      labor: vi.fn(async () => ({})),
    }
    vi.mocked(db.$transaction).mockImplementation((async (go: (tx: unknown) => unknown) =>
      go({
        serviceRecord: { update: written.record },
        servicePart: { update: written.part },
        serviceLabor: { update: written.labor },
        quote: { update: vi.fn() },
        quotePart: { update: vi.fn() },
        quoteLabor: { update: vi.fn() },
      })) as never)
    return action().then((result) => ({ result, written }))
  }

  const totalBefore = (taxInclusive: boolean) => {
    const r = record(taxInclusive)
    return calculateTotals({
      subtotal: r.subtotal,
      discountAmount: r.discountAmount,
      taxRate: 8,
      taxInclusive,
      taxableSubtotal: r.taxableSubtotal,
    })
  }

  it('re-prices the taxed line, leaves the untaxed one, and keeps the total', async () => {
    const { result, written } = await run(convertRecordsToInclusive, [record(false)])
    expect(result.success).toBe(true)

    // The parts gain their tax; the labor is not touched at all.
    expect(written.part).toHaveBeenCalledTimes(1)
    const part = (written.part.mock.calls[0] as unknown as [{ data: { total: number } }])[0]
    expect(part.data.total).toBeCloseTo(216, 10)
    expect(written.labor).not.toHaveBeenCalled()

    const data = (
      written.record.mock.calls[0] as unknown as [{ data: Record<string, number | boolean> }]
    )[0].data
    expect(data.taxInclusive).toBe(true)
    expect(data.subtotal).toBeCloseTo(516, 10)
    expect(data.taxableSubtotal).toBe(216)
    // What the customer pays, and the tax inside it, are where they were.
    const before = totalBefore(false)
    expect(data.totalAmount).toBe(before.totalAmount)
    expect(data.taxAmount).toBe(before.taxAmount)
  })

  it('does the same on the way back', async () => {
    const { written } = await run(convertRecordsToExclusive, [record(true)])
    const part = (written.part.mock.calls[0] as unknown as [{ data: { total: number } }])[0]
    expect(part.data.total).toBeCloseTo(200, 10)
    expect(written.labor).not.toHaveBeenCalled()

    const data = (
      written.record.mock.calls[0] as unknown as [{ data: Record<string, number | boolean> }]
    )[0].data
    expect(data.taxInclusive).toBe(false)
    expect(data.subtotal).toBeCloseTo(500, 10)
    expect(data.taxableSubtotal).toBe(200)
    const before = totalBefore(true)
    expect(data.totalAmount).toBe(before.totalAmount)
    expect(data.taxAmount).toBe(before.taxAmount)
  })

  it('re-prices every line of a fully taxed job, as it always did', async () => {
    const all = {
      ...record(false),
      taxableSubtotal: null,
      laborItems: [{ id: 'l1', rate: 100, total: 300, taxable: true }],
    }
    const { written } = await run(convertRecordsToInclusive, [all])
    expect(written.part).toHaveBeenCalledTimes(1)
    expect(written.labor).toHaveBeenCalledTimes(1)
    const data = (
      written.record.mock.calls[0] as unknown as [{ data: Record<string, number | null> }]
    )[0].data
    expect(data.subtotal).toBe(500 * 1.08)
    expect(data.taxableSubtotal).toBeNull()
  })
})
