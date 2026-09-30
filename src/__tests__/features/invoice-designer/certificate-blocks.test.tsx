// @vitest-environment node
/**
 * The certificate on the designer's canvas and on paper.
 *
 * A certificate is the invoice's document pipeline fed an inspection: the
 * same builder, the same two renderers. So the same things are held to: every
 * certificate section prints from the sample and goes away when hidden, its
 * switches do what they say, the presets build certificate layouts and not
 * invoice ones, and the HTML sheet and the PDF agree on what they printed.
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
  CERTIFICATE_SECTIONS,
  type InvoiceLayoutConfig,
  type InvoiceSection,
  getDefaultLayout,
  mergeWithDefaults,
} from '@/features/settings/Schema/invoiceLayoutSchema'
import {
  buildLayoutFromPreset,
  certificatePresets,
  layoutPresets,
} from '@/features/settings/Schema/layoutPresets'
import { certificateLabels } from '@/features/inspections/Lib/certificateLabels'

/* eslint-disable @typescript-eslint/no-explicit-any */

const sample = () =>
  buildSampleData(
    {
      name: 'Shop',
      address: 'A road',
      phone: '555',
      email: 'shop@example.com',
      logoUrl: '',
    } as any,
    [],
    ((key: string) => key) as any,
    certificateLabels({}),
    'certificate'
  )

function specWith(patch: (section: InvoiceSection) => Partial<InvoiceSection> | undefined) {
  const layout = getDefaultLayout('certificate')
  layout.sections = layout.sections.map((section) => ({ ...section, ...patch(section) }))
  return buildDocumentSpec(layout, themeOf({} as any, layout), sample()) as any
}

const printed = (spec: any): string[] => spec.blocks.map((block: any) => block.id)

function textsOf(node: any): string[] {
  const out: string[] = []
  const walk = (n: any) => {
    if (!n || typeof n !== 'object') return
    if (n.kind === 'text' && n.text) out.push(String(n.text))
    if (n.kind === 'table')
      for (const row of n.rows ?? []) out.push(...Object.values(row).map(String))
    for (const child of n.children ?? []) walk(child.node ?? child)
  }
  walk(node)
  return out
}

const blockOf = (spec: any, id: string) => spec.blocks.find((b: any) => b.id === id)?.content

describe('the sections a default certificate prints', () => {
  it('is the certificate list, minus the ones off by default', () => {
    expect(printed(specWith(() => undefined))).toEqual([
      'header',
      'document_title',
      'result',
      'customer',
      'vehicle',
      'test_details',
      'defects',
      'results_table',
      'condition_map',
      'inspection_photos',
      'notes',
      'attached_documents',
      'footer',
    ])
  })

  it('carries none of the invoice sections', () => {
    const ids = CERTIFICATE_SECTIONS.map((s) => s.id)
    for (const id of ['items_table', 'parts_table', 'labor_table', 'totals', 'bank_account']) {
      expect(ids).not.toContain(id)
    }
    expect(getDefaultLayout('certificate').documentType).toBe('certificate')
  })

  it.each(CERTIFICATE_SECTIONS.map((s) => s.id))('%s leaves the sheet when hidden', (id) => {
    const spec = specWith((section) => (section.id === id ? { visible: false } : undefined))
    expect(printed(spec)).not.toContain(id)
  })
})

