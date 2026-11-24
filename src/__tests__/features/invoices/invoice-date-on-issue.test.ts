/**
 * An invoice is dated the day it is issued, on the workshop's calendar.
 *
 * A job opened in September and invoiced in November is a November invoice:
 * that is the date of issue VAT law asks for, and what a customer expects.
 * A date somebody chose by hand is theirs and survives the issue, a sent
 * invoice never changes its date on a re-send, and the deliberate update to
 * today's details moves only a date the app wrote itself.
 *
 * The workshop is in Auckland, thirteen hours ahead of UTC in November, and
 * "now" is a moment that is already the next day there: a stamp on the
 * server's (UTC) calendar would be a day early.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const serviceRecord = { findFirst: vi.fn(), update: vi.fn() }
vi.mock('@/lib/db', () => ({ db: { serviceRecord } }))

const assembleInvoicePrint = vi.fn()
vi.mock('@/features/invoices/Lib/assembleInvoicePrint', () => ({
  assembleInvoicePrint: (...args: unknown[]) => assembleInvoicePrint(...args),
}))
vi.mock('@/features/invoice-designer/Lib/designSnapshots', () => ({
  ensureDesignSnapshot: vi.fn().mockResolvedValue('design-snap'),
  ensureAssetSnapshot: vi.fn().mockResolvedValue('asset-snap'),
}))
vi.mock('@/features/integrations/Lib/events', () => ({ notifyIntegrations: vi.fn() }))

const { issueInvoice, reissueInvoice } = await import('@/features/invoices/Lib/issueInvoice')
const { invoiceDateAtIssue } = await import('@/features/invoices/Lib/issuedInvoice')

const assembly = {
  settingsMap: { 'workshop.timezone': 'Pacific/Auckland' },
  workshop: { name: 'Shop', address: '', phone: '', email: '' },
  invoiceSettings: {},
  serviceType: 'automotive',
  taxLabel: 'GST',
  designSource: { layout: {}, template: {} },
  logoDataUri: undefined,
  signer: { name: '', dataUri: undefined },
  data: { customer: null, vehicle: null, findings: [], customFields: [] },
}

// 12:30 UTC on 17 November is 01:30 on 18 November in Auckland (UTC+13).
const NOW = new Date('2026-11-17T12:30:00Z')
// Midnight starting 18 November in Auckland.
const AUCKLAND_NOV_18 = new Date('2026-11-17T11:00:00Z')
// The day the job was opened, in September (Auckland is UTC+12 then).
const SEPT_OPENED = new Date('2026-09-02T12:00:00Z')

const updateData = () => serviceRecord.update.mock.calls[0]?.[0]?.data

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  serviceRecord.update.mockResolvedValue({})
  assembleInvoicePrint.mockResolvedValue(assembly)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('the first issue', () => {
  it('dates a job opened in September and sent in November to the November day', async () => {
    serviceRecord.findFirst.mockResolvedValue({
      id: 'rec-1',
      issuedAt: null,
      sentAt: null,
      invoiceDate: null,
      serviceDate: SEPT_OPENED,
      issuedData: null,
    })

    expect(await issueInvoice('rec-1', 'org-1', 'sent')).toBe(true)

    const data = updateData()
    expect(data.invoiceDate).toEqual(AUCKLAND_NOV_18)
    expect(data.issuedData.autoInvoiceDate).toBe(AUCKLAND_NOV_18.toISOString())
  })

  it('dates the invoice the day a payment issues it', async () => {
    serviceRecord.findFirst.mockResolvedValue({
      id: 'rec-1',
      issuedAt: null,
      sentAt: null,
      invoiceDate: null,
      issuedData: null,
    })

    await issueInvoice('rec-1', 'org-1', 'paid')

    expect(updateData().invoiceDate).toEqual(AUCKLAND_NOV_18)
  })

  it('keeps a date somebody set by hand', async () => {
    const chosen = new Date('2026-10-31T11:00:00Z')
    serviceRecord.findFirst.mockResolvedValue({
      id: 'rec-1',
      issuedAt: null,
      sentAt: null,
      invoiceDate: chosen,
      issuedData: null,
    })

    await issueInvoice('rec-1', 'org-1', 'sent')

    const data = updateData()
    expect(data).not.toHaveProperty('invoiceDate')
    expect(data.issuedData.autoInvoiceDate).toBeNull()
  })

  it('leaves the date of an invoice the customer already held when freezing it later', async () => {
    serviceRecord.findFirst.mockResolvedValue({
      id: 'rec-1',
      issuedAt: null,
      sentAt: new Date('2026-06-01T09:00:00Z'),
      invoiceDate: null,
      issuedData: null,
    })

    await issueInvoice('rec-1', 'org-1', 'backfill')

    expect(updateData()).not.toHaveProperty('invoiceDate')
  })
})

describe('an invoice already issued', () => {
  it('is untouched when sent again', async () => {
    serviceRecord.findFirst.mockResolvedValue({
      id: 'rec-1',
      issuedAt: new Date('2026-11-01T01:00:00Z'),
      editUnlockedAt: null,
      sentAt: new Date('2026-11-01T01:00:00Z'),
      invoiceDate: new Date('2026-10-31T11:00:00Z'),
      issuedData: { version: 1, autoInvoiceDate: '2026-10-31T11:00:00.000Z' },
    })

    expect(await issueInvoice('rec-1', 'org-1', 'sent')).toBe(false)
    expect(serviceRecord.update).not.toHaveBeenCalled()
  })

  it('keeps its date when an owner unlocks it and sends the corrected copy', async () => {
    serviceRecord.findFirst.mockResolvedValue({
      id: 'rec-1',
      issuedAt: new Date('2026-11-01T01:00:00Z'),
      editUnlockedAt: new Date('2026-11-10T01:00:00Z'),
      sentAt: new Date('2026-11-01T01:00:00Z'),
      invoiceDate: new Date('2026-10-31T11:00:00Z'),
      issuedData: { version: 1, autoInvoiceDate: '2026-10-31T11:00:00.000Z' },
    })

    expect(await issueInvoice('rec-1', 'org-1', 'sent')).toBe(true)

    const data = updateData()
    expect(data).not.toHaveProperty('invoiceDate')
    // Still the app's date, so a later update to today's details may move it.
    expect(data.issuedData.autoInvoiceDate).toBe('2026-10-31T11:00:00.000Z')
  })
})

describe("updating to today's details", () => {
  it('moves a date the last issue wrote to today', async () => {
    serviceRecord.findFirst.mockResolvedValue({
      id: 'rec-1',
      issuedAt: new Date('2026-11-01T01:00:00Z'),
      invoiceDate: new Date('2026-10-31T11:00:00Z'),
      issuedData: { version: 1, autoInvoiceDate: '2026-10-31T11:00:00.000Z' },
    })

    expect(await reissueInvoice('rec-1', 'org-1')).toBe(true)

    const data = updateData()
    expect(data.invoiceDate).toEqual(AUCKLAND_NOV_18)
    expect(data.issuedData.autoInvoiceDate).toBe(AUCKLAND_NOV_18.toISOString())
  })

  it('keeps a date somebody changed after the issue', async () => {
    serviceRecord.findFirst.mockResolvedValue({
      id: 'rec-1',
      issuedAt: new Date('2026-11-01T01:00:00Z'),
      invoiceDate: new Date('2026-10-29T11:00:00Z'),
      issuedData: { version: 1, autoInvoiceDate: '2026-10-31T11:00:00.000Z' },
    })

    await reissueInvoice('rec-1', 'org-1')

    const data = updateData()
    expect(data).not.toHaveProperty('invoiceDate')
    expect(data.issuedData.autoInvoiceDate).toBeNull()
  })

  it('keeps the date of an invoice issued before issuing dated it', async () => {
    // No record of the app having chosen the date: it may be a person's.
    serviceRecord.findFirst.mockResolvedValue({
      id: 'rec-1',
      issuedAt: new Date('2026-09-20T01:00:00Z'),
      invoiceDate: SEPT_OPENED,
      issuedData: { version: 1 },
    })

    await reissueInvoice('rec-1', 'org-1')

    expect(updateData()).not.toHaveProperty('invoiceDate')
  })
})

describe('the stored due date', () => {
  // Midnight starting 2 December in Auckland: 18 November plus 14 days.
  const AUCKLAND_DEC_2 = new Date('2026-12-01T11:00:00Z')
  const withTerms = (dueDays: number) =>
    assembleInvoicePrint.mockResolvedValue({ ...assembly, invoiceSettings: { dueDays } })

  it('falls due by the terms from the November issue day of a September job', async () => {
    withTerms(14)
    serviceRecord.findFirst.mockResolvedValue({
      id: 'rec-1',
      issuedAt: null,
      sentAt: null,
      invoiceDate: null,
      invoiceDueDate: null,
      serviceDate: SEPT_OPENED,
      issuedData: null,
    })

    await issueInvoice('rec-1', 'org-1', 'sent')

    const data = updateData()
    expect(data.invoiceDate).toEqual(AUCKLAND_NOV_18)
    expect(data.invoiceDueDate).toEqual(AUCKLAND_DEC_2)
    expect(data.issuedData.autoInvoiceDueDate).toBe(AUCKLAND_DEC_2.toISOString())
  })

  it('keeps a due date somebody set', async () => {
    withTerms(14)
    serviceRecord.findFirst.mockResolvedValue({
      id: 'rec-1',
      issuedAt: null,
      sentAt: null,
      invoiceDate: null,
      invoiceDueDate: new Date('2026-11-30T11:00:00Z'),
      issuedData: null,
    })

    await issueInvoice('rec-1', 'org-1', 'sent')

    const data = updateData()
    expect(data).not.toHaveProperty('invoiceDueDate')
    expect(data.issuedData.autoInvoiceDueDate).toBeNull()
  })

  it('writes no due date when the workshop has no payment terms', async () => {
    withTerms(0)
    serviceRecord.findFirst.mockResolvedValue({
      id: 'rec-1',
      issuedAt: null,
      sentAt: null,
      invoiceDate: null,
      invoiceDueDate: null,
      issuedData: null,
    })

    await issueInvoice('rec-1', 'org-1', 'sent')

    expect(updateData()).not.toHaveProperty('invoiceDueDate')
  })

  it('writes no due date on the freeze of an invoice the customer already held', async () => {
    withTerms(14)
    serviceRecord.findFirst.mockResolvedValue({
      id: 'rec-1',
      issuedAt: null,
      sentAt: new Date('2026-06-01T09:00:00Z'),
      invoiceDate: new Date('2026-05-31T12:00:00Z'),
      invoiceDueDate: null,
      issuedData: null,
    })

    await issueInvoice('rec-1', 'org-1', 'backfill')

    expect(updateData()).not.toHaveProperty('invoiceDueDate')
  })

  it("moves the app's due date on an update to today's details", async () => {
    withTerms(14)
    serviceRecord.findFirst.mockResolvedValue({
      id: 'rec-1',
      issuedAt: new Date('2026-11-01T01:00:00Z'),
      invoiceDate: new Date('2026-10-31T11:00:00Z'),
      invoiceDueDate: new Date('2026-11-14T11:00:00Z'),
      issuedData: {
        version: 1,
        autoInvoiceDate: '2026-10-31T11:00:00.000Z',
        autoInvoiceDueDate: '2026-11-14T11:00:00.000Z',
      },
    })

    await reissueInvoice('rec-1', 'org-1')

    const data = updateData()
    expect(data.invoiceDate).toEqual(AUCKLAND_NOV_18)
    expect(data.invoiceDueDate).toEqual(AUCKLAND_DEC_2)
  })

  it("keeps a hand-set due date on an update to today's details", async () => {
    withTerms(14)
    serviceRecord.findFirst.mockResolvedValue({
      id: 'rec-1',
      issuedAt: new Date('2026-11-01T01:00:00Z'),
      invoiceDate: new Date('2026-10-31T11:00:00Z'),
      invoiceDueDate: new Date('2026-12-24T11:00:00Z'),
      issuedData: {
        version: 1,
        autoInvoiceDate: '2026-10-31T11:00:00.000Z',
        autoInvoiceDueDate: '2026-11-14T11:00:00.000Z',
      },
    })

    await reissueInvoice('rec-1', 'org-1')

    const data = updateData()
    expect(data.invoiceDate).toEqual(AUCKLAND_NOV_18)
    expect(data).not.toHaveProperty('invoiceDueDate')
    expect(data.issuedData.autoInvoiceDueDate).toBeNull()
  })
})

describe('the due date', () => {
  it('falls due by the payment terms counted from the issue day', async () => {
    const { buildInvoicePrintSpec } = await import(
      '@/features/invoice-designer/Pdf/buildInvoicePrint'
    )
    // Issued 18 November in Auckland with 14 days' terms and no due date of
    // its own: due 2 December, not 14 days after the September opening.
    const spec = buildInvoicePrintSpec({
      data: {
        id: 'rec-1',
        title: 'Brakes',
        description: null,
        type: 'repair',
        serviceDate: SEPT_OPENED,
        startDateTime: SEPT_OPENED,
        invoiceDate: AUCKLAND_NOV_18,
        invoiceDueDate: null,
        shopName: 'Shop',
        techName: null,
        mileage: null,
        diagnosticNotes: null,
        invoiceNotes: null,
        subtotal: 100,
        taxRate: 0,
        taxAmount: 0,
        totalAmount: 100,
        cost: 100,
        invoiceNumber: '2026-1001',
        partItems: [],
        laborItems: [{ description: 'Work', hours: 1, rate: 100, total: 100 }],
        customer: null,
        vehicle: null,
      },
      invoiceSettings: { currencyCode: 'NZD', dueDays: 14, timezone: 'Pacific/Auckland' },
    })
    const json = JSON.stringify(spec)
    expect(json).toContain('Nov 18, 2026')
    expect(json).toContain('Dec 2, 2026')
  })
})

describe('invoiceDateAtIssue', () => {
  const today = AUCKLAND_NOV_18

  it('writes today when there is no date', () => {
    expect(invoiceDateAtIssue({ current: null, previousAuto: null, today, redate: false })).toEqual(
      { write: today, auto: today.toISOString() }
    )
  })

  it('never writes over a date that is not the app’s, even on a redate', () => {
    const chosen = new Date('2026-10-01T11:00:00Z')
    expect(
      invoiceDateAtIssue({ current: chosen, previousAuto: null, today, redate: true })
    ).toEqual({ auto: null })
  })
})
