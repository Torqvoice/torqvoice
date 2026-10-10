/**
 * The inspection's results on an invoice and on a quote.
 *
 * Both can print the two result sections the certificate has: an invoice from
 * the inspection linked to its job, a quote from the one it was raised from.
 * They are a choice, off in a new design and in every design saved before
 * they existed, and no word either document already prints changes for them.
 */
import { describe, expect, it } from 'vitest'
import { themeOf } from '@/features/invoice-designer/Components/designTheme'
import { buildSampleData } from '@/features/invoice-designer/Components/sample'
import { invoiceLabels } from '@/features/invoice-designer/Lib/invoiceLabels'
import { buildInvoicePrintSpec } from '@/features/invoice-designer/Pdf/buildInvoicePrint'
import { buildQuotePrintSpec } from '@/features/invoice-designer/Pdf/buildQuotePrint'
import { loadPrintLabels } from '@/features/invoice-designer/Pdf/printLabels'
import { buildDocumentSpec } from '@/features/invoice-designer/Spec/buildSpec'
import type { InspectionResults } from '@/features/inspections/Lib/inspectionResults'
import {
  DESIGNER_LAYOUT_VERSION,
  getDefaultLayout,
  mergeWithDefaults,
  type InvoiceLayoutConfig,
} from '@/features/settings/Schema/invoiceLayoutSchema'
import {
  buildLayoutFromPreset,
  certificatePresets,
  layoutPresets,
} from '@/features/settings/Schema/layoutPresets'
import type { InvoiceData } from '@/features/vehicles/Components/invoice-pdf/types'
import pdfEn from '../../../../messages/en/pdf.json'
import pdfNb from '../../../../messages/nb/pdf.json'

/* eslint-disable @typescript-eslint/no-explicit-any */

const invoice: InvoiceData = {
  id: 'svc_00000001',
  title: 'Service',
  description: null,
  type: 'repair',
  serviceDate: new Date('2026-09-24T09:00:00Z'),
  shopName: null,
  techName: null,
  mileage: 84120,
  diagnosticNotes: null,
  invoiceNotes: null,
  subtotal: 100,
  taxRate: 0,
  taxAmount: 0,
  totalAmount: 100,
  cost: 100,
  invoiceNumber: '2026-0042',
  partItems: [],
  laborItems: [{ description: 'Replace front pads', hours: 1, rate: 100, total: 100 }],
  customer: null,
  vehicle: null,
}

const quote = {
  quoteNumber: 'Q-7',
  title: 'Brakes',
  description: null,
  validUntil: null,
  createdAt: new Date('2026-09-24T09:00:00Z'),
  subtotal: 100,
  taxRate: 0,
  taxAmount: 0,
  discountType: null,
  discountValue: 0,
  discountAmount: 0,
  totalAmount: 100,
  notes: null,
  partItems: [],
  laborItems: [{ description: 'Replace front pads', hours: 1, rate: 100, total: 100 }],
  customer: null,
  vehicle: null,
} as any

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

const results = (): InspectionResults => ({
  severityScale: 'eu',
  country: null,
  items: [
    item('i1', 'Brake pedal', 'pass'),
    item('i2', 'Brake hoses', 'fail', { notes: 'Cracked at the front left' }),
    item('i3', 'Brake fluid', 'attention'),
    item('i4', 'Headlamps', 'not_inspected', { section: 'Lighting', sectionCode: '4' }),
  ],
  itemPhotos: { i2: [{ dataUri: 'data:image/jpeg;base64,AA==' }] },
})

/** The invoice and quote layout with these sections on, the graded rows with them. */
function withSections(ids: string[], layout = getDefaultLayout('invoice')): InvoiceLayoutConfig {
  return {
    ...layout,
    version: DESIGNER_LAYOUT_VERSION,
    sections: layout.sections.map((s) =>
      ids.includes(s.id)
        ? {
            ...s,
            visible: true,
            fields: s.fields?.map((f) => ({ ...f, visible: f.id !== 'ungraded_checks' })),
          }
        : s
    ),
  }
}

