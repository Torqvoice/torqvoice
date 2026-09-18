import { describe, expect, it } from 'vitest'
import { buildInvoicePrintSpec } from '@/features/invoice-designer/Pdf/buildInvoicePrint'
import {
  buildQuotePrintSpec,
  type QuotePrintData,
} from '@/features/invoice-designer/Pdf/buildQuotePrint'
import { buildLayoutFromPreset, layoutPresets } from '@/features/settings/Schema/layoutPresets'
import type { InvoiceData } from '@/features/vehicles/Components/invoice-pdf/types'
import type { DocumentSpec } from '@/features/invoice-designer/Spec/documentSpec'

/**
 * The warranty a customer accepted on the quote is the warranty on the
 * invoice. Both sheets are built from real rows here, so the promise is held
 * where it is made: the words, the units, and the statement that none is
 * included.
 */

const warranty = {
  warrantyStatus: 'included',
  warrantyMonths: 12,
  warrantyMileage: 20000,
  warrantyNotes: 'Wear parts are not covered.',
}

const invoice = {
  id: 'svc_1',
  title: 'Clutch',
  description: null,
  type: 'repair',
  serviceDate: new Date('2026-09-18T10:00:00Z'),
  invoiceDate: new Date('2026-09-18T10:00:00Z'),
  invoiceDueDate: null,
  shopName: 'Oficina Central',
  techName: 'Rui',
  mileage: 120000,
  diagnosticNotes: null,
  invoiceNotes: null,
  subtotal: 900,
  taxRate: 23,
  taxAmount: 207,
  taxInclusive: false,
  taxComponents: null,
  totalAmount: 1107,
  cost: 1107,
  invoiceNumber: 'INV-1',
  discountType: null,
  discountValue: 0,
  discountAmount: 0,
  partItems: [{ partNumber: 'C1', name: 'Clutch kit', quantity: 1, unitPrice: 500, total: 500 }],
  laborItems: [{ description: 'Fit', hours: 4, rate: 100, total: 400 }],
  customFields: [],
  findings: [],
  ...warranty,
  warrantyExpiresAt: new Date('2027-09-18T10:00:00Z'),
  customer: {
    name: 'Marta',
    email: null,
    phone: null,
    address: null,
    company: null,
    customerNumber: null,
  },
  vehicle: {
    make: 'Renault',
    model: 'Clio',
    year: 2019,
    vin: null,
    licensePlate: '12-AB-34',
    mileage: 120000,
    customer: null,
  },
} as unknown as InvoiceData

const quote: QuotePrintData = {
  quoteNumber: 'Q-1',
  title: 'Clutch',
  description: null,
  validUntil: null,
  createdAt: new Date('2026-09-10T10:00:00Z'),
  subtotal: 900,
  taxRate: 23,
  taxAmount: 207,
  taxInclusive: false,
  discountType: null,
  discountValue: 0,
  discountAmount: 0,
  totalAmount: 1107,
  notes: null,
  ...warranty,
  partItems: [{ partNumber: 'C1', name: 'Clutch kit', quantity: 1, unitPrice: 500, total: 500 }],
  laborItems: [{ description: 'Fit', hours: 4, rate: 100, total: 400 }],
  customer: { name: 'Marta', email: null, phone: null, address: null, company: null },
  vehicle: { make: 'Renault', model: 'Clio', year: 2019, vin: null, licensePlate: '12-AB-34' },
}

const labels = {
  warrantyTitle: 'Warranty',
  warrantyDuration: 'Duration',
  warrantyExpires: 'Expires',
  warrantyMonthsUnit: 'months',
  warrantyNotIncluded: 'No workshop warranty is included',
  warrantyStatutoryRights: 'Your statutory rights are not affected.',
  warrantyIncluded: 'Included',
  km: 'km',
  mi: 'mi',
}

function textOf(spec: DocumentSpec): string[] {
  const seen: string[] = []
  const walk = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(walk)
    if (node && typeof node === 'object') {
      for (const [key, value] of Object.entries(node)) {
        if (key === 'text' && typeof value === 'string') seen.push(value)
        else walk(value)
      }
    }
  }
  walk(spec)
  return seen
}

const period = `Duration: 12 months / ${(20000).toLocaleString()} km`

