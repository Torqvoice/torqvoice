import { StyleSheet } from '@react-pdf/renderer'
import type { Style } from '@react-pdf/types'
import { FRAMED, framedPageInset, type FrameSide } from './frame'

export { FRAMED, framedPageInset }
export type { FrameSide }

export const gray = '#6b7280'
export const grayLight = '#f3f4f6'
export const dark = '#111827'

export function hexToRgb(hex: string) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result
    ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) }
    : { r: 217, g: 119, b: 6 }
}

export function lightenColor(hex: string, factor: number = 0.9) {
  const { r, g, b } = hexToRgb(hex)
  return `rgb(${Math.round(r + (255 - r) * factor)}, ${Math.round(g + (255 - g) * factor)}, ${Math.round(b + (255 - b) * factor)})`
}

/** Blend two colors, `amount` of the way from `from` to `to`. */
export function mixColor(from: string, to: string, amount: number) {
  const a = hexToRgb(from)
  const b = hexToRgb(to)
  const at = (x: number, y: number) => Math.round(x + (y - x) * amount)
  return `rgb(${at(a.r, b.r)}, ${at(a.g, b.g)}, ${at(a.b, b.b)})`
}

/** The ink and its muted companion, for components that style text inline. */
export function inkColors(styles: Record<string, unknown>) {
  const read = (key: string) => (styles[key] as { color?: string } | undefined)?.color
  return {
    ink: read('ink') || dark,
    muted: read('muted') || gray,
  }
}

export function darkenColor(hex: string, factor: number = 0.3) {
  const { r, g, b } = hexToRgb(hex)
  return `rgb(${Math.round(r * (1 - factor))}, ${Math.round(g * (1 - factor))}, ${Math.round(b * (1 - factor))})`
}

/**
 * The stored font name mapped onto a family that is actually embedded.
 *
 * The names on the left are what settings has always saved, kept so nothing has
 * to migrate. Every family on the right covers Latin, Greek and Cyrillic; the
 * built-in PDF fonts those names refer to are Latin-1 only and would drop
 * Cyrillic entirely, which is why they are not used directly.
 */
const FONT_FAMILIES: Record<string, string> = {
  Helvetica: 'Roboto',
  Roboto: 'Roboto',
  'Times-Roman': 'Noto Serif',
  'Noto Serif': 'Noto Serif',
  Courier: 'Noto Sans Mono',
  'Noto Sans Mono': 'Noto Sans Mono',
  'Open Sans': 'Open Sans',
  'Lato': 'Lato',
  'Montserrat': 'Montserrat',
  'PT Sans': 'PT Sans',
}

/** The families a document can be set in. */
export const AVAILABLE_FONTS = [
  'Helvetica',
  'Times-Roman',
  'Courier',
  'Open Sans',
  'Lato',
  'Montserrat',
  'PT Sans',
] as const

function resolveFont(font: string): string {
  return FONT_FAMILIES[font] || 'Roboto'
}

function resolveFontBold(font: string): string {
  return `${resolveFont(font)}-Bold`
}

export function getFontBold(font: string) {
  return resolveFontBold(font)
}

/** The regular face of a font name, for components that style text inline. */
export function getFontRegular(font: string) {
  return resolveFont(font)
}

/**
 * Geometry of the framed sheet: a colored band across the top and a rail down
 * the left edge, with the page inset far enough to clear both. The header pulls
 * itself back out to the sheet edge with negative margins, so these numbers and
 * that block have to move together.
 */

/**
 * Stacked hairlines standing in for a drop shadow, darkest first. react-pdf has
 * no box-shadow, so the falloff is drawn by hand.
 */
export const A4_HEIGHT = 841.89

export const SHADOW = ['rgba(0, 0, 0, 0.13)', 'rgba(0, 0, 0, 0.07)', 'rgba(0, 0, 0, 0.03)'] as const

/** Width of one shadow hairline, in points. */
export const SHADOW_STEP = 1.1

/** The five appearance keys a layout can set on any one section. */
export interface SectionStyle {
  textColor?: string
  labelColor?: string
  backgroundColor?: string
  borderColor?: string
  fontSize?: number
  fontFamily?: string
}

