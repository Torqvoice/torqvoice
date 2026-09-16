// @vitest-environment node
/**
 * Two ways the same design reached the printer, and the two bugs that made
 * them disagree. Reported together by a workshop in September 2026.
 *
 * The org number was enabled on the header in the designer and printed there
 * in the preview, but never on the sheet. The header asked a retired setting,
 * `invoice.showOrgNumber`, that the old invoice settings page used to write.
 * The designer replaced that switch with the header's own field switch and the
 * old one was deleted, so no organization onboarded since has the row at all;
 * read as `=== 'true'` it was false for every one of them.
 *
 * And a design picked by name on an invoice printed with the header and title
 * of the classic pre-designer sheet, while the same design as the workshop
 * default printed correctly. The designer stamped `version` on the copy it put
 * in settings and not on the row, so the row read back as a layout predating
 * the designer.
 */

import { describe, expect, it } from 'vitest'
import { buildInvoicePrintSpec } from '@/features/invoice-designer/Pdf/buildInvoicePrint'
import { liveInvoiceSettings } from '@/features/invoices/Lib/assembleInvoicePrint'
import {
  designSourceFromSettings,
  designSourceFromStored,
  templateConfigFromSource,
} from '@/features/invoice-designer/Lib/designSource'
import {
  DESIGNER_LAYOUT_VERSION,
  getDefaultInvoiceLayout,
} from '@/features/settings/Schema/invoiceLayoutSchema'
import type { InvoiceData } from '@/features/vehicles/Components/invoice-pdf/types'

const data: InvoiceData = {
  id: 'svc-design',
  title: 'Service',
  description: null,
  type: 'repair',
  serviceDate: new Date('2026-08-14'),
  shopName: 'Egeland Auto',
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

const ORG_NUMBER = 'NO911782162'

function headerText(settings: Record<string, string>): string {
  const spec = buildInvoicePrintSpec({
    data,
    workshop: { name: 'Egeland Auto', address: 'Eigeland 50', phone: '91131664', email: '' },
    // Read through the assembler, so the rule under test is the real one and
    // not a copy of it that cannot go stale.
    invoiceSettings: liveInvoiceSettings({ 'invoice.orgNumber': ORG_NUMBER, ...settings }),
    template: { layoutConfig: { ...getDefaultInvoiceLayout(), version: DESIGNER_LAYOUT_VERSION } },
  })
  return JSON.stringify(spec.blocks.filter((b) => b.id === 'header'))
}

describe('the org number on the letterhead', () => {
  it('prints for a workshop that never had the retired switch', () => {
    expect(headerText({})).toContain(ORG_NUMBER)
  })

  it('prints for one whose switch was on', () => {
    expect(headerText({ 'invoice.showOrgNumber': 'true' })).toContain(ORG_NUMBER)
  })

  it('stays off for one that deliberately turned the switch off', () => {
    expect(headerText({ 'invoice.showOrgNumber': 'false' })).not.toContain(ORG_NUMBER)
  })
})

/** What the designer holds in hand while somebody works on a design. */
function editedLayout() {
  const layout = getDefaultInvoiceLayout()
  layout.sections = layout.sections.map((s) =>
    s.id === 'document_title' ? { ...s, visible: true } : s
  )
  return layout
}

function blockIds(template: ReturnType<typeof templateConfigFromSource>): string[] {
  return buildInvoicePrintSpec({ data, template }).blocks.map((b) => b.id ?? '')
}

describe('a design row saved before the stamp was written to it', () => {
  it('reads back as a designer layout, not a pre-designer one', () => {
    const source = designSourceFromStored(editedLayout(), {})
    expect(source?.layout.version).toBe(DESIGNER_LAYOUT_VERSION)
  })

  it('leaves a row that states its own version alone', () => {
    const source = designSourceFromStored({ ...editedLayout(), version: 2 }, {})
    expect(source?.layout.version).toBe(2)
  })

  it('prints the sheet the same design prints as the workshop default', () => {
    const layout = editedLayout()
    // What the designer wrote to settings: stamped.
    const asDefault = designSourceFromSettings(
      { 'invoice.layoutConfig': JSON.stringify({ ...layout, version: DESIGNER_LAYOUT_VERSION }) },
      'invoice'
    )
    // What it wrote to the row: the same layout, no stamp.
    const asRow = designSourceFromStored(layout, {})
    expect(asRow).not.toBeNull()

    expect(blockIds(templateConfigFromSource(asRow!))).toEqual(
      blockIds(templateConfigFromSource(asDefault))
    )
  })
})