describe('the warranty on a quote and on its invoice', () => {
  it('prints the same period and terms on both', () => {
    const onQuote = textOf(buildQuotePrintSpec({ data: quote, labels, unitSystem: 'metric' }))
    const onInvoice = textOf(
      buildInvoicePrintSpec({
        data: invoice,
        labels,
        invoiceSettings: { currencyCode: 'EUR', unitSystem: 'metric' },
      })
    )
    for (const text of [onQuote, onInvoice]) {
      expect(text).toContain('Warranty')
      expect(text).toContain(period)
      expect(text).toContain('Wear parts are not covered.')
    }
  })

  it('gives the invoice an expiry and the quote none', () => {
    const onQuote = textOf(buildQuotePrintSpec({ data: quote, labels, unitSystem: 'metric' }))
    const onInvoice = textOf(
      buildInvoicePrintSpec({
        data: invoice,
        labels,
        invoiceSettings: { currencyCode: 'EUR', unitSystem: 'metric' },
      })
    )
    expect(onInvoice.some((s) => s.startsWith('Expires: '))).toBe(true)
    // A quote has no date for the work, so nothing for the period to run from.
    expect(onQuote.some((s) => s.startsWith('Expires: '))).toBe(false)
  })

  it("prints the distance limit in the workshop's units, not always km", () => {
    const onInvoice = textOf(
      buildInvoicePrintSpec({
        data: invoice,
        labels,
        invoiceSettings: { currencyCode: 'USD', unitSystem: 'imperial' },
      })
    )
    const onQuote = textOf(buildQuotePrintSpec({ data: quote, labels, unitSystem: 'imperial' }))
    const miles = `Duration: 12 months / ${(20000).toLocaleString()} mi`
    expect(onInvoice).toContain(miles)
    expect(onQuote).toContain(miles)
  })

  it('tells the customer when no warranty is included, and that the law still stands', () => {
    const none = {
      warrantyStatus: 'not_included',
      warrantyMonths: null,
      warrantyMileage: null,
      warrantyNotes: null,
    }
    const onQuote = textOf(buildQuotePrintSpec({ data: { ...quote, ...none }, labels }))
    const onInvoice = textOf(
      buildInvoicePrintSpec({
        data: { ...invoice, ...none, warrantyExpiresAt: null } as InvoiceData,
        labels,
        invoiceSettings: { currencyCode: 'EUR' },
      })
    )
    for (const text of [onQuote, onInvoice]) {
      expect(text).toContain('Warranty')
      expect(text).toContain('No workshop warranty is included')
      expect(text).toContain('Your statutory rights are not affected.')
      expect(text.some((s) => s.startsWith('Duration: '))).toBe(false)
      expect(text.some((s) => s.startsWith('Expires: '))).toBe(false)
    }
  })

  it("prints the workshop's own statement in place of the stock sentence", () => {
    const text = textOf(
      buildQuotePrintSpec({
        data: {
          ...quote,
          warrantyStatus: 'not_included',
          warrantyMonths: null,
          warrantyMileage: null,
          warrantyNotes: 'No workshop warranty on customer-supplied parts.',
        },
        labels,
      })
    )
    expect(text).toContain('No workshop warranty is included')
    expect(text).toContain('No workshop warranty on customer-supplied parts.')
    expect(text).not.toContain('Your statutory rights are not affected.')
  })

  it('leaves the panel off a document that says nothing about warranty', () => {
    const silent = {
      warrantyStatus: null,
      warrantyMonths: null,
      warrantyMileage: null,
      warrantyNotes: null,
    }
    const text = textOf(buildQuotePrintSpec({ data: { ...quote, ...silent }, labels }))
    expect(text).not.toContain('Warranty')
  })

  it('still prints a job saved before the statement existed', () => {
    const text = textOf(
      buildInvoicePrintSpec({
        data: { ...invoice, warrantyStatus: null } as InvoiceData,
        labels,
        invoiceSettings: { currencyCode: 'EUR', unitSystem: 'metric' },
      })
    )
    expect(text).toContain(period)
  })

  it('prints the "not included" statement in every preset that has a warranty section', () => {
    for (const preset of layoutPresets) {
      const text = textOf(
        buildQuotePrintSpec({
          data: { ...quote, warrantyStatus: 'not_included', warrantyNotes: null },
          labels,
          layoutConfig: buildLayoutFromPreset(preset),
        })
      )
      // Compact leaves the section out by design ("nothing optional"), and the
      // designer is the workshop's say over its own sheet. The settings page
      // tells them where to switch it on.
      if (preset.order.includes('warranty')) {
        expect(text, preset.id).toContain('No workshop warranty is included')
      } else {
        expect(text, preset.id).not.toContain('No workshop warranty is included')
      }
    }
    expect(layoutPresets.filter((p) => !p.order.includes('warranty')).map((p) => p.id)).toEqual([
      'compact',
    ])
  })
})