/** Text entries that carry the regular face, and those that carry the bold. */
const REGULAR_ENTRIES = [
  'infoText',
  'infoTextSmall',
  'tableCell',
  'notesText',
  'totalLabel',
  'totalValue',
]
const BOLD_ENTRIES = [
  'infoTextBold',
  'infoLabel',
  'sectionTitle',
  'tableCellBold',
  'tableHeaderCell',
  'notesLabel',
  'grandTotalLabel',
  'grandTotalValue',
]

/**
 * The document's stylesheet with one section's overrides folded in.
 *
 * Sections already take their stylesheet as a prop, so handing them a derived
 * one styles them without any of them knowing this exists. The five keys are
 * mapped onto whichever entries carry that meaning for the section at hand: a
 * background is a panel fill on a detail block and the bar behind the column
 * headings on a table.
 */
export function withSectionStyle(
  base: Record<string, Style>,
  style?: SectionStyle
): Record<string, Style> {
  if (!style) return base
  const out: Record<string, Style> = { ...base }
  const set = (key: string, patch: Style) => {
    if (out[key]) out[key] = { ...out[key], ...patch }
  }

  if (style.textColor) {
    for (const key of [
      'infoText',
      'infoTextBold',
      'infoTextSmall',
      'tableCell',
      'tableCellBold',
      'notesText',
      'totalLabel',
      'totalValue',
      // The letterhead's own body lines, so styling the header section is not
      // the one selection in the designer that does nothing.
      'brandSub',
      'brandContact',
    ]) {
      set(key, { color: style.textColor })
    }
  }

  if (style.labelColor) {
    // A section's heading: the company name is the letterhead's.
    for (const key of ['infoLabel', 'sectionTitle', 'tableHeaderCell', 'notesLabel', 'brandName']) {
      set(key, { color: style.labelColor })
    }
  }

  if (style.backgroundColor) {
    for (const key of ['infoBox', 'tableHeader', 'notesSection', 'totalsBox']) {
      set(key, { backgroundColor: style.backgroundColor })
    }
  }

  if (style.borderColor) {
    // A border color implies a border: a workshop that picks one on a panel
    // that had none means it wants to see it.
    const width = (key: string, fallback: number) =>
      (out[key] as { borderWidth?: number })?.borderWidth || fallback
    set('infoBox', { borderColor: style.borderColor, borderWidth: width('infoBox', 0.5) })
    set('notesSection', { borderColor: style.borderColor, borderWidth: width('notesSection', 0.5) })
    set('totalsBox', { borderColor: style.borderColor, borderWidth: width('totalsBox', 1) })
    set('tableRow', { borderBottomColor: style.borderColor })
  }

  if (style.fontFamily) {
    for (const key of REGULAR_ENTRIES) set(key, { fontFamily: resolveFont(style.fontFamily) })
    for (const key of BOLD_ENTRIES) set(key, { fontFamily: resolveFontBold(style.fontFamily) })
  }

  if (style.fontSize) {
    const size = style.fontSize
    const step = (delta: number) => Math.max(5, size + delta)
    set('infoText', { fontSize: size })
    set('infoTextBold', { fontSize: size })
    set('infoTextSmall', { fontSize: step(-1) })
    set('tableCell', { fontSize: step(-1) })
    set('tableCellBold', { fontSize: step(-1) })
    set('tableHeaderCell', { fontSize: step(-2) })
    set('notesText', { fontSize: step(-1) })
    set('totalLabel', { fontSize: size })
    set('totalValue', { fontSize: size })
    set('sectionTitle', { fontSize: step(2) })
  }

  return out
}

/** Whole-sheet appearance, applied once over the document's stylesheet. */
export interface DocumentStyle {
  fontSize?: number
  rowPadding?: number
  margin?: number
  stripes?: boolean
  stripeColor?: string
  accentColor?: string
  fontFamily?: string
}

/**
 * The stylesheet with the whole sheet's overrides folded in.
 *
 * The framed sheet keeps its own top and left padding: those are not margins,
 * they are the room the band and the rail occupy, and shrinking them would put
 * the text under the frame.
 */
