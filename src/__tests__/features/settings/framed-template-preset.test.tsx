/**
 * @vitest-environment node
 *
 * The Framed preset is the first one that rearranges the sheet rather than only
 * recoloring it, so two things have to keep holding: a workshop that never
 * picks it sees the invoice it has always seen, and a workshop that does pick
 * it gets the banded letterhead, the rail down the left edge, and every line on
 * one numbered list.
 */
import { describe, it, expect } from 'vitest'
import { renderToBuffer } from '@react-pdf/renderer'
import '@/features/vehicles/Components/invoice-pdf/fonts'
import { InvoicePDF } from '@/features/vehicles/Components/invoice-pdf'
import { QuotePDF } from '@/features/quotes/Components/QuotePDF'
import { createStyles, FRAMED } from '@/features/vehicles/Components/invoice-pdf/styles'
import { templatePresets } from '@/features/settings/Schema/templatePresets'
import { getDefaultInvoiceLayout } from '@/features/settings/Schema/invoiceLayoutSchema'

const framed = templatePresets.find((p) => p.id === 'framed')

function visibility(config: { sections: { id: string; visible: boolean }[] }) {
  return Object.fromEntries(config.sections.map((s) => [s.id, s.visible]))
}

const INVOICE_DATA = {
  id: 'svc-framed',
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
    customerNumber: 'C-1044',
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

describe('framed template preset', () => {
  it('is not what a workshop gets by default', () => {
    const seen = visibility(getDefaultInvoiceLayout())
    expect(seen.items_table).toBe(false)
    expect(seen.document_title).toBe(false)
    expect(seen.parts_table).toBe(true)
    expect(seen.labor_table).toBe(true)
  })

  it('swaps the two tables for the combined one and moves the title down', () => {
    expect(framed?.layoutConfig).toBeDefined()
    const seen = visibility(framed!.layoutConfig!)
    expect(seen.items_table).toBe(true)
    expect(seen.document_title).toBe(true)
    expect(seen.parts_table).toBe(false)
    expect(seen.labor_table).toBe(false)
  })

  it('stands the vehicle opposite the customer', () => {
    const sections = framed!.layoutConfig!.sections
    expect(sections.find((s) => s.id === 'customer')?.column).toBe('left')
    expect(sections.find((s) => s.id === 'vehicle')?.column).toBe('right')
  })

  it('draws the rail as the page border, so it repeats on every page', () => {
    const styles = createStyles('#ee7623', 'Helvetica', 'framed')
    expect(styles.page.borderLeftWidth).toBe(FRAMED.railWidth)
    expect(styles.page.borderLeftColor).toBe('#ee7623')
    // The letterhead escapes the padding by exactly this much to reach the
    // sheet edge, so the two numbers must stay in step.
    expect(styles.page.paddingTop).toBe(FRAMED.padTop)
    expect(styles.page.paddingLeft).toBe(FRAMED.padLeft)
  })

  it('leaves every other header style unframed', () => {
    for (const style of ['standard', 'compact', 'modern']) {
      expect(createStyles('#ee7623', 'Helvetica', style).page.borderLeftWidth).toBeUndefined()
    }
  })

  it('renders an invoice and a quote through the framed sheet', async () => {
    const template = {
      primaryColor: framed!.primaryColor,
      fontFamily: framed!.fontFamily,
      headerStyle: framed!.headerStyle,
      layoutConfig: framed!.layoutConfig,
    }

    const invoice = await renderToBuffer(
      <InvoicePDF
        data={INVOICE_DATA}
        template={template}
        workshop={{
          name: 'Test Workshop',
          address: 'Some Street 1',
          phone: '123',
          email: 'a@b.c',
        }}
      />
    )
    expect(invoice.byteLength).toBeGreaterThan(1000)

    const quote = await renderToBuffer(
      <QuotePDF data={QUOTE_DATA} template={template} layoutConfig={framed!.layoutConfig} />
    )
    expect(quote.byteLength).toBeGreaterThan(1000)
  })
})
