// @vitest-environment node
/**
 * The sheet the designer draws, the sheet the customer opens and the PDF are
 * one document.
 *
 * They are drawn by three different renderers. `SpecCanvas` (the designer) and
 * `SpecSheet` (the share page) both put their content through `RenderNode`, so
 * those two agree by construction; `SpecPdf` is the one that reads the same
 * spec through its own eyes. That is where a switch can be honoured on screen
 * and ignored on paper, or the other way round, and a workshop hears about it
 * from a customer.
 *
 * So one spec is built with the designer's switches deliberately set: a
 * section hidden, a heading off, the document renamed, a field switched off
 * and two fields dragged past each other. Then both renderers are asked what
 * they printed.
 */
import { Document, renderToBuffer } from '@react-pdf/renderer'
import { renderToStaticMarkup } from 'react-dom/server'
import { extractText } from 'unpdf'
import { describe, expect, it } from 'vitest'
import '@/features/vehicles/Components/invoice-pdf/fonts'
import { themeOf } from '@/features/invoice-designer/Components/designTheme'
import { buildSampleData } from '@/features/invoice-designer/Components/sample'
import { SpecPdfPage } from '@/features/invoice-designer/Pdf/SpecPdf'
import { SpecSheet } from '@/features/invoice-designer/Render/SpecSheet'
import { buildDocumentSpec } from '@/features/invoice-designer/Spec/buildSpec'
import {
  type InvoiceLayoutConfig,
  mergeWithDefaults,
} from '@/features/settings/Schema/invoiceLayoutSchema'

/* eslint-disable @typescript-eslint/no-explicit-any */

const TITLE = 'TAX INVOICE'

/** The designer's switches, set to something worth checking on both sides. */
function designedLayout(): InvoiceLayoutConfig {
  const layout = mergeWithDefaults({}) as InvoiceLayoutConfig
  layout.sections = layout.sections.map((section) => {
    if (section.id === 'service') return { ...section, visible: false }
    if (section.id === 'document_title') return { ...section, text: TITLE }
    if (section.id === 'customer') {
      return {
        ...section,
        heading: false,
        fields: (section.fields ?? []).map((field) =>
          field.id === 'customer_email' ? { ...field, visible: false } : field
        ),
      }
    }
    if (section.id === 'vehicle') {
      // The plate dragged above the VIN, which both renderers have to follow.
      return {
        ...section,
        fields: ['vehicle_name', 'license_plate', 'vin', 'mileage'].map((id) => ({
          id,
          visible: true,
        })),
      }
    }
    return section
  })
  return layout
}

const sample = () =>
  buildSampleData(
    {
      name: 'Shop',
      address: 'A road',
      phone: '555',
      email: 'shop@example.com',
      logoUrl: null,
    } as any,
    [],
    ((key: string) => key) as any,
    {},
    'invoice'
  )

/** Text out of the HTML sheet: tags dropped, entities decoded, spacing folded. */
function textFromHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
}

async function bothRenderings() {
  const layout = designedLayout()
  const spec = buildDocumentSpec(layout, themeOf({} as any, layout), sample())

  const html = textFromHtml(renderToStaticMarkup((<SpecSheet spec={spec} />) as any))

  const pdf = await renderToBuffer(
    (
      <Document>
        <SpecPdfPage spec={spec} />
      </Document>
    ) as any
  )
  const { text } = await extractText(new Uint8Array(pdf), { mergePages: true })

  // Both folded to one case: the PDF renderer applies `textTransform` for
  // real, so a heading the stylesheet only draws in capitals comes out of the
  // PDF in capitals and out of the HTML as it was written.
  return {
    html: html.toLowerCase(),
    pdf: String(text).replace(/\s+/g, ' ').toLowerCase(),
  }
}

describe('the share sheet and the PDF print the same designed document', () => {
  it('agree on what the designer asked for', async () => {
    const { html, pdf } = await bothRenderings()

    // Renamed by the workshop, on both.
    expect(html).toContain(TITLE.toLowerCase())
    expect(pdf).toContain(TITLE.toLowerCase())

    // A section switched off is off both.
    expect(html).not.toContain('jamie lee')
    expect(pdf).not.toContain('jamie lee')

    // A heading switched off is gone from both, and what was under it stays.
    expect(html).not.toContain('bill to')
    expect(pdf).not.toContain('bill to')
    expect(html).toContain('alex carter')
    expect(pdf).toContain('alex carter')

    // One field switched off, and only that one.
    expect(html).not.toContain('alex@example.com')
    expect(pdf).not.toContain('alex@example.com')
    expect(html).toContain('+1 555 0134')
    expect(pdf).toContain('+1 555 0134')

    // Two fields dragged past each other print in the new order on both.
    for (const [name, printed] of Object.entries({ html, pdf })) {
      const plate = printed.indexOf('ab 12345')
      const vin = printed.indexOf('yv1aa0000l0000000')
      expect(plate, `the plate is on the ${name}`).toBeGreaterThanOrEqual(0)
      expect(vin, `the VIN is on the ${name}`).toBeGreaterThanOrEqual(0)
      expect(plate, `the plate prints above the VIN on the ${name}`).toBeLessThan(vin)
    }
  })

  it('put the blocks in the same order', async () => {
    const { html, pdf } = await bothRenderings()

    // One marker per block that prints, in the order the layout puts them.
    // Each has to be a word only its own block prints: "Total" would find the
    // items table's column heading long before the totals panel.
    const markers = [
      'shop',
      TITLE.toLowerCase(),
      'alex carter',
      '2020 volvo v60',
      'subtotal',
      'payment information',
    ]

    for (const [name, printed] of Object.entries({ html, pdf })) {
      const found = markers.map((marker) => printed.indexOf(marker))
      expect(
        found.every((at) => at >= 0),
        `every marker is on the ${name}`
      ).toBe(true)
      // Ascending, which is to say: the same running order in both.
      expect(found, `${name} keeps the order`).toEqual([...found].sort((a, b) => a - b))
    }
  })
})