export function withDocumentStyle(
  base: Record<string, Style>,
  doc?: DocumentStyle,
  framed = false,
  frameSide: FrameSide = 'left'
): Record<string, Style> {
  if (!doc) return base
  const out: Record<string, Style> = { ...base }
  const set = (key: string, patch: Style) => {
    if (out[key]) out[key] = { ...out[key], ...patch }
  }

  if (doc.margin) {
    set('page', framed ? framedPageInset(doc.margin, frameSide) : { padding: doc.margin })
    set(
      'footer',
      framed
        ? frameSide === 'right'
          ? { left: doc.margin }
          : { right: doc.margin }
        : { left: doc.margin, right: doc.margin }
    )
  }

  if (doc.fontFamily) {
    set('page', { fontFamily: resolveFont(doc.fontFamily) })
    for (const key of REGULAR_ENTRIES) set(key, { fontFamily: resolveFont(doc.fontFamily) })
    for (const key of BOLD_ENTRIES) set(key, { fontFamily: resolveFontBold(doc.fontFamily) })
  }

  if (doc.fontSize) {
    const size = doc.fontSize
    const step = (delta: number) => Math.max(5, size + delta)
    set('page', { fontSize: size })
    set('infoText', { fontSize: size })
    set('infoTextBold', { fontSize: size })
    set('infoTextSmall', { fontSize: step(-1) })
    set('tableCell', { fontSize: step(-1) })
    set('tableCellBold', { fontSize: step(-1) })
    set('tableHeaderCell', { fontSize: step(-2) })
    set('notesText', { fontSize: step(-1) })
    set('totalLabel', { fontSize: size })
    set('totalValue', { fontSize: size })
    set('sectionTitle', { fontSize: step(2) })
    set('grandTotalLabel', { fontSize: step(4) })
    set('grandTotalValue', { fontSize: step(4) })
  }

  if (doc.rowPadding !== undefined) {
    set('tableRow', { paddingVertical: doc.rowPadding })
    set('tableHeader', { paddingVertical: Math.max(2, doc.rowPadding + 1) })
  }

  if (doc.stripes === false) {
    out.tableRowAlt = {}
  } else if (doc.stripeColor) {
    out.tableRowAlt = { backgroundColor: doc.stripeColor }
  }

  if (doc.accentColor) {
    set('infoLabel', { color: doc.accentColor })
    set('notesLabel', { color: doc.accentColor })
    set('totalDivider', { borderTopColor: doc.accentColor })
    set('grandTotalValue', { color: doc.accentColor })
  }

  return out
}

/**
 * The size body text is set in, and the size every other size is measured from.
 *
 * A document that has not chosen a size uses this one, so moving it moves the
 * whole sheet together rather than leaving a table at one scale and a heading
 * at another.
 */
export const BASE_FONT_SIZE = 11

/** A size relative to the body, so the relationships survive a change of base. */
const step = (delta: number) => Math.max(5, BASE_FONT_SIZE + delta)

