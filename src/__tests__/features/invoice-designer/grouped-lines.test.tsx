// @vitest-environment node
/**
 * A table of lines divided by the parts' category.
 *
 * The layout says "group by category"; the print builder works out the groups
 * and their subtotals; the spec builder lays the rows out under headings; and
 * the three renderers draw heading and subtotal rows that no ordinary row
 * could produce. Each hand-off is checked here, and the two renderers are
 * asked whether they printed the same headings.
 */
import { Document, renderToBuffer } from '@react-pdf/renderer'
import { renderToStaticMarkup } from 'react-dom/server'
import { extractText } from 'unpdf'
import { describe, expect, it } from 'vitest'
import '@/features/vehicles/Components/invoice-pdf/fonts'
import { themeOf } from '@/features/invoice-designer/Components/designTheme'
import { buildSampleData } from '@/features/invoice-designer/Components/sample'
import { estimateBlockHeights } from '@/features/invoice-designer/Pdf/estimateHeights'
import { lineGroupsFor } from '@/features/invoice-designer/Pdf/lineGroups'
import { SpecPdfPage } from '@/features/invoice-designer/Pdf/SpecPdf'
import { SpecSheet } from '@/features/invoice-designer/Render/SpecSheet'
import { buildDocumentSpec } from '@/features/invoice-designer/Spec/buildSpec'
import {
  type InvoiceLayoutConfig,
  type InvoiceSection,
  mergeWithDefaults,
} from '@/features/settings/Schema/invoiceLayoutSchema'

/* eslint-disable @typescript-eslint/no-explicit-any */

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

/**
 * The sample's parts carry the sample translation keys as their categories:
 * two brake parts and one line of consumables. Every part has one, so no
 * "Other parts" group appears in the preview.
 */
const BRAKES = 'sample.categoryBrakes'
const CONSUMABLES = 'sample.categoryConsumables'

function specWith(patch: (section: InvoiceSection) => Partial<InvoiceSection> | undefined) {
  const layout = mergeWithDefaults({}) as InvoiceLayoutConfig
  layout.sections = layout.sections.map((section) => ({ ...section, ...patch(section) }))
  return { spec: buildDocumentSpec(layout, themeOf({} as any, layout), sample()) as any, layout }
}

function tableOf(spec: any, id: string): any {
  const content = spec.blocks.find((block: any) => block.content?.id === id)?.content
  if (!content) return undefined
  if (content.kind === 'table') return content
  return content.children?.find((child: any) => child.kind === 'table')
}

describe('the groups a document divides its lines into', () => {
  const money = (n: number) => `€ ${n.toFixed(2)}`
  const shown = (n: number) => n
  const labels = { labor: 'Work', otherParts: 'Misc', groupSubtotal: 'Sum for {group}' }

  it('are nothing when no part has a category, so the sheet prints flat', () => {
    const groups = lineGroupsFor({
      parts: [{ total: 10 }, { total: 5, category: '  ' }],
      labor: [{ total: 100 }],
      labels,
      shown,
      money,
    })
    expect(groups).toBeUndefined()
  })

  it('run labor first, then the categories as they first appear, then the rest', () => {
    const groups = lineGroupsFor({
      parts: [
        { total: 10, category: 'Brakes' },
        { total: 7 },
        { total: 20, category: 'Service' },
        { total: 5, category: 'Brakes' },
        { total: 3, category: 'Service', excluded: true },
      ],
      labor: [{ total: 100 }, { total: 50, excluded: true }],
      labels,
      shown,
      money,
    })
    expect(groups?.map((g) => [g.title, g.subtotal, g.subtotalLabel])).toEqual([
      ['Work', '€ 100.00', 'Sum for Work'],
      ['Brakes', '€ 15.00', 'Sum for Brakes'],
      ['Service', '€ 20.00', 'Sum for Service'],
      ['Misc', '€ 7.00', 'Sum for Misc'],
    ])
  })
})

describe('a parts table grouped by category', () => {
  it('prints a heading and a subtotal row per group, and no labor group', () => {
    const { spec } = specWith((s) => (s.id === 'parts_table' ? { groupBy: 'category' } : undefined))
    const table = tableOf(spec, 'parts_table')
    expect(table.groupKey).toBeDefined()
    expect(table.emphasisKey).toBeDefined()
    const headings = table.rows
      .filter((r: any) => r[table.groupKey])
      .map((r: any) => r[table.groupKey])
    expect(headings).toEqual([BRAKES, CONSUMABLES])
    const subtotals = table.rows
      .filter((r: any) => r[table.emphasisKey])
      .map((r: any) => [r.desc, r.total])
    expect(subtotals).toEqual([
      [`${BRAKES} subtotal`, '€ 245.50'],
      [`${CONSUMABLES} subtotal`, '€ 12.00'],
    ])
    // A heading and a subtotal per group around the three sample parts.
    expect(table.rows).toHaveLength(3 + 4)
  })

  it('prints flat when the layout does not ask for groups', () => {
    const { spec } = specWith(() => undefined)
    const table = tableOf(spec, 'parts_table')
    expect(table.groupKey).toBeUndefined()
    expect(table.rows).toHaveLength(3)
  })

  it('measures taller than the flat table it replaces', () => {
    const flat = specWith(() => undefined).spec
    const grouped = specWith((s) =>
      s.id === 'parts_table' ? { groupBy: 'category' } : undefined
    ).spec
    const flatHeight = estimateBlockHeights(flat).get('parts_table') ?? 0
    const groupedHeight = estimateBlockHeights(grouped).get('parts_table') ?? 0
    expect(groupedHeight).toBeGreaterThan(flatHeight)
  })
})

describe('the combined items table grouped by category', () => {
  it('puts the labor first under its own heading and numbers the lines in print order', () => {
    const { spec } = specWith((s) =>
      s.id === 'items_table'
        ? { visible: true, groupBy: 'category' }
        : s.id === 'parts_table' || s.id === 'labor_table'
          ? { visible: false }
          : undefined
    )
    const table = tableOf(spec, 'items_table')
    const headings = table.rows
      .filter((r: any) => r[table.groupKey])
      .map((r: any) => r[table.groupKey])
    expect(headings).toEqual(['Labor', BRAKES, CONSUMABLES])
    const numbers = table.rows.filter((r: any) => r.n).map((r: any) => r.n)
    expect(numbers).toEqual(['1', '2', '3', '4'])
    const laborSubtotal = table.rows.find((r: any) => r.desc === 'Labor subtotal')
    expect(laborSubtotal.total).toBe('€ 222.50')
  })
})

describe('the share sheet and the PDF print the grouped table alike', () => {
  it('both show the headings and subtotals', async () => {
    const { spec } = specWith((s) => (s.id === 'parts_table' ? { groupBy: 'category' } : undefined))
    const html = renderToStaticMarkup((<SpecSheet spec={spec} />) as any)
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .toLowerCase()
    const pdf = await renderToBuffer(
      (
        <Document>
          <SpecPdfPage spec={spec} />
        </Document>
      ) as any
    )
    const { text } = await extractText(new Uint8Array(pdf), { mergePages: true })
    const pdfText = String(text).replace(/\s+/g, ' ').toLowerCase()
    for (const needle of [
      `${BRAKES.toLowerCase()} subtotal`,
      `${CONSUMABLES.toLowerCase()} subtotal`,
      '245.50',
    ]) {
      expect(html).toContain(needle)
      expect(pdfText).toContain(needle)
    }
  }, 30000)
})
