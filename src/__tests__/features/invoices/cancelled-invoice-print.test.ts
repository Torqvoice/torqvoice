/**
 * A cancelled invoice prints, shares and shows in the portal as cancelled:
 * the same number and lines, the word itself where the amount due was, and
 * nothing left to pay.
 */
import { describe, expect, it } from 'vitest'
import enPdf from '../../../../messages/en/pdf.json'
import { invoiceLabels } from '@/features/invoice-designer/Lib/invoiceLabels'
import { buildInvoicePrintSpec } from '@/features/invoice-designer/Pdf/buildInvoicePrint'
import type { InvoiceData } from '@/features/vehicles/Components/invoice-pdf/types'
import { portalPayment } from '@/features/portal/Lib/paymentState'
import { invoiceWentOut } from '@/features/invoices/Lib/issuedInvoice'
import { refundableAmount } from '@/features/invoices/Lib/cancelInvoice'

function job(status: string): InvoiceData {
  return {
    id: 'job',
    title: 'Brakes',
    status,
    description: null,
    type: 'repair',
    serviceDate: new Date(Date.UTC(2026, 9, 28, 12)),
    shopName: null,
    techName: null,
    mileage: null,
    diagnosticNotes: null,
    invoiceNotes: null,
    subtotal: 1000,
    taxRate: 0,
    taxAmount: 0,
    totalAmount: 1000,
    cost: 1000,
    invoiceNumber: '2026-1002',
    partItems: [],
    laborItems: [{ description: 'Brake pads', hours: 1, rate: 1000, total: 1000 }],
    vehicle: null,
  }
}

const PAID = {
  totalPaid: 1000,
  payments: [
    { amount: 400, date: '01/10/2026', method: 'card' },
    { amount: 600, date: '02/10/2026', method: 'cash' },
  ],
}

function printed(status: string, paymentSummary = PAID): string {
  return JSON.stringify(
    buildInvoicePrintSpec({
      data: job(status),
      invoiceSettings: { currencyCode: 'EUR', dateFormat: 'dd/MM/yyyy' },
      paymentSummary,
      labels: invoiceLabels(enPdf, 'invoice'),
      locale: 'en',
    })
  )
}

describe('the printed cancelled invoice', () => {
  it('keeps its number and is titled and marked cancelled', () => {
    const text = printed('cancelled')
    expect(text).toContain('2026-1002')
    expect(text).toContain('INVOICE (CANCELLED)')
    expect(text).toContain('"CANCELLED"')
    expect(text).not.toContain('PAID IN FULL')
    expect(text).not.toContain('Amount Due')
  })

  it('lists the refund with the payments', () => {
    const text = printed('cancelled', {
      totalPaid: 0,
      payments: [...PAID.payments, { amount: -1000, date: '03/10/2026', method: 'transfer' }],
    })
    expect(text).toContain('Refund 03/10/2026 (Bank transfer)')
    expect(text).toContain('CANCELLED')
  })

  it('leaves an invoice that is not cancelled as it was', () => {
    const text = printed('completed')
    expect(text).not.toContain('CANCELLED')
    expect(text).toContain('PAID IN FULL')
  })
})

describe('what is owed on a cancelled invoice', () => {
  it('is nothing, in the portal', () => {
    expect(
      portalPayment({ totalAmount: 1000, manuallyPaid: false, payments: [], status: 'cancelled' })
    ).toEqual({ state: 'cancelled', paid: 0, balance: 0 })
  })

  it('is refundable up to what the customer paid', () => {
    const invoice = { totalAmount: 1000, cost: 0, manuallyPaid: false, payments: [{ amount: 400 }] }
    expect(refundableAmount(invoice)).toBe(400)
    expect(refundableAmount({ ...invoice, manuallyPaid: true })).toBe(1000)
    expect(refundableAmount({ ...invoice, payments: [] })).toBe(0)
  })
})

describe('a cancelled invoice that was marked paid by hand', () => {
  const marked = { totalAmount: 1000, cost: 0, manuallyPaid: true }

  it('can refund what was paid, and only what is still held', () => {
    expect(refundableAmount({ ...marked, payments: [] })).toBe(1000)
    expect(refundableAmount({ ...marked, payments: [{ amount: 400 }] })).toBe(1000)
    expect(refundableAmount({ ...marked, payments: [{ amount: -300 }] })).toBe(700)
    expect(refundableAmount({ ...marked, payments: [{ amount: -1000 }] })).toBe(0)
  })

  it('keeps its paid amount in the portal, less any refund, with nothing owed', () => {
    expect(portalPayment({ ...marked, payments: [], status: 'cancelled' })).toEqual({
      state: 'cancelled',
      paid: 1000,
      balance: 0,
    })
    expect(portalPayment({ ...marked, payments: [{ amount: -250 }], status: 'cancelled' })).toEqual(
      { state: 'cancelled', paid: 750, balance: 0 }
    )
  })
})

describe('which invoices went out', () => {
  const draft = { issuedAt: null, sentAt: null, manuallyPaid: false, payments: [] }
  it('is an issued one, or one sent or paid before issuing was tracked', () => {
    expect(invoiceWentOut(draft)).toBe(false)
    expect(invoiceWentOut({ ...draft, issuedAt: new Date() })).toBe(true)
    expect(invoiceWentOut({ ...draft, sentAt: new Date() })).toBe(true)
    expect(invoiceWentOut({ ...draft, payments: [{ amount: 10 }] })).toBe(true)
  })
})
