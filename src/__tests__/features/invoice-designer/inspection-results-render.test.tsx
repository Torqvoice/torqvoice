// @vitest-environment node
/**
 * The inspection's results on an invoice, a quote and a work order, drawn.
 *
 * The two result blocks were the certificate's alone; now three other
 * documents print them, from a real inspection rather than the sample. So the
 * same thing the certificate is held to is held to here: the sheet a customer
 * opens and the PDF they download say the same rows, the ungraded checks with
 * their empty grade and the defect's photograph included.
 */
import { Document, renderToBuffer } from '@react-pdf/renderer'
import { renderToStaticMarkup } from 'react-dom/server'
import { extractText } from 'unpdf'
import { describe, expect, it } from 'vitest'
import '@/features/vehicles/Components/invoice-pdf/fonts'
import { invoiceLabels } from '@/features/invoice-designer/Lib/invoiceLabels'
import { workOrderLabels } from '@/features/invoice-designer/Lib/workOrderLabels'
import { buildInvoicePrintSpec } from '@/features/invoice-designer/Pdf/buildInvoicePrint'
import { buildQuotePrintSpec } from '@/features/invoice-designer/Pdf/buildQuotePrint'
import { buildWorkOrderPrintSpec } from '@/features/invoice-designer/Pdf/buildWorkOrderPrint'
import { SpecPdfPage } from '@/features/invoice-designer/Pdf/SpecPdf'
import { SpecSheet } from '@/features/invoice-designer/Render/SpecSheet'
import type { InspectionResults } from '@/features/inspections/Lib/inspectionResults'
import {
  DESIGNER_LAYOUT_VERSION,
  getDefaultLayout,
  type LayoutDocumentType,
} from '@/features/settings/Schema/invoiceLayoutSchema'
import pdfEn from '../../../../messages/en/pdf.json'

/* eslint-disable @typescript-eslint/no-explicit-any */

const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAX+XDSwAAAABJRU5ErkJggg=='

const item = (id: string, name: string, condition: string, over: Record<string, unknown> = {}) => ({
  id,
  name,
  section: 'Brakes',
  sectionCode: '1',
  code: null,
  condition,
  notes: null,
  sortOrder: Number(id.slice(1)),
  ...over,
})

const results: InspectionResults = {
  severityScale: 'eu',
  country: null,
  items: [
    item('i1', 'Brake pedal', 'pass'),
    item('i2', 'Brake hoses', 'fail', { notes: 'Cracked at the front left' }),
    item('i3', 'Headlamp aim', 'not_inspected', { section: 'Lighting', sectionCode: '4' }),
  ],
  itemPhotos: { i2: [{ dataUri: PNG }] },
}

/** A layout of this document with both result sections and every switch on. */
function layoutOf(documentType: LayoutDocumentType) {
  const layout = getDefaultLayout(documentType)
  return {
    ...layout,
    version: DESIGNER_LAYOUT_VERSION,
    sections: layout.sections.map((s) =>
      s.id === 'defects' || s.id === 'results_table'
        ? { ...s, visible: true, fields: s.fields?.map((f) => ({ ...f, visible: true })) }
        : s
    ),
  }
}

const lines = {
  partItems: [],
  laborItems: [{ description: 'Fit', hours: 1, rate: 100, total: 100 }],
}
const totals = { subtotal: 100, taxRate: 0, taxAmount: 0, totalAmount: 100, discountValue: 0 }

const SHEETS: [string, () => any][] = [
  [
    'an invoice',
    () =>
      buildInvoicePrintSpec({
        data: {
          id: 'svc_1',
          title: 'Brakes',
          type: 'repair',
          serviceDate: new Date('2026-09-24T09:00:00Z'),
          cost: 100,
          invoiceNumber: 'INV-1',
          customer: null,
          vehicle: null,
          ...lines,
          ...totals,
        } as any,
        labels: invoiceLabels(pdfEn as any),
        template: { layoutConfig: layoutOf('invoice') },
        inspectionResults: results,
      }),
  ],
  [
    'a quote',
    () =>
      buildQuotePrintSpec({
        data: {
          quoteNumber: 'Q-1',
          title: 'Brakes',
          description: null,
          validUntil: null,
          createdAt: new Date('2026-09-24T09:00:00Z'),
          discountType: null,
          discountAmount: 0,
          notes: null,
          customer: null,
          vehicle: null,
          ...lines,
          ...totals,
        } as any,
        labels: invoiceLabels(pdfEn as any, 'quote'),
        layoutConfig: layoutOf('invoice'),
        inspectionResults: results,
      }),
  ],
  [
    'a work order',
    () =>
      buildWorkOrderPrintSpec({
        data: {
          id: 'svc_1',
          title: 'Brakes',
          type: 'repair',
          serviceDate: new Date('2026-09-24T09:00:00Z'),
          cost: 100,
          customFields: [],
          findings: [],
          customer: null,
          vehicle: null,
          ...lines,
          ...totals,
        } as any,
        job: {
          orderNumber: 'WO-1',
          statusLabel: 'Open',
          concerns: [],
          printedAt: new Date('2026-09-25T10:00:00Z'),
          linkedInspection: results,
        },
        labels: workOrderLabels(pdfEn as any),
        template: { layoutConfig: layoutOf('work_order') } as any,
      }),
  ],
]

describe.each(SHEETS)('the inspection results drawn on %s', (_name, build) => {
  it('say the same rows on the sheet and in the PDF', async () => {
    const spec = build()
    expect(JSON.stringify(spec)).toContain(PNG)
    const html = renderToStaticMarkup((<SpecSheet spec={spec} />) as any)
    expect(html).toContain(PNG)
    const sheet = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
    const pdf = await renderToBuffer(
      (
        <Document>
          <SpecPdfPage spec={spec} />
        </Document>
      ) as any
    )
    const { text } = await extractText(new Uint8Array(pdf), { mergePages: true })
    for (const needle of [
      'Deficiencies found',
      'Major defect',
      'Brake hoses',
      'Cracked at the front left',
      'All results',
      'Brake pedal',
      'No defect',
      // The check nobody has graded, on the sheet with nothing beside it.
      'Headlamp aim',
      'Lighting',
    ]) {
      // The headings are set in capitals, which the PDF's text carries and
      // the sheet's markup leaves to its styling.
      expect(sheet.toLowerCase(), needle).toContain(needle.toLowerCase())
      expect(text.replace(/\s+/g, ' ').toLowerCase(), needle).toContain(needle.toLowerCase())
    }
  })
})
