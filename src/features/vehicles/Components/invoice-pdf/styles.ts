import { StyleSheet } from '@react-pdf/renderer'

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

// Map any built-in PDF font to the registered Roboto font so that
// Cyrillic (and other non-Latin scripts) render correctly.
// Users still see "Helvetica" / "Times-Roman" etc. in settings,
// but the PDF always uses the Unicode-capable Roboto under the hood.
function resolveFont(font: string): string {
  return 'Roboto'
}

function resolveFontBold(font: string): string {
  return 'Roboto-Bold'
}

export function getFontBold(_font: string) {
  return resolveFontBold(_font)
}

/**
 * Geometry of the framed sheet: a colored band across the top and a rail down
 * the left edge, with the page inset far enough to clear both. The header pulls
 * itself back out to the sheet edge with negative margins, so these numbers and
 * that block have to move together.
 */
export const FRAMED = {
  bandHeight: 74,
  /** Drawn as the page's own left border, so it repeats on every page for free. */
  railWidth: 26,
  padTop: 92,
  /** Padding inside the rail. The sheet's left inset is this plus railWidth. */
  padLeft: 26,
  padRight: 34,
  padBottom: 54,
} as const

/**
 * Stacked hairlines standing in for a drop shadow, darkest first. react-pdf has
 * no box-shadow, so the falloff is drawn by hand.
 */
export const A4_HEIGHT = 841.89

export const SHADOW = ['rgba(0, 0, 0, 0.13)', 'rgba(0, 0, 0, 0.07)', 'rgba(0, 0, 0, 0.03)'] as const

/** Width of one shadow hairline, in points. */
export const SHADOW_STEP = 1.1

export function createStyles(
  primary: string,
  font: string,
  headerStyle = 'standard',
  background?: string,
  text?: string
) {
  const framed = headerStyle === 'framed'
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
          paddingLeft: FRAMED.padLeft,
          paddingRight: FRAMED.padRight,
          paddingBottom: FRAMED.padBottom,
          borderLeftWidth: FRAMED.railWidth,
          borderLeftColor: primary,
          fontSize: 10,
          fontFamily: resolved,
          color: ink,
          ...(background ? { backgroundColor: background } : {}),
        }
      : {
          padding: 40,
          fontSize: 10,
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
    brandName: { fontSize: 22, fontFamily: resolvedBold, color: primary },
    brandSub: { fontSize: 9, color: muted, marginTop: 2 },
    brandContact: { fontSize: 8, color: muted, marginTop: 1 },
    invoiceTitle: { fontSize: 18, fontFamily: resolvedBold, textAlign: 'right' as const },
    invoiceNumber: { fontSize: 9, color: muted, textAlign: 'right' as const, marginTop: 4 },
    infoRow: { flexDirection: 'row', gap: 20, marginBottom: 20 },
    infoBox: framed
      ? { padding: 8, borderWidth: 0.5, borderColor: dark, marginBottom: 4 }
      : { padding: 12, backgroundColor: grayLight, borderRadius: 4, marginBottom: 4 },
    infoLabel: {
      fontSize: 8,
      fontFamily: resolvedBold,
      color: primary,
      textTransform: 'uppercase' as const,
      marginBottom: 6,
    },
    infoText: { fontSize: 10, marginBottom: 2 },
    infoTextBold: { fontSize: 10, fontFamily: resolvedBold, marginBottom: 2 },
    infoTextSmall: { fontSize: 9, color: muted, marginBottom: 2 },
    sectionTitle: {
      fontSize: 12,
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
    tableCell: { fontSize: 9 },
    tableCellBold: { fontSize: 9, fontFamily: resolvedBold },
    tableHeaderCell: {
      fontSize: 8,
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
    totalLabel: { fontSize: 10, color: muted },
    totalValue: { fontSize: 10 },
    totalDivider: { borderTopWidth: 1, borderTopColor: primary, marginVertical: 4 },
    grandTotalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
    grandTotalLabel: { fontSize: 14, fontFamily: resolvedBold },
    grandTotalValue: { fontSize: 14, fontFamily: resolvedBold, color: primary },
    notesSection: framed
      ? { marginTop: 20, padding: 10, borderWidth: 0.5, borderColor: dark }
      : { marginTop: 20, padding: 12, backgroundColor: grayLight, borderRadius: 4 },
    notesLabel: {
      fontSize: 8,
      fontFamily: resolvedBold,
      color: primary,
      textTransform: 'uppercase' as const,
      marginBottom: 4,
    },
    notesText: { fontSize: 9, color: muted, lineHeight: 1.5 },
    attachmentFileName: { fontSize: 8, color: muted, marginTop: 4, marginBottom: 8 },
    footer: {
      position: 'absolute' as const,
      bottom: framed ? 22 : 30,
      left: framed ? FRAMED.padLeft : 40,
      right: framed ? FRAMED.padRight : 40,
      textAlign: 'center' as const,
      fontSize: 8,
      color: muted,
      paddingTop: 8,
      borderTopWidth: 0.5,
      borderTopColor: '#e5e7eb',
    },
  })
}
