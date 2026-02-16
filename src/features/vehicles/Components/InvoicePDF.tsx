import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer'
import { formatCurrency, getCurrencySymbol, formatDateForPdf, DEFAULT_DATE_FORMAT } from '@/lib/format'

interface TemplateConfig {
  primaryColor?: string
  fontFamily?: string
  showLogo?: boolean
  showCompanyName?: boolean
  headerStyle?: string
}

function hexToRgb(hex: string) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result
    ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) }
    : { r: 217, g: 119, b: 6 }
}

function lightenColor(hex: string, factor: number = 0.9) {
  const { r, g, b } = hexToRgb(hex)
  return `rgb(${Math.round(r + (255 - r) * factor)}, ${Math.round(g + (255 - g) * factor)}, ${Math.round(b + (255 - b) * factor)})`
}

function darkenColor(hex: string, factor: number = 0.3) {
  const { r, g, b } = hexToRgb(hex)
  return `rgb(${Math.round(r * (1 - factor))}, ${Math.round(g * (1 - factor))}, ${Math.round(b * (1 - factor))})`
}

const gray = '#6b7280'
const grayLight = '#f3f4f6'
const dark = '#111827'

function createStyles(primary: string, font: string) {
  const primaryLight = lightenColor(primary)
  const primaryDark = darkenColor(primary)
  const boldMap: Record<string, string> = {
    'Times-Roman': 'Times-Bold',
  }
  const fontBold = boldMap[font] || `${font}-Bold`

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
    attachmentImage: { maxWidth: 250, maxHeight: 200, marginTop: 8, borderRadius: 4 },
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

interface InvoiceData {
  id: string
  title: string
  description: string | null
  type: string
  serviceDate: Date
  shopName: string | null
  techName: string | null
  mileage: number | null
  diagnosticNotes: string | null
  invoiceNotes: string | null
  subtotal: number
  taxRate: number
  taxAmount: number
  totalAmount: number
  cost: number
  invoiceNumber: string | null
  discountType?: string | null
  discountValue?: number
  discountAmount?: number
  partItems: {
    partNumber: string | null
    name: string
    quantity: number
    unitPrice: number
    total: number
  }[]
  laborItems: {
    description: string
    hours: number
    rate: number
    total: number
  }[]
  vehicle: {
    make: string
    model: string
    year: number
    vin: string | null
    licensePlate: string | null
    mileage: number
    customer: {
      name: string
      email: string | null
      phone: string | null
      address: string | null
      company: string | null
    } | null
  }
}

interface WorkshopInfo {
  name: string
  address: string
  phone: string
  email: string
}

interface InvoiceSettingsProps {
  bankAccount?: string
  orgNumber?: string
  paymentTerms?: string
  footerNote?: string
  showBankAccount?: boolean
  showOrgNumber?: boolean
  dueDays?: number
  currencyCode?: string
  unitSystem?: string
  dateFormat?: string
  timezone?: string
}

interface PaymentSummary {
  totalPaid: number
  payments: { amount: number; date: string; method: string }[]
}

interface ImageAttachment {
  fileName: string
  dataUri: string
  description?: string
}

interface OtherAttachment {
  fileName: string
  fileType: string
}

export function InvoicePDF({
  data,
  workshop,
  invoiceSettings,
  paymentSummary,
  imageAttachments = [],
  otherAttachments = [],
  pdfAttachmentNames = [],
  logoDataUri,
  template,
  torqvoiceLogoDataUri,
}: {
  data: InvoiceData
  workshop?: WorkshopInfo
  invoiceSettings?: InvoiceSettingsProps
  paymentSummary?: PaymentSummary
  imageAttachments?: ImageAttachment[]
  otherAttachments?: OtherAttachment[]
  pdfAttachmentNames?: string[]
  logoDataUri?: string
  template?: TemplateConfig
  torqvoiceLogoDataUri?: string
}) {
  const primaryColor = template?.primaryColor || '#d97706'
  const fontFamily = template?.fontFamily || 'Helvetica'
  const showLogo = template?.showLogo !== false
  const showCompanyName = template?.showCompanyName !== false
  const styles = createStyles(primaryColor, fontFamily)

  const cs = getCurrencySymbol(invoiceSettings?.currencyCode || 'USD')
  const cc = invoiceSettings?.currencyCode || 'USD'
  const vehicleName = `${data.vehicle.year} ${data.vehicle.make} ${data.vehicle.model}`
  const partsSubtotal = data.partItems.reduce((sum, p) => sum + p.total, 0)
  const laborSubtotal = data.laborItems.reduce((sum, l) => sum + l.total, 0)
  const displayTotal = data.totalAmount > 0 ? data.totalAmount : data.cost
  const invoiceNum = data.invoiceNumber || `INV-${data.id.slice(-8).toUpperCase()}`
  const df = invoiceSettings?.dateFormat || DEFAULT_DATE_FORMAT
  const tz = invoiceSettings?.timezone || undefined
  const serviceDate = formatDateForPdf(data.serviceDate, df, tz)

  const dueDays = invoiceSettings?.dueDays || 0
  const dueDate =
    dueDays > 0
      ? formatDateForPdf(
          new Date(new Date(data.serviceDate).getTime() + dueDays * 86400000),
          df,
          tz,
        )
      : null

  const balanceDue = paymentSummary ? displayTotal - paymentSummary.totalPaid : displayTotal
  const isPaidInFull = paymentSummary && paymentSummary.totalPaid >= displayTotal

  const shopDisplayName = workshop?.name || data.shopName || 'Torqvoice'
  const hasAttachments = imageAttachments.length > 0 || otherAttachments.length > 0
  const fontBold = fontFamily === 'Times-Roman' ? 'Times-Bold' : `${fontFamily}-Bold`

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            {showLogo && logoDataUri && (
              <Image
                src={logoDataUri}
                style={{
                  maxWidth: 150,
                  maxHeight: 60,
                  marginBottom: 6,
                  borderRadius: 4,
                  objectFit: 'contain',
                  objectPosition: 'left',
                }}
              />
            )}
            {showCompanyName && <Text style={styles.brandName}>{shopDisplayName}</Text>}
            {workshop?.address ? (
              <Text style={styles.brandSub}>{workshop.address}</Text>
            ) : (
              <Text style={styles.brandSub}>Professional Workshop Management</Text>
            )}
            {workshop?.phone && <Text style={styles.brandContact}>Tel: {workshop.phone}</Text>}
            {workshop?.email && <Text style={styles.brandContact}>{workshop.email}</Text>}
            {invoiceSettings?.showOrgNumber && invoiceSettings?.orgNumber && (
              <Text style={styles.brandContact}>Org: {invoiceSettings.orgNumber}</Text>
            )}
            {torqvoiceLogoDataUri && (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                  justifyContent: 'flex-start',
                  gap: 3,
                  marginBottom: 6,
                }}
              >
                <Image src={torqvoiceLogoDataUri} style={{ width: 16, height: 16 }} />
                <Text style={{ fontSize: 9, fontFamily: fontBold, color: gray }}>Torqvoice</Text>
              </View>
            )}
          </View>
          <View>
            <Text style={styles.invoiceTitle}>INVOICE</Text>
            <Text style={styles.invoiceNumber}>{invoiceNum}</Text>
            <Text style={styles.invoiceNumber}>{serviceDate}</Text>
            {dueDate && <Text style={styles.invoiceNumber}>Due: {dueDate}</Text>}
          </View>
        </View>

        {/* Customer & Vehicle Info */}
        <View style={styles.infoRow}>
          {data.vehicle.customer && (
            <View style={styles.infoBox}>
              <Text style={styles.infoLabel}>Bill To</Text>
              <Text style={styles.infoTextBold}>{data.vehicle.customer.name}</Text>
              {data.vehicle.customer.company && (
                <Text style={styles.infoText}>{data.vehicle.customer.company}</Text>
              )}
              {data.vehicle.customer.address && (
                <Text style={styles.infoTextSmall}>{data.vehicle.customer.address}</Text>
              )}
              {data.vehicle.customer.email && (
                <Text style={styles.infoTextSmall}>{data.vehicle.customer.email}</Text>
              )}
              {data.vehicle.customer.phone && (
                <Text style={styles.infoTextSmall}>{data.vehicle.customer.phone}</Text>
              )}
            </View>
          )}
          <View style={styles.infoBox}>
            <Text style={styles.infoLabel}>Vehicle</Text>
            <Text style={styles.infoTextBold}>{vehicleName}</Text>
            {data.vehicle.vin && <Text style={styles.infoTextSmall}>VIN: {data.vehicle.vin}</Text>}
            {data.vehicle.licensePlate && (
              <Text style={styles.infoTextSmall}>Plate: {data.vehicle.licensePlate}</Text>
            )}
            {data.mileage && (
              <Text style={styles.infoTextSmall}>
                Mileage: {data.mileage.toLocaleString()}{' '}
                {invoiceSettings?.unitSystem === 'metric' ? 'km' : 'mi'}
              </Text>
            )}
          </View>
          <View style={styles.infoBox}>
            <Text style={styles.infoLabel}>Service</Text>
            <Text style={styles.infoTextBold}>{data.title}</Text>
            <Text style={styles.infoTextSmall}>Type: {data.type}</Text>
            {data.techName && <Text style={styles.infoTextSmall}>Tech: {data.techName}</Text>}
          </View>
        </View>

        {/* Parts Table */}
        {data.partItems.length > 0 && (
          <View>
            <Text style={styles.sectionTitle}>Parts</Text>
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={{ ...styles.tableHeaderCell, width: '15%' }}>Part #</Text>
                <Text style={{ ...styles.tableHeaderCell, width: '35%' }}>Description</Text>
                <Text style={{ ...styles.tableHeaderCell, width: '12%', textAlign: 'right' }}>
                  Qty
                </Text>
                <Text style={{ ...styles.tableHeaderCell, width: '18%', textAlign: 'right' }}>
                  Unit Price
                </Text>
                <Text style={{ ...styles.tableHeaderCell, width: '20%', textAlign: 'right' }}>
                  Total
                </Text>
              </View>
              {data.partItems.map((part, i) => (
                <View key={i} style={styles.tableRow}>
                  <Text style={{ ...styles.tableCell, width: '15%' }}>
                    {part.partNumber || '-'}
                  </Text>
                  <Text style={{ ...styles.tableCell, width: '35%' }}>{part.name}</Text>
                  <Text style={{ ...styles.tableCell, width: '12%', textAlign: 'right' }}>
                    {part.quantity}
                  </Text>
                  <Text style={{ ...styles.tableCell, width: '18%', textAlign: 'right' }}>
                    {formatCurrency(part.unitPrice, cc)}
                  </Text>
                  <Text style={{ ...styles.tableCellBold, width: '20%', textAlign: 'right' }}>
                    {formatCurrency(part.total, cc)}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Labor Table */}
        {data.laborItems.length > 0 && (
          <View>
            <Text style={styles.sectionTitle}>Labor</Text>
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={{ ...styles.tableHeaderCell, width: '45%' }}>Description</Text>
                <Text style={{ ...styles.tableHeaderCell, width: '15%', textAlign: 'right' }}>
                  Hours
                </Text>
                <Text style={{ ...styles.tableHeaderCell, width: '20%', textAlign: 'right' }}>
                  Rate
                </Text>
                <Text style={{ ...styles.tableHeaderCell, width: '20%', textAlign: 'right' }}>
                  Total
                </Text>
              </View>
              {data.laborItems.map((labor, i) => (
                <View key={i} style={styles.tableRow}>
                  <Text style={{ ...styles.tableCell, width: '45%' }}>{labor.description}</Text>
                  <Text style={{ ...styles.tableCell, width: '15%', textAlign: 'right' }}>
                    {labor.hours}
                  </Text>
                  <Text style={{ ...styles.tableCell, width: '20%', textAlign: 'right' }}>
                    {formatCurrency(labor.rate, cc)}/hr
                  </Text>
                  <Text style={{ ...styles.tableCellBold, width: '20%', textAlign: 'right' }}>
                    {formatCurrency(labor.total, cc)}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Invoice Notes */}
        {data.invoiceNotes && (
          <View style={styles.notesSection}>
            <Text style={styles.notesLabel}>Notes</Text>
            <Text style={styles.notesText}>{data.invoiceNotes}</Text>
          </View>
        )}

        {/* Totals */}
        <View style={styles.totalsBox}>
          {data.partItems.length > 0 && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Parts</Text>
              <Text style={styles.totalValue}>{formatCurrency(partsSubtotal, cc)}</Text>
            </View>
          )}
          {data.laborItems.length > 0 && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Labor</Text>
              <Text style={styles.totalValue}>{formatCurrency(laborSubtotal, cc)}</Text>
            </View>
          )}
          {data.subtotal > 0 && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Subtotal</Text>
              <Text style={styles.totalValue}>{formatCurrency(data.subtotal, cc)}</Text>
            </View>
          )}
          {(data.discountAmount ?? 0) > 0 && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>
                Discount{data.discountType === 'percentage' ? ` (${data.discountValue}%)` : ''}
              </Text>
              <Text style={{ ...styles.totalValue, color: '#dc2626' }}>
                {formatCurrency(-(data.discountAmount ?? 0), cc)}
              </Text>
            </View>
          )}
          {data.taxRate > 0 && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Tax ({data.taxRate}%)</Text>
              <Text style={styles.totalValue}>{formatCurrency(data.taxAmount, cc)}</Text>
            </View>
          )}
          <View style={styles.totalDivider} />
          {paymentSummary && paymentSummary.payments.length > 0 ? (
            <>
              {/* Smaller total when payments exist */}
              <View style={styles.totalRow}>
                <Text style={{ fontSize: 10, fontFamily: fontBold }}>Total</Text>
                <Text style={{ fontSize: 10, fontFamily: fontBold }}>
                  {formatCurrency(displayTotal, cc)}
                </Text>
              </View>
              <View style={{ ...styles.totalDivider, marginVertical: 6 }} />
              <Text style={{ fontSize: 9, fontFamily: fontBold, marginBottom: 4 }}>
                Payments Received
              </Text>
              {paymentSummary.payments.map((p, i) => (
                <View key={i} style={styles.totalRow}>
                  <Text style={{ fontSize: 8, color: gray }}>
                    {p.date} ({p.method})
                  </Text>
                  <Text style={{ fontSize: 9, color: '#059669' }}>
                    {formatCurrency(-p.amount, cc)}
                  </Text>
                </View>
              ))}
              <View
                style={{ borderTopWidth: 2, borderTopColor: primaryColor, marginVertical: 6 }}
              />
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  paddingVertical: 6,
                  backgroundColor: isPaidInFull ? '#f0fdf4' : lightenColor(primaryColor, 0.92),
                  marginHorizontal: -8,
                  paddingHorizontal: 8,
                  borderRadius: 3,
                }}
              >
                <Text style={{ fontSize: 16, fontFamily: fontBold }}>
                  {isPaidInFull ? 'PAID IN FULL' : 'Amount Due'}
                </Text>
                <Text
                  style={{
                    fontSize: 16,
                    fontFamily: fontBold,
                    color: isPaidInFull ? '#059669' : primaryColor,
                  }}
                >
                  {isPaidInFull ? '' : formatCurrency(balanceDue, cc)}
                </Text>
              </View>
            </>
          ) : (
            <View style={styles.grandTotalRow}>
              <Text style={styles.grandTotalLabel}>Total</Text>
              <Text style={styles.grandTotalValue}>{formatCurrency(displayTotal, cc)}</Text>
            </View>
          )}
        </View>

        {/* Torqvoice branding near totals */}
        {torqvoiceLogoDataUri && (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'flex-start',
              gap: 3,
              marginTop: 6,
            }}
          >
            <Text style={{ fontSize: 7, color: gray }}>Powered by</Text>
            <Image src={torqvoiceLogoDataUri} style={{ width: 12, height: 12 }} />
            <Text style={{ fontSize: 7, color: gray, fontFamily: fontBold }}>Torqvoice</Text>
          </View>
        )}

        {/* Payment Terms */}
        {invoiceSettings?.paymentTerms && (
          <View style={{ marginTop: 8 }}>
            <Text style={{ fontSize: 9, color: gray }}>
              Payment Terms: {invoiceSettings.paymentTerms}
            </Text>
          </View>
        )}

        {/* Bank Account / Til Konto */}
        {invoiceSettings?.showBankAccount && invoiceSettings?.bankAccount && (
          <View style={{ ...styles.notesSection, marginTop: 12 }}>
            <Text style={styles.notesLabel}>Til Konto / Bank Account</Text>
            <Text style={{ fontSize: 11, fontFamily: fontBold }}>
              {invoiceSettings.bankAccount}
            </Text>
          </View>
        )}

        {/* Diagnostic Notes */}
        {data.diagnosticNotes && (
          <View style={{ ...styles.notesSection, marginTop: 8 }}>
            <Text style={styles.notesLabel}>Diagnostic Notes</Text>
            <Text style={styles.notesText}>{data.diagnosticNotes}</Text>
          </View>
        )}

        {/* Attached Files Reference */}
        {(otherAttachments.length > 0 || pdfAttachmentNames.length > 0) && (
          <View style={{ ...styles.notesSection, marginTop: 8 }}>
            <Text style={styles.notesLabel}>Attached Documents</Text>
            {pdfAttachmentNames.map((name, i) => (
              <Text key={`pdf-${i}`} style={styles.notesText}>
                {name} (see appended pages)
              </Text>
            ))}
            {otherAttachments.map((att, i) => (
              <Text key={i} style={styles.notesText}>
                {att.fileName}
              </Text>
            ))}
          </View>
        )}

        {/* Footer */}
        {torqvoiceLogoDataUri ? (
          <View
            style={{
              ...styles.footer,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
            }}
          >
            {invoiceSettings?.footerNote ? (
              <Text style={{ fontSize: 8, color: gray }}>{invoiceSettings.footerNote} · </Text>
            ) : null}
            <Text style={{ fontSize: 7, color: gray }}>Powered by</Text>
            <Image src={torqvoiceLogoDataUri} style={{ width: 14, height: 14 }} />
            <Text style={{ fontSize: 7, color: gray, fontFamily: fontBold }}>Torqvoice</Text>
          </View>
        ) : (
          <Text style={styles.footer}>
            {invoiceSettings?.footerNote ||
              `${shopDisplayName} · ${serviceDate}`}
          </Text>
        )}
      </Page>

      {/* Diagnostic Images Page */}
      {hasAttachments && imageAttachments.length > 0 && (
        <Page size="A4" style={styles.page}>
          <Text style={styles.sectionTitle}>Diagnostic Report Images</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            {imageAttachments.map((img, i) => (
              <View key={i} style={{ width: '48%', marginBottom: 8 }}>
                <Image
                  src={img.dataUri}
                  style={{
                    maxHeight: 250,
                    borderRadius: 4,
                    objectFit: 'contain',
                    objectPosition: 'left',
                  }}
                />
                {img.description ? (
                  <Text style={{ fontSize: 8, color: gray, marginTop: 2 }}>{img.description}</Text>
                ) : (
                  <Text style={styles.attachmentFileName}>{img.fileName}</Text>
                )}
              </View>
            ))}
          </View>
          <Text style={styles.footer}>
            {shopDisplayName} · {invoiceNum}
          </Text>
        </Page>
      )}
    </Document>
  )
}
