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

export function darkenColor(hex: string, factor: number = 0.3) {
  const { r, g, b } = hexToRgb(hex)
  return `rgb(${Math.round(r * (1 - factor))}, ${Math.round(g * (1 - factor))}, ${Math.round(b * (1 - factor))})`
}

export function getFontBold(font: string) {
  const boldMap: Record<string, string> = {
    'Times-Roman': 'Times-Bold',
  }
  return boldMap[font] || `${font}-Bold`
}

export function createStyles(primary: string, font: string) {
  const primaryLight = lightenColor(primary)
  const primaryDark = darkenColor(primary)
  const fontBold = getFontBold(font)

  return StyleSheet.create({
    page: { padding: 40, fontSize: 10, fontFamily: font, color: dark },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 30,
      paddingBottom: 15,
      borderBottomWidth: 3,
      borderBottomColor: primary,
    },
    brandName: { fontSize: 22, fontFamily: fontBold, color: primary },
    brandSub: { fontSize: 9, color: gray, marginTop: 2 },
    brandContact: { fontSize: 8, color: gray, marginTop: 1 },
    invoiceTitle: { fontSize: 18, fontFamily: fontBold, textAlign: 'right' as const },
    invoiceNumber: { fontSize: 9, color: gray, textAlign: 'right' as const, marginTop: 4 },
    infoRow: { flexDirection: 'row', gap: 20, marginBottom: 20 },
    infoBox: { flex: 1, padding: 12, backgroundColor: grayLight, borderRadius: 4 },
    infoLabel: {
      fontSize: 8,
      fontFamily: fontBold,
      color: primary,
      textTransform: 'uppercase' as const,
      marginBottom: 6,
    },
    infoText: { fontSize: 10, marginBottom: 2 },
    infoTextBold: { fontSize: 10, fontFamily: fontBold, marginBottom: 2 },
    infoTextSmall: { fontSize: 9, color: gray, marginBottom: 2 },
    sectionTitle: {
      fontSize: 12,
      fontFamily: fontBold,
      marginBottom: 8,
      marginTop: 16,
      color: dark,
    },
    table: { marginBottom: 4 },
    tableHeader: {
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
    tableCellBold: { fontSize: 9, fontFamily: fontBold },
    tableHeaderCell: { fontSize: 8, fontFamily: fontBold, color: primaryDark },
    totalsBox: { marginTop: 16, marginLeft: 'auto', width: 220 },
    totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
    totalLabel: { fontSize: 10, color: gray },
    totalValue: { fontSize: 10 },
    totalDivider: { borderTopWidth: 1, borderTopColor: primary, marginVertical: 4 },
    grandTotalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
    grandTotalLabel: { fontSize: 14, fontFamily: fontBold },
    grandTotalValue: { fontSize: 14, fontFamily: fontBold, color: primary },
    notesSection: { marginTop: 20, padding: 12, backgroundColor: grayLight, borderRadius: 4 },
    notesLabel: {
      fontSize: 8,
      fontFamily: fontBold,
      color: primary,
      textTransform: 'uppercase' as const,
      marginBottom: 4,
    },
    notesText: { fontSize: 9, color: gray, lineHeight: 1.5 },
    attachmentFileName: { fontSize: 8, color: gray, marginTop: 4, marginBottom: 8 },
    footer: {
      position: 'absolute' as const,
      bottom: 30,
      left: 40,
      right: 40,
      textAlign: 'center' as const,
      fontSize: 8,
      color: gray,
      paddingTop: 8,
      borderTopWidth: 0.5,
      borderTopColor: '#e5e7eb',
    },
  })
}
