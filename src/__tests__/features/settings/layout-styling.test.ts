/**
 * Appearance lives in the layout, not in settings keys.
 *
 * Every option added the old way cost a settings key, plumbing through each of
 * the six PDF builders, a control, and twelve translations. These two helpers
 * are the whole mechanism instead: five keys on a section, six on the sheet,
 * folded into the stylesheet the sections already receive.
 */
import { describe, it, expect } from 'vitest'
import {
  createStyles,
  withSectionStyle,
  withDocumentStyle,
} from '@/features/vehicles/Components/invoice-pdf/styles'

const base = () => createStyles('#d97706', 'Helvetica')
const read = (styles: Record<string, unknown>, key: string, prop = 'color') =>
  (styles[key] as Record<string, unknown>)[prop]

describe('section styling', () => {
  it('changes nothing without a style', () => {
    const styles = base()
    expect(withSectionStyle(styles, undefined)).toBe(styles)
  })

  it('maps one key onto every entry that carries its meaning', () => {
    const styled = withSectionStyle(base(), {
      textColor: '#111111',
      labelColor: '#222222',
      backgroundColor: '#333333',
      borderColor: '#444444',
    })

    for (const key of ['infoText', 'tableCell', 'notesText', 'totalValue']) {
      expect(read(styled, key), key).toBe('#111111')
    }
    // A table's column headings are its label, the same way a panel's heading is.
    for (const key of ['infoLabel', 'sectionTitle', 'tableHeaderCell']) {
      expect(read(styled, key), key).toBe('#222222')
    }
    // A background is a panel fill on a detail block and the bar behind the
    // headings on a table.
    for (const key of ['infoBox', 'tableHeader', 'totalsBox']) {
      expect(read(styled, key, 'backgroundColor'), key).toBe('#333333')
    }
    expect(read(styled, 'infoBox', 'borderColor')).toBe('#444444')
    expect(read(styled, 'tableRow', 'borderBottomColor')).toBe('#444444')
  })

  it('gives a border to a panel that had none when one is asked for', () => {
    const styled = withSectionStyle(base(), { borderColor: '#444444' })
    expect(read(styled, 'infoBox', 'borderWidth')).toBeGreaterThan(0)
  })

  it('leaves the rest of the sheet alone', () => {
    const styled = withSectionStyle(base(), { textColor: '#111111' })
    expect(read(styled, 'page')).toBe(read(base(), 'page'))
  })
})

describe('document styling', () => {
  it('changes nothing without a style', () => {
    const styles = base()
    expect(withDocumentStyle(styles, undefined)).toBe(styles)
  })

  it('scales the whole sheet from one size', () => {
    const styled = withDocumentStyle(base(), { fontSize: 8 })
    expect(read(styled, 'page', 'fontSize')).toBe(8)
    expect(read(styled, 'tableCell', 'fontSize')).toBe(7)
    expect(read(styled, 'sectionTitle', 'fontSize')).toBe(10)
  })

  it('never scales text below legibility', () => {
    const styled = withDocumentStyle(base(), { fontSize: 6 })
    expect(read(styled, 'tableHeaderCell', 'fontSize')).toBe(5)
  })

  it('turns banding off, or recolors it', () => {
    expect(withDocumentStyle(base(), { stripes: false }).tableRowAlt).toEqual({})
    expect(
      read(withDocumentStyle(base(), { stripeColor: '#eef2ff' }), 'tableRowAlt', 'backgroundColor')
    ).toBe('#eef2ff')
  })

  it('keeps the framed sheet clear of its own frame', () => {
    const framed = createStyles('#d97706', 'Helvetica', 'framed')
    const tightened = withDocumentStyle(framed, { margin: 20 }, true)
    // The top and left are the room the band and rail occupy, not margins.
    expect(read(tightened, 'page', 'paddingTop')).toBe(read(framed, 'page', 'paddingTop'))
    expect(read(tightened, 'page', 'paddingLeft')).toBe(read(framed, 'page', 'paddingLeft'))
    expect(read(tightened, 'page', 'paddingRight')).toBe(20)
  })

  it('moves the accent off the primary color', () => {
    const styled = withDocumentStyle(base(), { accentColor: '#334155' })
    expect(read(styled, 'infoLabel')).toBe('#334155')
    expect(read(styled, 'totalDivider', 'borderTopColor')).toBe('#334155')
  })
})