const printInvoice = (
  layout: InvoiceLayoutConfig | undefined,
  inspectionResults: InspectionResults | null | undefined,
  labels: Record<string, string> = invoiceLabels(pdfEn as any)
) =>
  buildInvoicePrintSpec({
    data: invoice,
    labels,
    template: layout ? { layoutConfig: layout } : undefined,
    inspectionResults,
  }) as any

const printQuote = (
  layout: InvoiceLayoutConfig | undefined,
  inspectionResults: InspectionResults | null | undefined,
  labels: Record<string, string> = invoiceLabels(pdfEn as any, 'quote')
) => buildQuotePrintSpec({ data: quote, labels, layoutConfig: layout, inspectionResults }) as any

const DOCUMENTS = [
  ['an invoice', printInvoice],
  ['a quote', printQuote],
] as const

const printed = (spec: any): string[] => spec.blocks.map((b: any) => b.id)
const blockOf = (spec: any, id: string) =>
  spec.blocks.find((b: any) => b.id === id)?.content ?? null

function texts(node: any): string[] {
  const out: string[] = []
  const walk = (n: any) => {
    if (!n || typeof n !== 'object') return
    if (n.kind === 'text' && n.text) out.push(String(n.text))
    if (n.kind === 'table') {
      out.push(...n.columns.map((c: any) => c.label).filter(Boolean))
      for (const row of n.rows ?? []) out.push(...Object.values(row).map(String).filter(Boolean))
    }
    for (const child of n.children ?? []) walk(child.node ?? child)
  }
  walk(node)
  return out
}

describe.each(DOCUMENTS)('the inspection results on %s', (_name, print) => {
  it('prints both blocks from the inspection when the design asks', () => {
    const spec = print(withSections(['defects', 'results_table']), results())
    const ids = printed(spec)
    // Together as the appendix: after the bill, defects first.
    expect(ids.slice(ids.indexOf('defects'), ids.indexOf('defects') + 2)).toEqual([
      'defects',
      'results_table',
    ])
    expect(ids.indexOf('defects')).toBeGreaterThan(ids.indexOf('totals'))
    expect(ids.indexOf('results_table')).toBeLessThan(ids.indexOf('footer'))

    expect(texts(blockOf(spec, 'defects'))).toEqual([
      'Deficiencies found',
      'Major defect',
      'Brake hoses',
      'Cracked at the front left',
      'Minor defect',
      'Brake fluid',
    ])
    expect(JSON.stringify(blockOf(spec, 'defects'))).toContain('data:image/jpeg;base64,AA==')
    const table = texts(blockOf(spec, 'results_table'))
    expect(table[0]).toBe('All results')
    expect(table).toContain('Brake pedal')
    expect(table).toContain('No defect')
    expect(table).toContain('Status')
    // A check nobody has graded is left out until the design asks for those.
    expect(table).not.toContain('Headlamps')
  })

  it('sits in front of the condition map when both are on', () => {
    const ids = getDefaultLayout('invoice').sections.map((s) => s.id)
    const at = ids.indexOf('defects')
    expect(ids.slice(at, at + 4)).toEqual([
      'defects',
      'results_table',
      'condition_map',
      'signature',
    ])
  })

  it('prints nothing new at the default, inspection or not', () => {
    const plain = print(undefined, null)
    const linked = print(undefined, results())
    expect(printed(linked)).not.toContain('defects')
    expect(printed(linked)).not.toContain('results_table')
    expect(linked).toEqual(plain)
    // A saved designer layout at its defaults: the same.
    const saved = { ...getDefaultLayout('invoice'), version: DESIGNER_LAYOUT_VERSION }
    expect(print(saved, results())).toEqual(print(saved, null))
  })

  it('prints nothing, not even a heading, without an inspection', () => {
    const on = withSections(['defects', 'results_table'])
    const off = { ...getDefaultLayout('invoice'), version: DESIGNER_LAYOUT_VERSION }
    for (const none of [null, undefined]) {
      expect(printed(print(on, none))).toEqual(printed(print(off, null)))
    }
  })

  it('prints nothing for an inspection nobody has started', () => {
    const untouched = results()
    untouched.items = untouched.items.map((i) => ({ ...i, condition: 'not_inspected' }))
    const spec = print(withSections(['defects', 'results_table']), untouched)
    expect(printed(spec)).not.toContain('defects')
    expect(printed(spec)).not.toContain('results_table')
  })

  it('words the sections in the document language', () => {
    const type = print === printQuote ? 'quote' : 'invoice'
    const spec = print(
      withSections(['defects', 'results_table']),
      results(),
      invoiceLabels(pdfNb as any, type)
    )
    const nb = (pdfNb as any).inspection
    expect(texts(blockOf(spec, 'defects'))[0]).toBe(nb.deficiencies)
    const table = texts(blockOf(spec, 'results_table'))
    expect(table[0]).toBe(nb.allResults)
    expect(table).toContain(nb.statusColumn)
    expect(table).toContain(nb.euPass)
  })
})