describe('the certificate switches', () => {
  it('lists only the checks that were not OK until a design asks for the rest', () => {
    const defectsOnly = textsOf(
      blockOf(
        specWith(() => undefined),
        'results_table'
      )
    )
    expect(defectsOnly).toContain('sample.checkBrakeHoses')
    expect(defectsOnly).not.toContain('sample.checkBrakePedal')
    expect(defectsOnly).not.toContain('sample.checkFogLamp')

    const all = specWith((section) =>
      section.id === 'results_table'
        ? {
            fields: [
              { id: 'passed_checks', visible: true },
              { id: 'not_applicable_checks', visible: true },
              { id: 'check_notes', visible: true },
            ],
          }
        : undefined
    )
    const texts = textsOf(blockOf(all, 'results_table'))
    expect(texts).toContain('sample.checkBrakePedal')
    expect(texts).toContain('sample.checkFogLamp')
  })

  it('puts every check in one table with a section column when asked', () => {
    const tablesIn = (block: any) => {
      const out: any[] = []
      const walk = (n: any) => {
        if (!n || typeof n !== 'object') return
        if (n.kind === 'table') out.push(n)
        for (const child of n.children ?? []) walk(child.node ?? child)
      }
      walk(block)
      return out
    }
    // Only the section with a defect prints by default, so one table.
    expect(
      tablesIn(
        blockOf(
          specWith(() => undefined),
          'results_table'
        )
      )
    ).toHaveLength(1)

    const combined = specWith((section) =>
      section.id === 'results_table'
        ? {
            fields: [
              { id: 'passed_checks', visible: true },
              { id: 'not_applicable_checks', visible: true },
              { id: 'check_notes', visible: false },
              { id: 'combined_table', visible: true },
            ],
          }
        : undefined
    )
    const tables = tablesIn(blockOf(combined, 'results_table'))
    expect(tables).toHaveLength(1)
    expect(tables[0].columns.map((c: any) => c.key)).toEqual(['code', 'section', 'name', 'grade'])
    expect(tables[0].rows).toHaveLength(5)
    expect(tables[0].rows[0].section).toBe('1. sample.sectionBrakes')
  })

  it('keeps a defect but drops its note and photo when the defects section says so', () => {
    const bare = specWith((section) =>
      section.id === 'defects'
        ? {
            fields: [
              { id: 'defect_notes', visible: false },
              { id: 'defect_photos', visible: false },
            ],
          }
        : undefined
    )
    const block = blockOf(bare, 'defects')
    expect(textsOf(block)).toContain('1.1.13  sample.checkBrakeHoses')
    expect(textsOf(block).some((t) => t.includes('sample.checkBrakeHosesNote'))).toBe(false)
    expect(JSON.stringify(block)).not.toContain('"kind":"image"')

    const full = blockOf(
      specWith(() => undefined),
      'defects'
    )
    expect(JSON.stringify(full)).toContain('"kind":"image"')
  })

  it('prints the test details the fields switch on, and no others', () => {
    const trimmed = specWith((section) =>
      section.id === 'test_details'
        ? {
            fields: [
              { id: 'test_date', visible: true },
              { id: 'inspector', visible: false },
              { id: 'certificate_number', visible: true },
            ],
          }
        : undefined
    )
    const texts = textsOf(blockOf(trimmed, 'test_details'))
    expect(texts.some((t) => t.startsWith('Date of test'))).toBe(true)
    expect(texts.some((t) => t.startsWith('Certificate number'))).toBe(true)
    expect(texts.some((t) => t.startsWith('Inspector'))).toBe(false)
  })

  it('lets the result band lose its box, its lines, and hang from a side', () => {
    const plain = specWith((section) =>
      section.id === 'result'
        ? {
            boxed: false,
            fields: [
              { id: 'result_detail', visible: false },
              { id: 'result_summary', visible: true },
            ],
            style: { align: 'right', width: 240 },
          }
        : undefined
    )
    const block = blockOf(plain, 'result')
    expect(block.kind).toBe('row')
    expect(block.justify).toBe('end')
    expect(block.children[0].width).toBe(240)
    const band = block.children[0].node
    expect(band.style?.background).toBeUndefined()
    expect(textsOf(band)).toHaveLength(2)
    expect(textsOf(band).some((t) => t.includes('undue delay'))).toBe(false)

    const boxed = blockOf(
      specWith(() => undefined),
      'result'
    )
    expect(boxed.kind).toBe('stack')
    expect(boxed.style?.background).toBe('#fef9c3')
    expect(textsOf(boxed)).toHaveLength(3)
  })

  it('lets the signature keep its line but withhold the name, or lose the date', () => {
    const unsigned = specWith((section) =>
      section.id === 'signature'
        ? {
            visible: true,
            fields: [
              { id: 'inspector_line', visible: true },
              { id: 'inspector_name', visible: false },
              { id: 'date_line', visible: false },
            ],
          }
        : undefined
    )
    const texts = textsOf(blockOf(unsigned, 'signature'))
    expect(texts).not.toContain('Jamie Lee')
    expect(texts).toContain('Inspector')
    expect(texts).not.toContain('Date of test')

    const full = specWith((section) => (section.id === 'signature' ? { visible: true } : undefined))
    expect(textsOf(blockOf(full, 'signature'))).toContain('Jamie Lee')
  })

  it('names the title strip cells for a certificate', () => {
    const spec = specWith(() => undefined)
    const texts = textsOf(blockOf(spec, 'document_title'))
    expect(texts).toContain('CERT-2026-0042')
    expect(texts).toContain('Certificate No.')
    expect(texts).not.toContain('Invoice No.')
  })
})

describe('the certificate presets', () => {
  it('build certificate layouts, apart from the invoice ones', () => {
    expect(certificatePresets.map((p) => p.id)).toEqual([
      'certificate-standard',
      'certificate-regulator',
      'certificate-customer',
      'certificate-compact',
    ])
    for (const preset of certificatePresets) {
      const layout = buildLayoutFromPreset(preset)
      expect(layout.documentType).toBe('certificate')
      expect(layout.sections.map((s) => s.id).sort()).toEqual(
        CERTIFICATE_SECTIONS.map((s) => s.id).sort()
      )
      for (const id of preset.order)
        expect(layout.sections.find((s) => s.id === id)?.visible).toBe(true)
      // Every starting point prints the photographs and offers the signature.
      expect(preset.order).toContain('inspection_photos')
      expect(preset.order).toContain('signature')
      // Merging keeps it a certificate, so a saved design reads back as one.
      expect(mergeWithDefaults(layout).documentType).toBe('certificate')
      expect(mergeWithDefaults(layout).sections.some((s) => s.id === 'totals')).toBe(false)
    }
    for (const preset of layoutPresets) expect(preset.documentType).toBeUndefined()
  })

  it('leaves an invoice layout an invoice layout', () => {
    const merged = mergeWithDefaults({ sections: [] } as unknown as InvoiceLayoutConfig)
    expect(merged.documentType).toBeUndefined()
    expect(merged.sections.some((s) => s.id === 'result')).toBe(false)
  })
})

describe('both renderers', () => {
  it('print the same certificate', async () => {
    const layout = buildLayoutFromPreset(certificatePresets[1])
    const spec = buildDocumentSpec(layout, themeOf({} as any, layout), sample())
    const html = renderToStaticMarkup((<SpecSheet spec={spec} />) as any)
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
    const pdf = await renderToBuffer(
      (
        <Document>
          <SpecPdfPage spec={spec} />
        </Document>
      ) as any
    )
    const { text } = await extractText(new Uint8Array(pdf), { mergePages: true })
    for (const needle of ['CERT-2026-0042', 'sample.checkBrakeHoses', 'Jamie Lee']) {
      expect(html).toContain(needle)
      expect(text.replace(/\s+/g, ' ')).toContain(needle)
    }
  })
})
