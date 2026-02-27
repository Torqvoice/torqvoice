import { Document, Page, Text, View, Image } from '@react-pdf/renderer'
import { formatCurrency, formatDateForPdf, DEFAULT_DATE_FORMAT } from '@/lib/format'
import { createStyles, gray, getFontBold } from '@/features/vehicles/Components/invoice-pdf/styles'
import type { TemplateConfig } from '@/features/vehicles/Components/invoice-pdf/types'

function fillTemplate(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce(
    (str, [key, val]) => str.replace(`{${key}}`, val),
    template
  )
}

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

interface ImageAttachmentPDF {
  fileName: string
  dataUri: string
  description?: string
}

interface OtherAttachmentPDF {
  fileName: string
  fileType: string
}

export function QuotePDF({
  data,
  workshop,
  currencyCode = 'USD',
  logoDataUri,
  torqvoiceLogoDataUri,
  dateFormat,
  timezone,
  template,
  portalUrl,
  imageAttachments = [],
  otherAttachments = [],
  pdfAttachmentNames = [],
  labels = {},
}: {
  data: QuoteData
  workshop?: WorkshopInfo
  currencyCode?: string
  logoDataUri?: string
  torqvoiceLogoDataUri?: string
  dateFormat?: string
  timezone?: string
  template?: TemplateConfig
  portalUrl?: string
  imageAttachments?: ImageAttachmentPDF[]
  otherAttachments?: OtherAttachmentPDF[]
  pdfAttachmentNames?: string[]
  labels?: Record<string, string>
}) {
  const primaryColor = template?.primaryColor || '#d97706'
  const fontFamily = template?.fontFamily || 'Helvetica'
  const headerStyle = template?.headerStyle || 'standard'
  const showLogo = template?.showLogo !== false
  const showCompanyName = template?.showCompanyName !== false
  const styles = createStyles(primaryColor, fontFamily)
  const fontBold = getFontBold(fontFamily)

  const quoteNum = data.quoteNumber || 'QUOTE'
  const df = dateFormat || DEFAULT_DATE_FORMAT
  const tz = timezone || undefined
  const createdDate = formatDateForPdf(data.createdAt, df, tz)
  const validDate = data.validUntil ? formatDateForPdf(data.validUntil, df, tz) : null
  const shopName = workshop?.name || 'Torqvoice'

  const renderCompactHeader = () => (
    <View style={{ marginBottom: 20 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingBottom: 10,
          borderBottomWidth: 1,
          borderBottomColor: '#e5e7eb',
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {showLogo && logoDataUri && (
            <Image
              src={logoDataUri}
              style={{ maxWidth: 40, maxHeight: 40, borderRadius: 4, objectFit: 'contain' }}
            />
          )}
          {showCompanyName && (
            <View>
              <Text style={{ fontSize: 16, fontFamily: fontBold, color: primaryColor }}>
                {shopName}
              </Text>
              {workshop?.address && (
                <Text style={{ fontSize: 8, color: gray }}>{workshop.address}</Text>
              )}
            </View>
          )}
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ fontSize: 14, fontFamily: fontBold, color: primaryColor }}>{labels.title || 'QUOTE'}</Text>
          <Text style={{ fontSize: 9, color: gray, marginTop: 2 }}>{quoteNum}</Text>
          <Text style={{ fontSize: 9, color: gray }}>{createdDate}</Text>
          {validDate && <Text style={{ fontSize: 9, color: gray }}>{labels.validUntil ? fillTemplate(labels.validUntil, { date: validDate }) : `Valid until: ${validDate}`}</Text>}
        </View>
      </View>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          marginTop: 6,
          paddingHorizontal: 2,
        }}
      >
        <View style={{ flexDirection: 'row', gap: 12 }}>
          {workshop?.phone && (
            <Text style={{ fontSize: 8, color: gray }}>{labels.tel ? fillTemplate(labels.tel, { phone: workshop.phone }) : `Tel: ${workshop.phone}`}</Text>
          )}
          {workshop?.email && (
            <Text style={{ fontSize: 8, color: gray }}>{workshop.email}</Text>
          )}
        </View>
        {torqvoiceLogoDataUri && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            <Image src={torqvoiceLogoDataUri} style={{ width: 12, height: 12 }} />
            <Text style={{ fontSize: 7, fontFamily: fontBold, color: gray }}>Torqvoice</Text>
          </View>
        )}
      </View>
    </View>
  )

  const renderModernHeader = () => (
    <View style={{ marginBottom: 24 }}>
      <View
        style={{
          backgroundColor: primaryColor,
          padding: 20,
          borderRadius: 4,
          marginHorizontal: -10,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
          }}
        >
          {showLogo && logoDataUri && (
            <Image
              src={logoDataUri}
              style={{ maxWidth: 50, maxHeight: 50, borderRadius: 4, objectFit: 'contain' }}
            />
          )}
          <View style={{ alignItems: 'center' }}>
            {showCompanyName && (
              <Text style={{ fontSize: 22, fontFamily: fontBold, color: 'white' }}>
                {shopName}
              </Text>
            )}
            {workshop?.address && (
              <Text style={{ fontSize: 9, color: 'rgba(255,255,255,0.8)', marginTop: 2 }}>
                {workshop.address}
              </Text>
            )}
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 4 }}>
              {workshop?.phone && (
                <Text style={{ fontSize: 8, color: 'rgba(255,255,255,0.7)' }}>
                  {labels.tel ? fillTemplate(labels.tel, { phone: workshop.phone }) : `Tel: ${workshop.phone}`}
                </Text>
              )}
              {workshop?.email && (
                <Text style={{ fontSize: 8, color: 'rgba(255,255,255,0.7)' }}>
                  {workshop.email}
                </Text>
              )}
            </View>
          </View>
        </View>
        {torqvoiceLogoDataUri && (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 3,
              marginTop: 8,
            }}
          >
            <Image src={torqvoiceLogoDataUri} style={{ width: 12, height: 12 }} />
            <Text style={{ fontSize: 7, fontFamily: fontBold, color: 'rgba(255,255,255,0.7)' }}>
              Torqvoice
            </Text>
          </View>
        )}
      </View>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: 12,
          paddingBottom: 8,
        }}
      >
        <Text style={{ fontSize: 18, fontFamily: fontBold, color: primaryColor }}>{labels.title || 'QUOTE'}</Text>
        <View style={{ flexDirection: 'row', gap: 16 }}>
          <Text style={{ fontSize: 9, color: gray }}>{quoteNum}</Text>
          <Text style={{ fontSize: 9, color: gray }}>{createdDate}</Text>
          {validDate && <Text style={{ fontSize: 9, color: gray }}>{labels.validUntil ? fillTemplate(labels.validUntil, { date: validDate }) : `Valid until: ${validDate}`}</Text>}
        </View>
      </View>
    </View>
  )

  const renderStandardHeader = () => (
    <View style={styles.header}>
      <View>
        {showLogo && logoDataUri && (
          <Image
            src={logoDataUri}
            style={{ width: 60, height: 60, marginBottom: 6, borderRadius: 4 }}
          />
        )}
        {showCompanyName && <Text style={styles.brandName}>{shopName}</Text>}
        {workshop?.address && <Text style={styles.brandSub}>{workshop.address}</Text>}
        {workshop?.phone && <Text style={styles.brandContact}>{labels.tel ? fillTemplate(labels.tel, { phone: workshop.phone }) : `Tel: ${workshop.phone}`}</Text>}
        {workshop?.email && <Text style={styles.brandContact}>{workshop.email}</Text>}
      </View>
      <View>
        {torqvoiceLogoDataUri && (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 3, marginBottom: 6 }}>
            <Image src={torqvoiceLogoDataUri} style={{ width: 16, height: 16 }} />
            <Text style={{ fontSize: 9, fontFamily: fontBold, color: gray }}>Torqvoice</Text>
          </View>
        )}
        <Text style={{ ...styles.invoiceTitle, color: primaryColor }}>{labels.title || 'QUOTE'}</Text>
        <Text style={styles.invoiceNumber}>{quoteNum}</Text>
        <Text style={styles.invoiceNumber}>{createdDate}</Text>
        {validDate && <Text style={styles.invoiceNumber}>{labels.validUntil ? fillTemplate(labels.validUntil, { date: validDate }) : `Valid until: ${validDate}`}</Text>}
      </View>
    </View>
  )

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {headerStyle === 'compact'
          ? renderCompactHeader()
          : headerStyle === 'modern'
            ? renderModernHeader()
            : renderStandardHeader()}

        <View style={styles.infoRow}>
          {data.customer && (
            <View style={styles.infoBox}>
              <Text style={styles.infoLabel}>{labels.to || 'To'}</Text>
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
              <Text style={styles.infoLabel}>{labels.vehicle || 'Vehicle'}</Text>
              <Text style={styles.infoTextBold}>
                {data.vehicle.year} {data.vehicle.make} {data.vehicle.model}
              </Text>
              {data.vehicle.vin && (
                <Text style={styles.infoTextSmall}>{labels.vin ? fillTemplate(labels.vin, { vin: data.vehicle.vin }) : `VIN: ${data.vehicle.vin}`}</Text>
              )}
              {data.vehicle.licensePlate && (
                <Text style={styles.infoTextSmall}>{labels.plate ? fillTemplate(labels.plate, { plate: data.vehicle.licensePlate }) : `Plate: ${data.vehicle.licensePlate}`}</Text>
              )}
            </View>
          )}
          <View style={styles.infoBox}>
            <Text style={styles.infoLabel}>{labels.quoteDetails || 'Quote Details'}</Text>
            <Text style={styles.infoTextBold}>{data.title}</Text>
          </View>
        </View>

        {data.partItems.length > 0 && (
          <View>
            <Text style={styles.sectionTitle}>{labels.parts || 'Parts'}</Text>
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={{ ...styles.tableHeaderCell, width: '15%' }}>{labels.partNumber || 'Part #'}</Text>
                <Text style={{ ...styles.tableHeaderCell, width: '35%' }}>{labels.description || 'Description'}</Text>
                <Text style={{ ...styles.tableHeaderCell, width: '12%', textAlign: 'right' }}>
                  {labels.qty || 'Qty'}
                </Text>
                <Text style={{ ...styles.tableHeaderCell, width: '18%', textAlign: 'right' }}>
                  {labels.unitPrice || 'Unit Price'}
                </Text>
                <Text style={{ ...styles.tableHeaderCell, width: '20%', textAlign: 'right' }}>
                  {labels.total || 'Total'}
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
            <Text style={styles.sectionTitle}>{labels.labor || 'Labor'}</Text>
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={{ ...styles.tableHeaderCell, width: '45%' }}>{labels.description || 'Description'}</Text>
                <Text style={{ ...styles.tableHeaderCell, width: '15%', textAlign: 'right' }}>
                  {labels.hours || 'Hours'}
                </Text>
                <Text style={{ ...styles.tableHeaderCell, width: '20%', textAlign: 'right' }}>
                  {labels.rate || 'Rate'}
                </Text>
                <Text style={{ ...styles.tableHeaderCell, width: '20%', textAlign: 'right' }}>
                  {labels.total || 'Total'}
                </Text>
              </View>
              {data.laborItems.map((l, i) => (
                <View key={i} style={styles.tableRow}>
                  <Text style={{ ...styles.tableCell, width: '45%' }}>{l.description}</Text>
                  <Text style={{ ...styles.tableCell, width: '15%', textAlign: 'right' }}>
                    {l.hours}
                  </Text>
                  <Text style={{ ...styles.tableCell, width: '20%', textAlign: 'right' }}>
                    {labels.ratePerHour ? fillTemplate(labels.ratePerHour, { rate: formatCurrency(l.rate, currencyCode) }) : `${formatCurrency(l.rate, currencyCode)}/hr`}
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
          {data.laborItems.length > 0 && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>{labels.labor || 'Labor'}</Text>
              <Text style={styles.totalValue}>
                {formatCurrency(data.laborItems.reduce((sum, l) => sum + l.total, 0), currencyCode)}
              </Text>
            </View>
          )}
          {data.partItems.length > 0 && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>{labels.parts || 'Parts'}</Text>
              <Text style={styles.totalValue}>
                {formatCurrency(data.partItems.reduce((sum, p) => sum + p.total, 0), currencyCode)}
              </Text>
            </View>
          )}
          {data.subtotal > 0 && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>{labels.subtotal || 'Subtotal'}</Text>
              <Text style={styles.totalValue}>{formatCurrency(data.subtotal, currencyCode)}</Text>
            </View>
          )}
          {data.discountAmount > 0 && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>
                {data.discountType === 'percentage'
                  ? (labels.discountPercent ? fillTemplate(labels.discountPercent, { percent: String(data.discountValue) }) : `Discount (${data.discountValue}%)`)
                  : (labels.discount || 'Discount')}
              </Text>
              <Text style={{ ...styles.totalValue, color: '#dc2626' }}>
                {formatCurrency(-data.discountAmount, currencyCode)}
              </Text>
            </View>
          )}
          {data.taxRate > 0 && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>{labels.tax ? fillTemplate(labels.tax, { rate: String(data.taxRate) }) : `Tax (${data.taxRate}%)`}</Text>
              <Text style={styles.totalValue}>{formatCurrency(data.taxAmount, currencyCode)}</Text>
            </View>
          )}
          <View style={styles.totalDivider} />
          <View style={styles.grandTotalRow}>
            <Text style={styles.grandTotalLabel}>{labels.total || 'Total'}</Text>
            <Text style={styles.grandTotalValue}>
              {formatCurrency(data.totalAmount, currencyCode)}
            </Text>
          </View>
        </View>

        {torqvoiceLogoDataUri && (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 3, marginTop: 6 }}>
            <Text style={{ fontSize: 7, color: gray }}>{labels.poweredBy || 'Powered by'}</Text>
            <Image src={torqvoiceLogoDataUri} style={{ width: 12, height: 12 }} />
            <Text style={{ fontSize: 7, color: gray, fontFamily: fontBold }}>Torqvoice</Text>
          </View>
        )}

        {data.description && (
          <View style={styles.notesSection}>
            <Text style={styles.notesLabel}>Description</Text>
            <Text style={styles.notesText}>{data.description}</Text>
          </View>
        )}

        {portalUrl && (
          <View style={{ marginTop: 8 }}>
            <Text style={{ fontSize: 8, color: gray, textAlign: 'center' }}>
              {labels.viewPortal ? fillTemplate(labels.viewPortal, { url: portalUrl }) : `View your portal: ${portalUrl}`}
            </Text>
          </View>
        )}

        {/* Document attachment names */}
        {(otherAttachments.length > 0 || pdfAttachmentNames.length > 0) && (
          <View style={{ marginTop: 10 }}>
            <Text style={styles.sectionTitle}>{labels.attachedDocuments || 'Attached Documents'}</Text>
            {otherAttachments.map((att, i) => (
              <Text key={`other-${i}`} style={{ fontSize: 9, color: gray, marginBottom: 2 }}>
                {att.fileName}
              </Text>
            ))}
            {pdfAttachmentNames.map((name, i) => (
              <Text key={`pdf-${i}`} style={{ fontSize: 9, color: gray, marginBottom: 2 }}>
                {labels.attached ? fillTemplate(labels.attached, { name }) : `${name} (attached)`}
              </Text>
            ))}
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
              {validDate
                ? (labels.validityFooterUntil ? fillTemplate(labels.validityFooterUntil, { date: validDate }) : `This quote is valid until ${validDate}`)
                : (labels.validityFooter30 || 'This quote is valid for 30 days')} ·{' '}
            </Text>
            <Text style={{ fontSize: 7, color: gray }}>{labels.poweredBy || 'Powered by'}</Text>
            <Image src={torqvoiceLogoDataUri} style={{ width: 14, height: 14 }} />
            <Text style={{ fontSize: 7, color: gray, fontFamily: fontBold }}>Torqvoice</Text>
          </View>
        ) : (
          <Text style={styles.footer}>
            {validDate
              ? (labels.validityFooterUntil ? fillTemplate(labels.validityFooterUntil, { date: validDate }) : `This quote is valid until ${validDate}`)
              : (labels.validityFooter30 || 'This quote is valid for 30 days')} · {shopName}
          </Text>
        )}
      </Page>

      {imageAttachments.length > 0 && (
        <Page size="A4" style={styles.page}>
          <Text style={styles.sectionTitle}>{labels.quoteImages || 'Quote Images'}</Text>
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
                  <Text style={{ fontSize: 8, color: gray, marginTop: 2 }}>{img.fileName}</Text>
                )}
              </View>
            ))}
          </View>
          <Text style={styles.footer}>
            {quoteNum} · {shopName}
          </Text>
        </Page>
      )}
    </Document>
  )
}
