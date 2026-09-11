import { describe, expect, it } from 'vitest'
import { buildInvoicePrintSpec } from '@/features/invoice-designer/Pdf/buildInvoicePrint'
import { buildQuotePrintSpec } from '@/features/invoice-designer/Pdf/buildQuotePrint'
import { buildLayoutFromPreset, layoutPresets } from '@/features/settings/Schema/layoutPresets'
import type { InvoiceData } from '@/features/vehicles/Components/invoice-pdf/types'
import type { DocumentSpec } from '@/features/invoice-designer/Spec/documentSpec'

/**
 * A Québec invoice: GST and QST each on their own line, each registration
 * number under the business details, and no combined "Tax" line to confuse
 * the two. The same job printed through every template preset, because the
 * totals box is laid out per preset and a second tax row must fit them all.
 */

const components = [
  { name: 'GST', rate: 5, amount: 45, registrationNumber: '123456789 RT0001' },
  { name: 'QST', rate: 9.975, amount: 89.78, registrationNumber: '1234567890 TQ0001' },
]

const invoice: InvoiceData = {
  id: 'svc_1',
  title: 'Brakes',
  description: null,
  type: 'repair',
  serviceDate: new Date('2026-09-10'),
  invoiceDate: new Date('2026-09-10'),
  invoiceDueDate: new Date('2026-09-24'),
  shopName: 'Garage Tremblay',
  techName: 'Jamie',
  mileage: 1000,
  diagnosticNotes: null,
  invoiceNotes: null,
  subtotal: 900,
  taxRate: 14.975,
  taxAmount: 134.78,
  taxInclusive: false,
  taxComponents: components,
  totalAmount: 1034.78,
  cost: 1034.78,
  invoiceNumber: 'INV-1',
  discountType: null,
  discountValue: 0,
  discountAmount: 0,
  partItems: [{ partNumber: 'P1', name: 'Pads', quantity: 2, unitPrice: 150, total: 300 }],
  laborItems: [{ description: 'Fit', hours: 1.5, rate: 400, total: 600 }],
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
  tax: 'Tax ({rate}%)',
  taxIncluded: 'Includes tax ({rate}%)',
  taxIncludedNamed: 'Includes {name} ({rate}%)',
  taxRegistrationLabel: '{name} No.',
  orgNumberLabel: 'Org. Number',
  total: 'Total',
}

function totalsOf(spec: DocumentSpec): string[] {
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

describe('an invoice with a split tax', () => {
  it('prints one line per tax and no combined tax line', () => {
    const text = totalsOf(
      buildInvoicePrintSpec({
        data: invoice,
        labels,
        invoiceSettings: { currencyCode: 'CAD', currencyFormat: 'code' },
      })
    )
    expect(text).toContain('GST (5%)')
    expect(text).toContain('QST (9.975%)')
    expect(text.some((s) => /^Tax \(/.test(s))).toBe(false)
    expect(text.find((s) => s.includes('45.00'))).toBeTruthy()
    expect(text.find((s) => s.includes('89.78'))).toBeTruthy()
    expect(text.find((s) => s.includes('1,034.78'))).toBeTruthy()
  })

  it('prints each registration number under the business details', () => {
    const text = totalsOf(
      buildInvoicePrintSpec({
        data: invoice,
        labels,
        invoiceSettings: { currencyCode: 'CAD', orgNumber: 'NEQ 1234567890' },
      })
    )
    expect(text).toContain('GST No.')
    expect(text).toContain('123456789 RT0001')
    expect(text).toContain('QST No.')
    expect(text).toContain('1234567890 TQ0001')
    expect(text).toContain('NEQ 1234567890')
  })

  it('names the tax in each line when lines are printed with tax in them', () => {
    const text = totalsOf(
      buildInvoicePrintSpec({
        data: invoice,
        labels,
        invoiceSettings: { currencyCode: 'CAD', lineItemsInclTax: true },
      })
    )
    expect(text).toContain('Includes GST (5%)')
    expect(text).toContain('Includes QST (9.975%)')
  })

  it('prints a single-rate invoice exactly as before', () => {
    const text = totalsOf(
      buildInvoicePrintSpec({
        data: { ...invoice, taxComponents: null, taxRate: 25, taxAmount: 225, totalAmount: 1125 },
        labels,
        invoiceSettings: { currencyCode: 'CAD' },
      })
    )
    expect(text).toContain('Tax (25%)')
    expect(text.some((s) => s.includes('No.'))).toBe(false)
  })

  it('fits both lines in every template preset', () => {
    for (const preset of layoutPresets) {
      const spec = buildInvoicePrintSpec({
        data: invoice,
        labels,
        invoiceSettings: { currencyCode: 'CAD' },
        template: { ...preset.template, layoutConfig: buildLayoutFromPreset(preset) },
      })
      const text = totalsOf(spec)
      expect(text, preset.id).toContain('GST (5%)')
      expect(text, preset.id).toContain('QST (9.975%)')
    }
  })

  it('does the same on a quote', () => {
    const quote = {
      id: 'q1',
      quoteNumber: 'Q-1',
      title: 'Brakes',
      description: null,
      status: 'sent',
      validUntil: null,
      createdAt: new Date('2026-09-10'),
      subtotal: 900,
      taxRate: 14.975,
      taxAmount: 134.78,
      taxInclusive: false,
      taxComponents: components,
      discountType: null,
      discountValue: 0,
      discountAmount: 0,
      totalAmount: 1034.78,
      partItems: [{ partNumber: 'P1', name: 'Pads', quantity: 2, unitPrice: 150, total: 300 }],
      laborItems: [{ description: 'Fit', hours: 1.5, rate: 400, total: 600 }],
      customer: { name: 'Alex', email: null, phone: null, address: null },
      vehicle: { make: 'Volvo', model: 'V60', year: 2021, licensePlate: 'AB 12345', vin: null },
      notes: null,
    }
    const text = totalsOf(
      buildQuotePrintSpec({
        data: quote as unknown as Parameters<typeof buildQuotePrintSpec>[0]['data'],
        labels,
        currencyCode: 'CAD',
      })
    )
    expect(text).toContain('GST (5%)')
    expect(text).toContain('QST (9.975%)')
    expect(text.some((s) => /^Tax \(/.test(s))).toBe(false)
  })
})
