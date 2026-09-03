/**
 * @vitest-environment node
 *
 * The Document Title switch means what it says: on, the strip prints where the
 * layout puts it, exactly once; off, it does not print. It did not always. The
 * strip carries the number and the dates, so a hidden one used to be drawn
 * anyway, under the header, and switching it off in the designer looked broken
 * because the strip stayed. Layouts saved before the switch was obeyed are read
 * as showing the strip there, so honouring it takes nothing off a sheet that
 * never chose to lose it.
 */
import { describe, expect, it } from 'vitest'
import { buildInvoicePrintSpec } from '@/features/invoice-designer/Pdf/buildInvoicePrint'
import {
  DESIGNER_LAYOUT_VERSION,
  getDefaultInvoiceLayout,
} from '@/features/settings/Schema/invoiceLayoutSchema'
import type { InvoiceData } from '@/features/vehicles/Components/invoice-pdf/types'

const data: InvoiceData = {
  id: 'svc-title',
  title: 'Service',
  description: null,
  type: 'repair',
  serviceDate: new Date('2026-08-14'),
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
  invoiceNumber: 'INV-2026-1001',
  partItems: [],
  laborItems: [{ description: 'Work', hours: 1, rate: 100, total: 100 }],
  customer: null,
  vehicle: null,
}

function specWithTitleVisible(visible: boolean, version = DESIGNER_LAYOUT_VERSION) {
  // A designer-saved layout: an unstamped one keeps the classic letterhead,
  // which carries the title itself and has no separate block to place.
  const layout = { ...getDefaultInvoiceLayout(), version }
  layout.sections = layout.sections.map((s) => (s.id === 'document_title' ? { ...s, visible } : s))
  return buildInvoicePrintSpec({ data, template: { layoutConfig: layout } })
}

describe('document title placement', () => {
  it('prints the block exactly once when it is on', () => {
    const spec = specWithTitleVisible(true)
    const titles = spec.blocks.filter((b) => b.id === 'document_title')
    expect(titles).toHaveLength(1)
    expect(JSON.stringify(titles[0])).toContain('INV-2026-1001')
  })

  it('prints nothing at all when it is off', () => {
    const spec = specWithTitleVisible(false)
    expect(spec.blocks.filter((b) => b.id === 'document_title')).toHaveLength(0)
    expect(JSON.stringify(spec)).not.toContain('INV-2026-1001')
  })

  it('keeps the strip a layout from before the switch was drawing', () => {
    // Version 2 is that era. The strip was drawn under the header however the
    // switch was set, so reading it as off would take the number off paper.
    const spec = specWithTitleVisible(false, 2)
    const header = spec.blocks.find((b) => b.id === 'header')
    const title = spec.blocks.find((b) => b.id === 'document_title')
    expect(header?.placement.mode).toBe('flow')
    expect(title?.placement.mode).toBe('flow')
    if (header?.placement.mode === 'flow' && title?.placement.mode === 'flow') {
      expect(title.placement.order).toBeGreaterThan(header.placement.order)
      const between = spec.blocks.filter(
        (b) =>
          b.placement.mode === 'flow' &&
          header.placement.mode === 'flow' &&
          title.placement.mode === 'flow' &&
          b.placement.order > header.placement.order &&
          b.placement.order < title.placement.order
      )
      expect(between).toHaveLength(0)
    }
  })

  it('leaves a visible title section at its own place in the order', () => {
    const spec = specWithTitleVisible(true)
    const title = spec.blocks.find((b) => b.id === 'document_title')
    expect(title?.placement.mode).toBe('flow')
  })

  it('anchors the framed letterhead onto the band, title in the flow below', () => {
    const layout = getDefaultInvoiceLayout()
    const spec = buildInvoicePrintSpec({
      data,
      template: { headerStyle: 'framed', layoutConfig: layout },
    })
    expect(spec.blocks.find((b) => b.id === 'header')?.placement.mode).toBe('anchored')
    expect(spec.blocks.find((b) => b.id === 'document_title')?.placement.mode).toBe('flow')
  })
})

/**
 * What the strip says is the workshop's to choose. A business that must call
 * the sheet one thing in one country and another elsewhere, or that wants the
 * number without the big word over it, sets that here rather than living with
 * whatever the template prints.
 */
describe('what the title strip shows', () => {
  /** The strip, as JSON, with only `visible` field ids switched on. */
  function stripWith(visible: string[]) {
    const layout = { ...getDefaultInvoiceLayout(), version: DESIGNER_LAYOUT_VERSION }
    layout.sections = layout.sections.map((s) =>
      s.id === 'document_title'
        ? {
            ...s,
            fields: ['title', 'invoice_number', 'customer_number', 'date', 'due_date'].map(
              (id) => ({ id, visible: visible.includes(id) })
            ),
          }
        : s
    )
    const spec = buildInvoicePrintSpec({ data, template: { layoutConfig: layout } })
    return spec.blocks.find((b) => b.id === 'document_title')
  }

  it('drops the big word but keeps the cells beside it', () => {
    const strip = JSON.stringify(stripWith(['invoice_number', 'date']))
    expect(strip).toContain('INV-2026-1001')
    expect(strip).not.toContain('document_title.title')
  })

  it('drops a cell that is switched off', () => {
    const strip = JSON.stringify(stripWith(['title', 'date']))
    expect(strip).not.toContain('INV-2026-1001')
    expect(strip).toContain('document_title.title')
  })

  it('prints no strip at all when everything in it is off', () => {
    expect(stripWith([])).toBeUndefined()
  })
})

/**
 * What a sheet must call itself is local law, not translation: a business
 * registered for GST in Australia heads its invoices "Tax Invoice", and one
 * that is not registered must not. The word is the workshop's to write, and it
 * lives with the design, so a sheet sent before they registered keeps the name
 * it was sent under.
 */
describe('the words the title strip prints', () => {
  /** The strip, as JSON, with `text` set on the Document Title section. */
  function stripNamed(text?: string) {
    const layout = { ...getDefaultInvoiceLayout(), version: DESIGNER_LAYOUT_VERSION }
    layout.sections = layout.sections.map((s) => (s.id === 'document_title' ? { ...s, text } : s))
    const spec = buildInvoicePrintSpec({ data, template: { layoutConfig: layout } })
    return JSON.stringify(spec.blocks.find((b) => b.id === 'document_title'))
  }

  it("prints the workshop's own word for the document", () => {
    expect(stripNamed('Tax Invoice')).toContain('Tax Invoice')
  })

  it.each([undefined, '', '   '])('falls back to the printed name (%s)', (text) => {
    const strip = stripNamed(text)
    expect(strip).toContain('INVOICE')
    expect(strip).not.toContain('Tax Invoice')
  })
})
