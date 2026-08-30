/**
 * @vitest-environment node
 *
 * The number, the date and the amount a customer quotes back must print
 * exactly once, wherever the layout puts them. A layout with a Document Title
 * section shows it there; a layout without one gets it set directly under the
 * header, which is where every header used to print it. Enforced in the
 * document generator, so the designer and the paper obey the same rule.
 */
import { describe, expect, it } from 'vitest'
import { buildInvoicePrintSpec } from '@/features/invoice-designer/Pdf/buildInvoicePrint'
import { getDefaultInvoiceLayout } from '@/features/settings/Schema/invoiceLayoutSchema'
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

function specWithTitleVisible(visible: boolean) {
  const layout = getDefaultInvoiceLayout()
  layout.sections = layout.sections.map((s) => (s.id === 'document_title' ? { ...s, visible } : s))
  return buildInvoicePrintSpec({ data, template: { layoutConfig: layout } })
}

describe('document title placement', () => {
  it.each([true, false])('prints the block exactly once (visible: %s)', (visible) => {
    const spec = specWithTitleVisible(visible)
    const titles = spec.blocks.filter((b) => b.id === 'document_title')
    expect(titles).toHaveLength(1)
    expect(JSON.stringify(titles[0])).toContain('INV-2026-1001')
  })

  it('sets a borrowed title directly under the header', () => {
    const spec = specWithTitleVisible(false)
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
