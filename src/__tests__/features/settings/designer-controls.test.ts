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
