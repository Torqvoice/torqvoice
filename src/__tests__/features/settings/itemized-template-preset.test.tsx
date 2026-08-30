/**
 * @vitest-environment node
 *
 * The Itemized preset is the first one that rearranges sections rather than
 * only recoloring them, so two things have to keep holding: a workshop that
 * never picks it sees the parts and labor tables it has always seen, and a
 * workshop that does pick it sees every line once, on one numbered list.
 */
import { describe, it, expect } from 'vitest'
import { renderToBuffer } from '@react-pdf/renderer'
import '@/features/vehicles/Components/invoice-pdf/fonts'
import { InvoicePDF } from '@/features/vehicles/Components/invoice-pdf'
import { QuotePDF } from '@/features/quotes/Components/QuotePDF'
import { templatePresets } from '@/features/settings/Schema/templatePresets'
import { getDefaultInvoiceLayout } from '@/features/settings/Schema/invoiceLayoutSchema'

const itemized = templatePresets.find((p) => p.id === 'itemized')

function visibility(config: { sections: { id: string; visible: boolean }[] }) {
  return Object.fromEntries(config.sections.map((s) => [s.id, s.visible]))
}

const INVOICE_DATA = {
  id: 'svc-itemized',
  title: 'Brakes and coolant',
  description: null,
  type: 'Repair',
  serviceDate: new Date('2026-08-14'),
  shopName: 'Test Workshop',
  techName: 'Sam',
  mileage: 105866,
  diagnosticNotes: null,
  invoiceNotes: null,
  subtotal: 300,
  taxRate: 19,
  taxAmount: 57,
  totalAmount: 357,
  cost: 357,
  invoiceNumber: 'INV-1',
  partItems: [
    {
      partNumber: 'BS-1',
      name: 'Brake disc',
      quantity: 2,
      unit: 'Stk.',
      unitPrice: 50,
      total: 100,
    },
    { partNumber: null, name: 'Shop supplies', quantity: 1, unit: null, unitPrice: 20, total: 20 },
  ],
  laborItems: [
    { description: 'Front brakes replaced', hours: 4, rate: 45, total: 180, pricingType: 'hourly' },
  ],
  customer: {
    name: 'A Customer',
    email: null,
    phone: null,
    address: 'Some Street 1',
    company: null,
    taxId: null,
  },
  vehicle: {
    make: 'BMW',
    model: 'M340d',
    year: 2021,
    vin: 'WBA51DZ050FL79472',
    licensePlate: 'WST-X340',
    mileage: 105866,
    customer: null,
  },
} as never

const QUOTE_DATA = {
  ...(INVOICE_DATA as unknown as Record<string, unknown>),
  quoteNumber: 'Q-1',
  status: 'sent',
  createdAt: new Date('2026-08-14'),
  validUntil: new Date('2026-09-14'),
  notes: null,
  discountType: null,
  discountValue: 0,
  discountAmount: 0,
} as never

describe('itemized template preset', () => {
  it('is not what a workshop gets by default', () => {
    const seen = visibility(getDefaultInvoiceLayout())
    expect(seen.items_table).toBe(false)
    expect(seen.parts_table).toBe(true)
    expect(seen.labor_table).toBe(true)
  })

  it('swaps the two tables for the combined one', () => {
    expect(itemized?.layoutConfig).toBeDefined()
    const seen = visibility(itemized!.layoutConfig!)
    expect(seen.items_table).toBe(true)
    expect(seen.parts_table).toBe(false)
    expect(seen.labor_table).toBe(false)
  })

  it('stands the vehicle opposite the customer', () => {
    const sections = itemized!.layoutConfig!.sections
    expect(sections.find((s) => s.id === 'customer')?.column).toBe('left')
    expect(sections.find((s) => s.id === 'vehicle')?.column).toBe('right')
  })

  it('renders an invoice and a quote through the combined table', async () => {
    const template = {
      primaryColor: itemized!.primaryColor,
      fontFamily: itemized!.fontFamily,
      headerStyle: itemized!.headerStyle,
      layoutConfig: itemized!.layoutConfig,
    }

    const invoice = await renderToBuffer(<InvoicePDF data={INVOICE_DATA} template={template} />)
    expect(invoice.byteLength).toBeGreaterThan(1000)

    const quote = await renderToBuffer(
      <QuotePDF data={QUOTE_DATA} template={template} layoutConfig={itemized!.layoutConfig} />
    )
    expect(quote.byteLength).toBeGreaterThan(1000)
  })
})