describe('the invoice and quote labels', () => {
  it('take the inspection vocabulary without changing a word they had', async () => {
    for (const pdf of [pdfEn, pdfNb] as any[]) {
      for (const type of ['invoice', 'quote'] as const) {
        const before = { ...pdf.invoice, ...(type === 'quote' ? pdf.quote : {}), ...pdf.common }
        const after = invoiceLabels(pdf, type)
        for (const key of Object.keys(before)) expect(after[key], key).toBe(before[key])
        expect(after.allResults).toBe(pdf.inspection.allResults)
        expect(after.euPass).toBe(pdf.inspection.euPass)
      }
    }
    // The print path reads the same words.
    for (const locale of ['en', 'nb']) {
      const pdf: any = locale === 'en' ? pdfEn : pdfNb
      expect(await loadPrintLabels(locale, {})).toEqual(invoiceLabels(pdf))
      expect(await loadPrintLabels(locale, {}, 'quote')).toEqual(invoiceLabels(pdf, 'quote'))
    }
  })

  it('print nothing new on a default sheet for having them', () => {
    const bare = { ...(pdfEn as any).invoice, ...(pdfEn as any).common }
    expect(printInvoice(undefined, null, invoiceLabels(pdfEn as any))).toEqual(
      printInvoice(undefined, null, bare)
    )
    const bareQuote = { ...bare, ...(pdfEn as any).quote, ...(pdfEn as any).common }
    expect(printQuote(undefined, null, invoiceLabels(pdfEn as any, 'quote'))).toEqual(
      printQuote(undefined, null, bareQuote)
    )
  })
})

