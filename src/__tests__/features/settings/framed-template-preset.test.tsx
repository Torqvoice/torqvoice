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
import { letterheadMark } from '@/features/vehicles/Components/invoice-pdf/FramedLetterhead'
import { templatePresets } from '@/features/settings/Schema/templatePresets'
import {
  BOXED_ELIGIBLE_SECTIONS,
  getDefaultInvoiceLayout,
  getLetterheadMark,
  invoiceLayoutConfigSchema,
  withLetterheadMark,
} from '@/features/settings/Schema/invoiceLayoutSchema'

const framed = templatePresets.find((p) => p.id === 'framed')

/** The page style, widened past the union createStyles returns per variant. */
function pageStyle(headerStyle: string, background?: string): Record<string, unknown> {
  return createStyles('#ee7623', 'Helvetica', headerStyle, background).page as Record<
    string,
    unknown
  >
}

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
    const page = pageStyle('framed')
    expect(page.borderLeftWidth).toBe(FRAMED.railWidth)
    expect(page.borderLeftColor).toBe('#ee7623')
    // The letterhead escapes the padding by exactly this much to reach the
    // sheet edge, so the two numbers must stay in step.
    expect(page.paddingTop).toBe(FRAMED.padTop)
    expect(page.paddingLeft).toBe(FRAMED.padLeft)
  })

  it('leaves every other header style unframed', () => {
    for (const style of ['standard', 'compact', 'modern']) {
      expect(pageStyle(style).borderLeftWidth).toBeUndefined()
    }
  })

  it('carries one mark on the band, the logo when there is one', () => {
    expect(letterheadMark({ showLogo: true, logoDataUri: 'data:…', showCompanyName: true })).toBe(
      'logo'
    )
    expect(letterheadMark({ showLogo: true, showCompanyName: true })).toBe('name')
    expect(letterheadMark({ showLogo: false, logoDataUri: 'data:…', showCompanyName: true })).toBe(
      'name'
    )
    expect(letterheadMark({ showLogo: true, logoDataUri: 'data:…', showCompanyName: false })).toBe(
      'logo'
    )
    expect(letterheadMark({ showLogo: false, showCompanyName: false })).toBe('none')
  })

  it('lets a workshop put its name on the band instead of its logo', () => {
    const layout = getDefaultInvoiceLayout()
    expect(getLetterheadMark(layout)).toBe('logo')

    const named = withLetterheadMark(layout, 'company_name')
    expect(getLetterheadMark(named)).toBe('company_name')

    // Both fields move together: the band shows one, and leaving the other
    // visible would mislead whoever opens the layout editor next.
    const header = named.sections.find((s) => s.id === 'header')
    expect(header?.fields?.find((f) => f.id === 'logo')?.visible).toBe(false)
    expect(header?.fields?.find((f) => f.id === 'company_name')?.visible).toBe(true)

    expect(getLetterheadMark(withLetterheadMark(named, 'logo'))).toBe('logo')
  })

  it('leaves the footer the one note line it has always been by default', () => {
    const footer = getDefaultInvoiceLayout().sections.find((s) => s.id === 'footer')
    const visible = footer?.fields?.filter((f) => f.visible).map((f) => f.id)
    expect(visible).toEqual(['footer_note'])
  })

  it('moves the company details down to the footer', () => {
    const sections = framed!.layoutConfig!.sections
    const shown = (id: string) =>
      sections
        .find((s) => s.id === id)
        ?.fields?.filter((f) => f.visible)
        .map((f) => f.id) ?? []

    // The letterhead keeps who the shop is; the ways to reach it print along
    // the bottom, the way printed stationery sets them.
    expect(shown('header')).toEqual(['logo', 'company_name', 'company_slogan'])
    expect(shown('footer')).toContain('company_address')
    expect(shown('footer')).toContain('company_phone')
    expect(shown('footer')).toContain('company_email')
    expect(shown('footer')).not.toContain('footer_note')
  })

  it('offers to take the panel off the three detail blocks', () => {
    expect([...BOXED_ELIGIBLE_SECTIONS].sort()).toEqual([
      'customer',
      'general',
      'service',
      'vehicle',
    ])
  })

  it('leaves every section boxed until a layout says otherwise', () => {
    // Unset, not true: that is what every saved layout already holds, and it
    // has to keep reading as boxed.
    for (const section of getDefaultInvoiceLayout().sections) {
      expect(section.boxed).toBeUndefined()
    }

    const parsed = invoiceLayoutConfigSchema.parse({
      sections: [{ id: 'customer', visible: true, order: 0, boxed: false }],
    })
    expect(parsed.sections[0].boxed).toBe(false)
  })

  it('lines the footer up with the content, not the rail', () => {
    const styles = createStyles('#ee7623', 'Helvetica', 'framed')
    // Absolute offsets are measured from inside the page border, so the rail's
    // width is already accounted for.
    expect(styles.footer.left).toBe(FRAMED.padLeft)
  })

  it('leaves the sheet white until a background is asked for', () => {
    expect(pageStyle('framed').backgroundColor).toBeUndefined()
    expect(pageStyle('standard').backgroundColor).toBeUndefined()
    expect(pageStyle('framed', '#f3f4f6').backgroundColor).toBe('#f3f4f6')
    expect(pageStyle('standard', '#f3f4f6').backgroundColor).toBe('#f3f4f6')
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
