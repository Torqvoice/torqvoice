import { describe, expect, it } from 'vitest'
import { buildInvoicePrintSpec } from '@/features/invoice-designer/Pdf/buildInvoicePrint'
import { buildQuotePrintSpec } from '@/features/invoice-designer/Pdf/buildQuotePrint'
import type { InvoiceData } from '@/features/vehicles/Components/invoice-pdf/types'

/** Every string the sheet prints, for looking up an amount or a label. */
function printed(spec: unknown): string {
  return JSON.stringify(spec)
}

const invoice: InvoiceData = {
  id: 'svc_1',
  title: 'Brakes',
  description: null,
  type: 'repair',
  serviceDate: new Date('2026-08-14'),
  invoiceDate: new Date('2026-08-14'),
  invoiceDueDate: new Date('2026-08-24'),
  shopName: 'Testshop',
  techName: 'Jamie',
  mileage: 1000,
  diagnosticNotes: null,
  invoiceNotes: null,
  subtotal: 300,
  taxRate: 25,
  taxAmount: 75,
  totalAmount: 375,
  cost: 375,
  invoiceNumber: 'INV-1',
  discountType: null,
  discountValue: 0,
  discountAmount: 0,
  partItems: [{ partNumber: 'P1', name: 'Pads', quantity: 1, unitPrice: 200, total: 200 }],
  laborItems: [{ description: 'Fit', hours: 1, rate: 100, total: 100 }],
  customFields: [],
  findings: [],
  warrantyMonths: null,
  warrantyMileage: null,
  warrantyExpiresAt: null,
  warrantyNotes: null,
  customer: {
    name: 'Alex',
    email: null,
    phone: null,
    address: null,
    company: null,
    customerNumber: null,
  },
  vehicle: {
    make: 'Volvo',
    model: 'V60',
    year: 2021,
    vin: null,
    licensePlate: 'AB 12345',
    mileage: 1000,
    customer: null,
  },
} as unknown as InvoiceData

const labels = {
  subtotal: 'Subtotal',
  subtotalInclTax: 'Subtotal (incl. tax)',
  tax: 'VAT ({rate}%)',
  taxIncluded: 'Includes VAT ({rate}%)',
  total: 'Total',
}

describe('line prices including tax', () => {
  it('prints prices before tax by default, with the tax added below', () => {
    const out = printed(
      buildInvoicePrintSpec({ data: invoice, labels, invoiceSettings: { currencyCode: 'USD' } })
    )
    expect(out).toContain('$200.00')
    expect(out).toContain('Subtotal')
    expect(out).not.toContain('Subtotal (incl. tax)')
    expect(out).toContain('VAT (25%)')
    expect(out).toContain('$375.00')
  })

  it('prints each line with tax in it when the workshop asks, and says how much is tax', () => {
    const out = printed(
      buildInvoicePrintSpec({
        data: invoice,
        labels,
        invoiceSettings: { currencyCode: 'USD', lineItemsInclTax: true },
      })
    )
    expect(out).toContain('$250.00')
    expect(out).toContain('$125.00')
    expect(out).toContain('Subtotal (incl. tax)')
    expect(out).toContain('$375.00')
    expect(out).toContain('Includes VAT (25%)')
    expect(out).toContain('$75.00')
  })

  it('leaves prices alone when there is no tax', () => {
    const out = printed(
      buildInvoicePrintSpec({
        data: { ...invoice, taxRate: 0, taxAmount: 0, totalAmount: 300, cost: 300 },
        labels,
        invoiceSettings: { currencyCode: 'USD', lineItemsInclTax: true },
      })
    )
    expect(out).toContain('$200.00')
    expect(out).not.toContain('incl. tax')
  })

  it('does the same on a quote', () => {
    const quote = {
      id: 'q1',
      quoteNumber: 'Q-1',
      title: 'Brakes',
      description: null,
      status: 'sent',
      validUntil: null,
      createdAt: new Date('2026-08-14'),
      taxRate: 25,
      taxInclusive: false,
      discountType: null,
      discountValue: 0,
      partItems: [{ partNumber: 'P1', name: 'Pads', quantity: 1, unitPrice: 200, total: 200 }],
      laborItems: [{ description: 'Fit', hours: 1, rate: 100, total: 100 }],
      customer: { name: 'Alex', email: null, phone: null, address: null },
      vehicle: {
        make: 'Volvo',
        model: 'V60',
        year: 2021,
        licensePlate: 'AB 12345',
        vin: null,
        mileage: null,
      },
      notes: null,
    }
    const out = printed(
      buildQuotePrintSpec({
        data: quote as unknown as Parameters<typeof buildQuotePrintSpec>[0]['data'],
        labels,
        currencyCode: 'USD',
        lineItemsInclTax: true,
      })
    )
    expect(out).toContain('$250.00')
    expect(out).toContain('Subtotal (incl. tax)')
    expect(out).toContain('Includes VAT (25%)')
  })
})
