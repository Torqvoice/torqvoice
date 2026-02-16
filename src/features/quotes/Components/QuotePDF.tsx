import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer'
import { formatCurrency, getCurrencySymbol, formatDateForPdf, DEFAULT_DATE_FORMAT } from '@/lib/format'

const amber = '#d97706'
const amberLight = '#fef3c7'
const gray = '#6b7280'
const grayLight = '#f3f4f6'
const dark = '#111827'

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: 'Helvetica', color: dark },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 30,
    paddingBottom: 15,
    borderBottomWidth: 3,
    borderBottomColor: amber,
  },
  brandName: { fontSize: 22, fontFamily: 'Helvetica-Bold', color: amber },
  brandSub: { fontSize: 9, color: gray, marginTop: 2 },
  brandContact: { fontSize: 8, color: gray, marginTop: 1 },
  invoiceTitle: { fontSize: 18, fontFamily: 'Helvetica-Bold', textAlign: 'right' as const },
  invoiceNumber: { fontSize: 9, color: gray, textAlign: 'right' as const, marginTop: 4 },
  infoRow: { flexDirection: 'row', gap: 20, marginBottom: 20 },
  infoBox: { flex: 1, padding: 12, backgroundColor: grayLight, borderRadius: 4 },
  infoLabel: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: amber,
    textTransform: 'uppercase' as const,
    marginBottom: 6,
  },
  infoText: { fontSize: 10, marginBottom: 2 },
  infoTextBold: { fontSize: 10, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  infoTextSmall: { fontSize: 9, color: gray, marginBottom: 2 },
  sectionTitle: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 8,
    marginTop: 16,
    color: dark,
  },
  table: { marginBottom: 4 },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: amberLight,
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
  tableCellBold: { fontSize: 9, fontFamily: 'Helvetica-Bold' },
  tableHeaderCell: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#92400e' },
  totalsBox: { marginTop: 16, marginLeft: 'auto', width: 220 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  totalLabel: { fontSize: 10, color: gray },
  totalValue: { fontSize: 10 },
  totalDivider: { borderTopWidth: 1, borderTopColor: amber, marginVertical: 4 },
  grandTotalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  grandTotalLabel: { fontSize: 14, fontFamily: 'Helvetica-Bold' },
  grandTotalValue: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: amber },
  notesSection: { marginTop: 20, padding: 12, backgroundColor: grayLight, borderRadius: 4 },
  notesLabel: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: amber,
    textTransform: 'uppercase' as const,
    marginBottom: 4,
  },
  notesText: { fontSize: 9, color: gray, lineHeight: 1.5 },
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

interface QuoteData {
  quoteNumber: string | null
  title: string
  description: string | null
  validUntil: Date | null
  createdAt: Date
  subtotal: number
  taxRate: number
  taxAmount: number
  discountType: string | null
  discountValue: number
  discountAmount: number
  totalAmount: number
  notes: string | null
  partItems: {
    partNumber: string | null
    name: string
    quantity: number
    unitPrice: number
    total: number
  }[]
  laborItems: { description: string; hours: number; rate: number; total: number }[]
  customer: {
    name: string
    email: string | null
    phone: string | null
    address: string | null
    company: string | null
  } | null
  vehicle: {
    make: string
    model: string
    year: number
    vin: string | null
    licensePlate: string | null
  } | null
}

interface WorkshopInfo {
  name: string
  address: string
  phone: string
  email: string
}