describe('the invoice and quote layout and the result sections', () => {
  const ordered = (layout: InvoiceLayoutConfig) =>
    [...layout.sections].sort((a, b) => a.order - b.order).map((s) => s.id)
  const shown = (layout: InvoiceLayoutConfig) =>
    [...layout.sections]
      .filter((s) => s.visible)
      .sort((a, b) => a.order - b.order)
      .map((s) => s.id)
  const without = (layout: InvoiceLayoutConfig, ids: string[]): InvoiceLayoutConfig => ({
    ...layout,
    version: DESIGNER_LAYOUT_VERSION,
    sections: layout.sections
      .filter((s) => !ids.includes(s.id))
      .sort((a, b) => a.order - b.order)
      .map((s, order) => ({ ...s, order })),
  })

  it('has them off in a new design', () => {
    const layout = getDefaultLayout('invoice')
    for (const id of ['defects', 'results_table']) {
      expect(layout.sections.find((s) => s.id === id)?.visible).toBe(false)
    }
  })

  it('gives a design saved before they existed both sections, hidden, in front of the map', () => {
    const saved = without(getDefaultLayout('invoice'), ['defects', 'results_table'])
    const merged = mergeWithDefaults(saved)
    const ids = ordered(merged)
    const at = ids.indexOf('condition_map')
    expect(ids.slice(at - 2, at + 1)).toEqual(['defects', 'results_table', 'condition_map'])
    for (const id of ['defects', 'results_table']) {
      const section = merged.sections.find((s) => s.id === id)
      expect(section?.visible).toBe(false)
      expect(section?.fields?.length).toBeGreaterThan(0)
    }
    expect(shown(merged)).toEqual(shown(saved))
    // And both documents print what they printed.
    expect(printInvoice(saved, results())).toEqual(printInvoice(saved, null))
    expect(printQuote(saved, results())).toEqual(printQuote(saved, null))
  })

  it('follows the condition map wherever a design has put it', () => {
    // The map moved up under the vehicle, as a workshop might want it.
    const base = without(getDefaultLayout('invoice'), ['defects', 'results_table'])
    const ids = ordered(base).filter((id) => id !== 'condition_map')
    ids.splice(ids.indexOf('vehicle') + 1, 0, 'condition_map')
    const saved: InvoiceLayoutConfig = {
      ...base,
      sections: ids.map((id, order) => ({
        ...(base.sections.find((s) => s.id === id) as any),
        order,
      })),
    }
    const merged = ordered(mergeWithDefaults(saved))
    const at = merged.indexOf('condition_map')
    expect(merged.slice(at - 3, at + 1)).toEqual([
      'vehicle',
      'defects',
      'results_table',
      'condition_map',
    ])
  })

  it('joins a design older than the condition map with it, in front of the signing line', () => {
    // Bank details under the signature, as some workshops arrange it.
    const base = without(getDefaultLayout('invoice'), ['defects', 'results_table', 'condition_map'])
    const ids = ordered(base).filter((id) => id !== 'bank_account')
    ids.splice(ids.indexOf('signature') + 1, 0, 'bank_account')
    const saved: InvoiceLayoutConfig = {
      ...base,
      sections: ids.map((id, order) => ({
        ...(base.sections.find((s) => s.id === id) as any),
        order,
      })),
    }
    const merged = ordered(mergeWithDefaults(saved))
    const at = merged.indexOf('signature')
    expect(merged.slice(at - 3, at + 2)).toEqual([
      'defects',
      'results_table',
      'condition_map',
      'signature',
      'bank_account',
    ])
  })

  it('leaves a design built from a starting point in the order it was saved in', () => {
    // A starting point writes its own numbers on the built-in list, and the
    // designer saves it like that until a section is moved. A section added
    // later must not put the sheet, or an issued copy of it, back in the
    // built-in order.
    const cases: [InvoiceLayoutConfig, string[]][] = [
      ...layoutPresets.map((p): [InvoiceLayoutConfig, string[]] => [
        buildLayoutFromPreset(p),
        ['defects', 'results_table'],
      ]),
      ...layoutPresets.map((p): [InvoiceLayoutConfig, string[]] => [
        buildLayoutFromPreset(p),
        ['defects', 'results_table', 'condition_map', 'signature'],
      ]),
      ...certificatePresets.map((p): [InvoiceLayoutConfig, string[]] => [
        buildLayoutFromPreset(p),
        ['signature'],
      ]),
    ]
    for (const [built, missing] of cases) {
      const saved = {
        ...built,
        version: DESIGNER_LAYOUT_VERSION,
        sections: built.sections.filter((s) => !missing.includes(s.id)),
      }
      const merged = mergeWithDefaults(JSON.parse(JSON.stringify(saved)))
      expect(
        shown(merged).filter((id) => !missing.includes(id)),
        `${built.documentType ?? 'invoice'} without ${missing.join(', ')}`
      ).toEqual(shown(saved))
    }
  })
})

describe('the designer preview of an invoice and a quote', () => {
  it.each([
    'invoice',
    'quote',
  ] as const)('shows sample results on the %s canvas when on', (type) => {
    const sample = buildSampleData(
      { name: 'Shop', address: 'A road', phone: '555', email: 's@example.com', logoUrl: '' } as any,
      [],
      ((key: string) => key) as any,
      invoiceLabels(pdfEn as any, type),
      type
    )
    const off = getDefaultLayout('invoice')
    const offSpec = buildDocumentSpec(off, themeOf({} as any, off), sample) as any
    expect(printed(offSpec)).not.toContain('defects')
    expect(printed(offSpec)).not.toContain('results_table')
    const on = withSections(['defects', 'results_table'])
    const spec = buildDocumentSpec(on, themeOf({} as any, on), sample) as any
    expect(texts(blockOf(spec, 'defects')).join('\n')).toContain('sample.checkBrakeHoses')
    expect(texts(blockOf(spec, 'results_table'))).toContain('sample.checkBrakePedal')
    // Still the document it is: its own title, not the certificate's.
    expect(sample.meta.title).not.toBe((pdfEn as any).inspection.title)
  })
})
