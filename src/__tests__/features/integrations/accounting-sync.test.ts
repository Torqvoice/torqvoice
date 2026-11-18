import { describe, expect, it, vi } from 'vitest'

const findRecord = vi.hoisted(() => vi.fn())
vi.mock('@/lib/db', () => ({ db: { serviceRecord: { findFirst: findRecord } } }))

import { issuedAtOf, loadInvoiceForAccounting } from '@/features/integrations/Lib/accounting-sync'

const base = {
  issuedAt: null,
  sentAt: null,
  manuallyPaid: false,
  payments: [] as { date: Date }[],
  invoiceDate: new Date('2026-05-02T00:00:00Z'),
  serviceDate: new Date('2026-05-01T00:00:00Z'),
}

describe('issuedAtOf', () => {
  it('is null for a draft nobody has seen', () => {
    expect(issuedAtOf(base)).toBeNull()
  })

  it('prefers the issue stamp when there is one', () => {
    const issuedAt = new Date('2026-06-01T10:00:00Z')
    const sentAt = new Date('2026-05-20T10:00:00Z')
    expect(issuedAtOf({ ...base, issuedAt, sentAt })).toBe(issuedAt)
  })

  it('counts an invoice sent before stamps existed as issued when it was sent', () => {
    const sentAt = new Date('2026-05-20T10:00:00Z')
    expect(issuedAtOf({ ...base, sentAt })).toBe(sentAt)
  })

  it('dates a paid legacy invoice by its first payment', () => {
    const first = new Date('2026-05-10T00:00:00Z')
    const payments = [{ date: first }, { date: new Date('2026-05-15T00:00:00Z') }]
    expect(issuedAtOf({ ...base, payments })).toBe(first)
  })

  it('dates one marked paid by hand by the sheet, or the work without a sheet date', () => {
    expect(issuedAtOf({ ...base, manuallyPaid: true })).toEqual(base.invoiceDate)
    expect(issuedAtOf({ ...base, manuallyPaid: true, invoiceDate: null })).toEqual(base.serviceDate)
  })
})

describe('loadInvoiceForAccounting', () => {
  const record = {
    id: 'svc1',
    vehicleId: 'veh1',
    title: 'Clutch',
    invoiceNumber: 'INV-1',
    status: 'completed',
    issuedAt: new Date('2026-11-11T00:00:00Z'),
    sentAt: null,
    invoiceDate: new Date('2026-11-11T00:00:00Z'),
    startDateTime: null,
    serviceDate: new Date('2026-11-11T00:00:00Z'),
    invoiceDueDate: null,
    mileage: null,
    invoiceNotes: null as string | null,
    subtotal: 100,
    taxableSubtotal: null,
    discountType: null,
    discountValue: 0,
    discountAmount: 0,
    taxRate: 10,
    taxAmount: 10,
    taxInclusive: false,
    totalAmount: 110,
    cost: 110,
    manuallyPaid: false,
    customer: null,
    vehicle: null,
    laborItems: [],
    partItems: [],
    payments: [],
  }

  it('hands the customer notes over as the text that was typed, not the editor markup', async () => {
    // What the notes editor stores for a single typed line.
    findRecord.mockResolvedValueOnce({
      ...record,
      invoiceNotes: '<p>Clutch is worn &amp; should be replaced.</p><p>Quote to follow.</p>',
    })
    const inv = await loadInvoiceForAccounting('org1', 'svc1')
    expect(inv?.notes).toBe('Clutch is worn & should be replaced.\nQuote to follow.')
  })

  it('has no notes when the editor was left empty', async () => {
    findRecord.mockResolvedValueOnce({ ...record, invoiceNotes: '<p></p>' })
    expect((await loadInvoiceForAccounting('org1', 'svc1'))?.notes).toBeNull()
    findRecord.mockResolvedValueOnce({ ...record, invoiceNotes: null })
    expect((await loadInvoiceForAccounting('org1', 'svc1'))?.notes).toBeNull()
  })
})