export function QuotePDF({
  data,
  workshop,
  currencyCode = 'USD',
  logoDataUri,
  torqvoiceLogoDataUri,
  dateFormat,
  timezone,
}: {
  data: QuoteData
  workshop?: WorkshopInfo
  currencyCode?: string
  logoDataUri?: string
  torqvoiceLogoDataUri?: string
  dateFormat?: string
  timezone?: string
}) {
  const cs = getCurrencySymbol(currencyCode)
  const quoteNum = data.quoteNumber || 'QUOTE'
  const df = dateFormat || DEFAULT_DATE_FORMAT
  const tz = timezone || undefined
  const createdDate = formatDateForPdf(data.createdAt, df, tz)
  const validDate = data.validUntil
    ? formatDateForPdf(data.validUntil, df, tz)
    : null
  const shopName = workshop?.name || 'Torqvoice'

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            {logoDataUri && (
              <Image
                src={logoDataUri}
                style={{ width: 60, height: 60, marginBottom: 6, borderRadius: 4 }}
              />
            )}
            <Text style={styles.brandName}>{shopName}</Text>
            {workshop?.address && <Text style={styles.brandSub}>{workshop.address}</Text>}
            {workshop?.phone && <Text style={styles.brandContact}>Tel: {workshop.phone}</Text>}
            {workshop?.email && <Text style={styles.brandContact}>{workshop.email}</Text>}
          </View>
          <View>
            {torqvoiceLogoDataUri && (
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 3, marginBottom: 6 }}>
                <Image src={torqvoiceLogoDataUri} style={{ width: 16, height: 16 }} />
                <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: gray }}>Torqvoice</Text>
              </View>
            )}
            <Text style={{ ...styles.invoiceTitle, color: '#2563eb' }}>QUOTE</Text>
            <Text style={styles.invoiceNumber}>{quoteNum}</Text>
            <Text style={styles.invoiceNumber}>{createdDate}</Text>
            {validDate && <Text style={styles.invoiceNumber}>Valid until: {validDate}</Text>}
          </View>
        </View>

        <View style={styles.infoRow}>
          {data.customer && (
            <View style={styles.infoBox}>
              <Text style={styles.infoLabel}>To</Text>
              <Text style={styles.infoTextBold}>{data.customer.name}</Text>
              {data.customer.company && (
                <Text style={styles.infoText}>{data.customer.company}</Text>
              )}
              {data.customer.address && (
                <Text style={styles.infoTextSmall}>{data.customer.address}</Text>
              )}
              {data.customer.email && (
                <Text style={styles.infoTextSmall}>{data.customer.email}</Text>
              )}
              {data.customer.phone && (
                <Text style={styles.infoTextSmall}>{data.customer.phone}</Text>
              )}
            </View>
          )}
          {data.vehicle && (
            <View style={styles.infoBox}>
              <Text style={styles.infoLabel}>Vehicle</Text>
              <Text style={styles.infoTextBold}>
                {data.vehicle.year} {data.vehicle.make} {data.vehicle.model}
              </Text>
              {data.vehicle.vin && (
                <Text style={styles.infoTextSmall}>VIN: {data.vehicle.vin}</Text>
              )}
              {data.vehicle.licensePlate && (
                <Text style={styles.infoTextSmall}>Plate: {data.vehicle.licensePlate}</Text>
              )}
            </View>
          )}
          <View style={styles.infoBox}>
            <Text style={styles.infoLabel}>Quote Details</Text>
            <Text style={styles.infoTextBold}>{data.title}</Text>
          </View>
        </View>

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
              {data.partItems.map((p, i) => (
                <View key={i} style={styles.tableRow}>
                  <Text style={{ ...styles.tableCell, width: '15%' }}>{p.partNumber || '-'}</Text>
                  <Text style={{ ...styles.tableCell, width: '35%' }}>{p.name}</Text>
                  <Text style={{ ...styles.tableCell, width: '12%', textAlign: 'right' }}>
                    {p.quantity}
                  </Text>
                  <Text style={{ ...styles.tableCell, width: '18%', textAlign: 'right' }}>
                    {formatCurrency(p.unitPrice, currencyCode)}
                  </Text>
                  <Text style={{ ...styles.tableCellBold, width: '20%', textAlign: 'right' }}>
                    {formatCurrency(p.total, currencyCode)}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

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
              {data.laborItems.map((l, i) => (
                <View key={i} style={styles.tableRow}>
                  <Text style={{ ...styles.tableCell, width: '45%' }}>{l.description}</Text>
                  <Text style={{ ...styles.tableCell, width: '15%', textAlign: 'right' }}>
                    {l.hours}
                  </Text>
                  <Text style={{ ...styles.tableCell, width: '20%', textAlign: 'right' }}>
                    {formatCurrency(l.rate, currencyCode)}/hr
                  </Text>
                  <Text style={{ ...styles.tableCellBold, width: '20%', textAlign: 'right' }}>
                    {formatCurrency(l.total, currencyCode)}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={styles.totalsBox}>
          {data.subtotal > 0 && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Subtotal</Text>
              <Text style={styles.totalValue}>{formatCurrency(data.subtotal, currencyCode)}</Text>
            </View>
          )}
          {data.discountAmount > 0 && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>
                Discount{data.discountType === 'percentage' ? ` (${data.discountValue}%)` : ''}
              </Text>
              <Text style={{ ...styles.totalValue, color: '#dc2626' }}>
                {formatCurrency(-data.discountAmount, currencyCode)}
              </Text>
            </View>
          )}
          {data.taxRate > 0 && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Tax ({data.taxRate}%)</Text>
              <Text style={styles.totalValue}>{formatCurrency(data.taxAmount, currencyCode)}</Text>
            </View>
          )}
          <View style={styles.totalDivider} />
          <View style={styles.grandTotalRow}>
            <Text style={styles.grandTotalLabel}>Total</Text>
            <Text style={styles.grandTotalValue}>
              {formatCurrency(data.totalAmount, currencyCode)}
            </Text>
          </View>
        </View>

        {/* Torqvoice branding near totals */}
        {torqvoiceLogoDataUri && (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 3, marginTop: 6 }}>
            <Text style={{ fontSize: 7, color: gray }}>Powered by</Text>
            <Image src={torqvoiceLogoDataUri} style={{ width: 12, height: 12 }} />
            <Text style={{ fontSize: 7, color: gray, fontFamily: 'Helvetica-Bold' }}>Torqvoice</Text>
          </View>
        )}

        {data.description && (
          <View style={styles.notesSection}>
            <Text style={styles.notesLabel}>Description</Text>
            <Text style={styles.notesText}>{data.description}</Text>
          </View>
        )}

        {torqvoiceLogoDataUri ? (
          <View style={{
            ...styles.footer,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
          }}>
            <Text style={{ fontSize: 8, color: gray }}>
              This quote is valid{validDate ? ` until ${validDate}` : ' for 30 days'} ·{' '}
            </Text>
            <Text style={{ fontSize: 7, color: gray }}>Powered by</Text>
            <Image src={torqvoiceLogoDataUri} style={{ width: 14, height: 14 }} />
            <Text style={{ fontSize: 7, color: gray, fontFamily: 'Helvetica-Bold' }}>Torqvoice</Text>
          </View>
        ) : (
          <Text style={styles.footer}>
            This quote is valid{validDate ? ` until ${validDate}` : ' for 30 days'} · {shopName}
          </Text>
        )}
      </Page>
    </Document>
  )
}