export function createStyles(
  primary: string,
  font: string,
  headerStyle = 'standard',
  background?: string,
  text?: string,
  frameSide: FrameSide = 'left'
) {
  const framed = headerStyle === 'framed'
  const railOnRight = framed && frameSide === 'right'
  // Every piece of text takes its color from these two. The muted one is the
  // ink carried partway toward the sheet, so secondary lines stay secondary at
  // any ink: fixing them at one gray would leave them unreadable on a dark
  // sheet and mismatched on a tinted one. Rules, panel borders and the table
  // header bar are deliberately not text and keep their own color.
  const ink = text || dark
  const muted = text ? mixColor(ink, background || '#ffffff', 0.42) : gray
  const primaryLight = lightenColor(primary)
  const primaryDark = darkenColor(primary)
  const resolved = resolveFont(font)
  const resolvedBold = resolveFontBold(font)

  return StyleSheet.create({
    /** Read by components that style text inline; see inkColors. */
    ink: { color: ink },
    muted: { color: muted },
    page: framed
      ? {
          paddingTop: FRAMED.padTop,
          paddingLeft: railOnRight ? FRAMED.padRight : FRAMED.padLeft,
          paddingRight: railOnRight ? FRAMED.padLeft : FRAMED.padRight,
          paddingBottom: FRAMED.padBottom,
          ...(railOnRight
            ? { borderRightWidth: FRAMED.railWidth, borderRightColor: primary }
            : { borderLeftWidth: FRAMED.railWidth, borderLeftColor: primary }),
          fontSize: BASE_FONT_SIZE,
          fontFamily: resolved,
          color: ink,
          ...(background ? { backgroundColor: background } : {}),
        }
      : {
          padding: 40,
          fontSize: BASE_FONT_SIZE,
          fontFamily: resolved,
          color: ink,
          ...(background ? { backgroundColor: background } : {}),
        },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 30,
      paddingBottom: 15,
      borderBottomWidth: 3,
      borderBottomColor: primary,
    },
    brandName: { fontSize: step(11), fontFamily: resolvedBold, color: primary },
    brandSub: { fontSize: step(-1), color: muted, marginTop: 2 },
    brandContact: { fontSize: step(-2), color: muted, marginTop: 1 },
    invoiceTitle: { fontSize: step(7), fontFamily: resolvedBold, textAlign: 'right' as const },
    invoiceNumber: { fontSize: step(-1), color: muted, textAlign: 'right' as const, marginTop: 4 },
    infoRow: { flexDirection: 'row', gap: 20, marginBottom: 20 },
    infoBox: framed
      ? { padding: 8, borderWidth: 0.5, borderColor: dark, marginBottom: 4 }
      : { padding: 12, backgroundColor: grayLight, borderRadius: 4, marginBottom: 4 },
    infoLabel: {
      fontSize: step(-2),
      fontFamily: resolvedBold,
      color: primary,
      textTransform: 'uppercase' as const,
      marginBottom: 6,
    },
    infoText: { fontSize: step(0), marginBottom: 2 },
    infoTextBold: { fontSize: step(0), fontFamily: resolvedBold, marginBottom: 2 },
    infoTextSmall: { fontSize: step(-1), color: muted, marginBottom: 2 },
    sectionTitle: {
      fontSize: step(2),
      fontFamily: resolvedBold,
      marginBottom: 8,
      marginTop: 16,
      color: ink,
    },
    table: { marginBottom: 4 },
    tableHeader: framed
      ? {
          flexDirection: 'row',
          backgroundColor: dark,
          paddingVertical: 5,
          paddingHorizontal: 8,
        }
      : {
          flexDirection: 'row',
          backgroundColor: primaryLight,
          paddingVertical: 6,
          paddingHorizontal: 8,
          borderRadius: 2,
        },
    tableRow: {
      flexDirection: 'row',
      paddingVertical: 5,
      paddingHorizontal: 8,
      borderBottomWidth: 0.5,
      borderBottomColor: '#e5e7eb',
    },
    /** Banding behind alternate rows. An empty background turns it off. */
    tableRowAlt: { backgroundColor: grayLight },
    tableCell: { fontSize: step(-1) },
    tableCellBold: { fontSize: step(-1), fontFamily: resolvedBold },
    tableHeaderCell: {
      fontSize: step(-2),
      fontFamily: resolvedBold,
      color: framed ? '#ffffff' : primaryDark,
    },
    totalsBox: framed
      ? {
          marginTop: 16,
          marginLeft: 'auto',
          width: 250,
          borderWidth: 1,
          borderColor: dark,
          paddingHorizontal: 10,
          paddingVertical: 6,
        }
      : { marginTop: 16, marginLeft: 'auto', width: 250 },
    totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
    totalLabel: { fontSize: step(0), color: muted },
    totalValue: { fontSize: step(0) },
    totalDivider: { borderTopWidth: 1, borderTopColor: primary, marginVertical: 4 },
    grandTotalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
    grandTotalLabel: { fontSize: step(4), fontFamily: resolvedBold },
    grandTotalValue: { fontSize: step(4), fontFamily: resolvedBold, color: primary },
    notesSection: framed
      ? { marginTop: 20, padding: 10, borderWidth: 0.5, borderColor: dark }
      : { marginTop: 20, padding: 12, backgroundColor: grayLight, borderRadius: 4 },
    notesLabel: {
      fontSize: step(-2),
      fontFamily: resolvedBold,
      color: primary,
      textTransform: 'uppercase' as const,
      marginBottom: 4,
    },
    notesText: { fontSize: step(-1), color: muted, lineHeight: 1.5 },
    attachmentFileName: { fontSize: step(-2), color: muted, marginTop: 4, marginBottom: 8 },
    footer: {
      position: 'absolute' as const,
      bottom: framed ? 22 : 30,
      left: framed ? (railOnRight ? FRAMED.padRight : FRAMED.padLeft) : 40,
      right: framed ? (railOnRight ? FRAMED.padLeft : FRAMED.padRight) : 40,
      textAlign: 'center' as const,
      fontSize: step(-2),
      color: muted,
      paddingTop: 8,
      borderTopWidth: 0.5,
      borderTopColor: '#e5e7eb',
    },
  })
}
