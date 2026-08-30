/**
 * The designer's structure, guarded.
 *
 * The bug this file exists for happened repeatedly: a property is added, saved
 * and read back correctly, and the thing that draws it never looks at it. The
 * document model is the answer — one description, walked by renderers that know
 * nothing about invoices — and these are the properties that keep it that way.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const SCHEMA = readFileSync('src/features/settings/Schema/invoiceLayoutSchema.ts', 'utf8')
const SPEC = readFileSync('src/features/invoice-designer/Spec/buildSpec.ts', 'utf8')
const RENDER = readFileSync('src/features/invoice-designer/Render/renderHtml.tsx', 'utf8')
const CANVAS = readFileSync('src/features/invoice-designer/Render/SpecCanvas.tsx', 'utf8')
const INSPECTOR = readFileSync(
  'src/features/invoice-designer/Components/DesignerInspector.tsx',
  'utf8'
)
const SAMPLE = readFileSync('src/features/invoice-designer/Components/sample.ts', 'utf8')

const keysOf = (from: string, to: string) =>
  [...SCHEMA.slice(SCHEMA.indexOf(from), SCHEMA.indexOf(to)).matchAll(/^ {2}(\w+): z\./gm)].map(
    (m) => m[1]
  )

describe('the renderer knows nothing about invoices', () => {
  // This is the whole point of the model. A renderer that mentions a section by
  // name has started to be a second implementation of the document, which is
  // what drifted from the PDF and broke every time either was touched.
  const SECTION_NAMES = [
    'customer',
    'vehicle',
    'service',
    'items_table',
    'document_title',
    'totals',
    'findings',
    'warranty',
    'bank_account',
  ]

  it.each(SECTION_NAMES)('renderHtml does not mention %s', (name) => {
    expect(RENDER).not.toContain(name)
  })

  it('draws only the shapes the model defines', () => {
    for (const kind of ['stack', 'row', 'text', 'image', 'table', 'spacer']) {
      expect(RENDER).toContain(`case '${kind}'`)
    }
  })
})

describe('the generator covers what a layout can express', () => {
  it('has a value for every field a section can show', () => {
    const ids = new Set<string>()
    for (const list of [
      'BUILTIN_CUSTOMER_FIELDS',
      'BUILTIN_VEHICLE_FIELDS',
      'BUILTIN_SERVICE_FIELDS',
      'BUILTIN_HEADER_FIELDS',
      'BUILTIN_FOOTER_FIELDS',
      'BUILTIN_BANK_ACCOUNT_FIELDS',
    ]) {
      const start = SCHEMA.indexOf(`${list} = [`)
      const block = SCHEMA.slice(start, SCHEMA.indexOf('] as const', start))
      for (const m of block.matchAll(/id: '([a-z_]+)'/g)) ids.add(m[1])
    }
    // `logo` comes from the workshop's upload rather than a sample string.
    const missing = [...ids].filter((id) => id !== 'logo' && !SAMPLE.includes(`${id}:`))
    expect(missing).toEqual([])
  })

  it('asks each section which fields it shows', () => {
    expect(SPEC).toContain('sectionFields')
    expect(SPEC).toContain('getBuiltinFieldsForSection')
  })

  it('reads every appearance key a section carries', () => {
    const missing = keysOf(
      'export const invoiceSectionStyleSchema',
      'export const invoiceSectionSchema'
    ).filter((key) => !SPEC.includes(key))
    expect(missing).toEqual([])
  })

  it('reads every appearance key the sheet carries', () => {
    const missing = keysOf(
      'export const invoiceDocumentStyleSchema',
      'export const invoiceLayoutConfigSchema'
    ).filter((key) => !SPEC.includes(key) && !INSPECTOR.includes(key))
    expect(missing).toEqual([])
  })
})

describe('the inspector can reach every property', () => {
  it('offers everything a section carries', () => {
    const missing = keysOf('export const invoiceSectionSchema', 'export const anchorSchema')
      .filter((key) => !['id', 'order'].includes(key))
      .filter((key) => !INSPECTOR.includes(key))
    expect(missing).toEqual([])
  })
})

describe('the sheet is a sheet', () => {
  it('is A4 and stays A4', () => {
    // Base size and margins change how much fits on the page, never its size.
    expect(SPEC).toContain('width: 595')
    expect(SPEC).toContain('height: 842')
    expect(CANVAS).toContain('spec.page.height')
  })

  it('holds a printed footer against the foot of the sheet', () => {
    expect(SPEC).toContain("mode: 'pinned'")
    expect(CANVAS).toContain('pinned')
  })

  it('positions anything that has been dragged, and snaps it to what is there', () => {
    expect(CANVAS).toContain('guidesFor')
    expect(CANVAS).toContain('snapTo')
    expect(SPEC).toContain("mode: 'anchored'")
  })
})
