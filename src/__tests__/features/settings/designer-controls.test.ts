/**
 * Every control in the designer has to reach the sheet.
 *
 * The failure this guards has happened repeatedly: a control is added, saved
 * and read back correctly, and the thing it is supposed to change never looks
 * at it. Text colour stopped at the first line of a panel, the header section
 * was excluded from styling altogether, and the canvas ignored the logo, the
 * frame line and its shadow.
 *
 * Source-level rather than behavioural, deliberately: it is cheap, and it fails
 * the moment a control is wired to state but not to a renderer.
 */
import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

const CANVAS = readFileSync('src/features/invoice-designer/Components/DesignerCanvas.tsx', 'utf8')
const INVOICE_PDF = readFileSync(
  'src/features/vehicles/Components/invoice-pdf/InvoicePDF.tsx',
  'utf8'
)
const STYLES = readFileSync('src/features/vehicles/Components/invoice-pdf/styles.ts', 'utf8')

/** What the canvas must read for each control the inspector offers. */
const CANVAS_READS = {
  'section visibility': 'visible',
  'section column': 'group.left',
  'section box': 'boxed',
  'section text color': 'look.text',
  'section label color': 'look.label',
  'section fill': 'look.fill',
  'section border': 'look.border',
  'section size': 'look.size',
  'section font': 'look.font',
  'document accent': 'theme.accent',
  'document banding': 'theme.stripes',
  'document band color': 'theme.stripeColor',
  'document margin': 'theme.margin',
  'document row height': 'theme.rowPadding',
  'document size': 'theme.baseSize',
  'document font': 'theme.fontFamily',
  'logo size': 'logoSize',
  'frame line': 'frameBorderColor',
  'frame shadow': 'frameShadow',
  'company name color': 'companyText',
  'header style': 'headerStyle',
  'primary color': 'theme.primary',
  'background color': 'theme.background',
  'text color': 'theme.text',
}

describe('designer controls reach the canvas', () => {
  it.each(Object.entries(CANVAS_READS))('%s', (_name, token) => {
    expect(CANVAS).toContain(token)
  })

  it('resolves a section look rather than reading the theme directly in bodies', () => {
    // A body that reaches past its own look is how "text colour changes only
    // some of the text" happens.
    const bodies = CANVAS.slice(
      CANVAS.indexOf('function SectionBody'),
      CANVAS.indexOf('export function DesignerCanvas')
    )
    expect(bodies).not.toContain('theme.muted')
    expect(bodies).not.toContain('theme.text')
  })
})

const INSPECTOR = readFileSync(
  'src/features/invoice-designer/Components/DesignerInspector.tsx',
  'utf8'
)

describe('the designer can reach everything the layout can express', () => {
  const SCHEMA = readFileSync('src/features/settings/Schema/invoiceLayoutSchema.ts', 'utf8')

  const keysOf = (from: string, to: string) =>
    [...SCHEMA.slice(SCHEMA.indexOf(from), SCHEMA.indexOf(to)).matchAll(/^ {2}(\w+): z\./gm)].map(
      (m) => m[1]
    )

  it('offers every property a section carries', () => {
    // `fields` was the one this caught: no way to turn the logo off, and so no
    // way to print the company name instead.
    const missing = keysOf(
      'export const invoiceSectionSchema',
      'export const invoiceDocumentStyleSchema'
    )
      .filter((key) => !['id', 'order'].includes(key))
      .filter((key) => !INSPECTOR.includes(key))
    expect(missing).toEqual([])
  })

  it('offers every appearance key a section carries', () => {
    const missing = keysOf(
      'export const invoiceSectionStyleSchema',
      'export const invoiceSectionSchema'
    ).filter((key) => !INSPECTOR.includes(key))
    expect(missing).toEqual([])
  })

  it('offers every appearance key the sheet carries', () => {
    const missing = keysOf(
      'export const invoiceDocumentStyleSchema',
      'export const invoiceLayoutConfigSchema'
    ).filter((key) => !INSPECTOR.includes(key))
    expect(missing).toEqual([])
  })
})

describe('the canvas renders from the layout, not from prose', () => {
  const SAMPLE = readFileSync('src/features/invoice-designer/Components/sample.ts', 'utf8')

  it('reads which fields a section shows', () => {
    // Turning a field on used to change nothing, because the canvas held a
    // paragraph per section rather than a value per field.
    expect(CANVAS).toContain('visibleFields')
    expect(CANVAS).toContain('getBuiltinFieldsForSection')
  })

  it('has a value for every field a layout can show', () => {
    const schema = readFileSync('src/features/settings/Schema/invoiceLayoutSchema.ts', 'utf8')
    const ids = new Set<string>()
    for (const list of [
      'BUILTIN_CUSTOMER_FIELDS',
      'BUILTIN_VEHICLE_FIELDS',
      'BUILTIN_SERVICE_FIELDS',
      'BUILTIN_HEADER_FIELDS',
      'BUILTIN_FOOTER_FIELDS',
      'BUILTIN_BANK_ACCOUNT_FIELDS',
    ]) {
      const block = schema.slice(
        schema.indexOf(`${list} = [`),
        schema.indexOf('] as const', schema.indexOf(`${list} = [`))
      )
      for (const m of block.matchAll(/id: '([a-z_]+)'/g)) ids.add(m[1])
    }
    // `logo` is drawn from the workshop's upload rather than a sample string.
    const missing = [...ids].filter((id) => id !== 'logo' && !SAMPLE.includes(`${id}:`))
    expect(missing).toEqual([])
  })

  it('draws the frame as page chrome, on either edge', () => {
    // The band and the rail are one shape. Drawn separately they came apart,
    // and left a seam of paper between them.
    expect(CANVAS).toContain('frameChrome')
    expect(CANVAS).toContain('railEdge')
  })
})

describe('every section is styleable in the PDF', () => {
  it('hands each one its own derived stylesheet', () => {
    const map = INVOICE_PDF.slice(
      INVOICE_PDF.indexOf('const sectionMap'),
      INVOICE_PDF.indexOf('// Use column-based grouping')
    )
    // Nothing inside the section map may take the document stylesheet raw, or
    // that section silently ignores whatever the layout sets on it.
    expect(map).not.toContain('styles={styles}')
  })

  it('includes the letterhead and the title block', () => {
    expect(INVOICE_PDF).toContain("stylesFor('header')")
    expect(INVOICE_PDF).toContain("stylesFor('document_title')")
  })

  it('maps a section label onto the letterhead name, not only panel headings', () => {
    expect(STYLES).toContain('brandName')
    expect(STYLES).toContain('brandSub')
  })
})
