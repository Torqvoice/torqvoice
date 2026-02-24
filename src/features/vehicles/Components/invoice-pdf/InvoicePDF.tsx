import { Document, Page, Text, View, Image } from '@react-pdf/renderer'
import { formatDateForPdf, DEFAULT_DATE_FORMAT } from '@/lib/format'
import { createStyles, gray, getFontBold } from './styles'
import { Header } from './Header'
import { InfoSection } from './InfoSection'
import { PartsTable, LaborTable } from './Tables'
import { Totals } from './Totals'
import { Notes } from './Notes'
import { Footer, AttachmentsFooter } from './Footer'
import type {
  TemplateConfig,
  InvoiceData,
  WorkshopInfo,
  InvoiceSettingsProps,
  PaymentSummary,
  ImageAttachment,
  OtherAttachment,
} from './types'

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
  portalUrl,
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
  portalUrl?: string
}) {
  const primaryColor = template?.primaryColor || '#d97706'
  const fontFamily = template?.fontFamily || 'Helvetica'
  const showLogo = template?.showLogo !== false
  const showCompanyName = template?.showCompanyName !== false
  const headerStyle = template?.headerStyle || 'standard'
  const styles = createStyles(primaryColor, fontFamily)
  const fontBold = getFontBold(fontFamily)

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
  const isPaidInFull = paymentSummary ? paymentSummary.totalPaid >= displayTotal : false

  const shopDisplayName = workshop?.name || data.shopName || 'Torqvoice'
  const hasAttachments = imageAttachments.length > 0 || otherAttachments.length > 0

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Header
          headerStyle={headerStyle}
          primaryColor={primaryColor}
          fontFamily={fontFamily}
          showLogo={showLogo}
          showCompanyName={showCompanyName}
          logoDataUri={logoDataUri}
          torqvoiceLogoDataUri={torqvoiceLogoDataUri}
          workshop={workshop}
          invoiceSettings={invoiceSettings}
          shopDisplayName={shopDisplayName}
          invoiceNum={invoiceNum}
          serviceDate={serviceDate}
          dueDate={dueDate}
          styles={styles}
        />

        <InfoSection
          data={data}
          vehicleName={vehicleName}
          invoiceSettings={invoiceSettings}
          styles={styles}
        />

        <PartsTable data={data} currencyCode={cc} styles={styles} />
        <LaborTable data={data} currencyCode={cc} styles={styles} />

        <Totals
          data={data}
          currencyCode={cc}
          primaryColor={primaryColor}
          fontFamily={fontFamily}
          displayTotal={displayTotal}
          partsSubtotal={partsSubtotal}
          laborSubtotal={laborSubtotal}
          balanceDue={balanceDue}
          isPaidInFull={isPaidInFull}
          paymentSummary={paymentSummary}
          styles={styles}
        />

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

        <Notes
          invoiceNotes={data.invoiceNotes}
          diagnosticNotes={data.diagnosticNotes}
          invoiceSettings={invoiceSettings}
          otherAttachments={otherAttachments}
          pdfAttachmentNames={pdfAttachmentNames}
          fontFamily={fontFamily}
          styles={styles}
        />

        <Footer
          shopDisplayName={shopDisplayName}
          serviceDate={serviceDate}
          invoiceSettings={invoiceSettings}
          invoiceNum={invoiceNum}
          primaryColor={primaryColor}
          fontFamily={fontFamily}
          torqvoiceLogoDataUri={torqvoiceLogoDataUri}
          portalUrl={portalUrl}
          styles={styles}
        />
      </Page>

      {hasAttachments && imageAttachments.length > 0 && (
        <Page size="A4" style={styles.page}>
          <Text style={styles.sectionTitle}>Service Images</Text>
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
          <AttachmentsFooter
            shopDisplayName={shopDisplayName}
            invoiceNum={invoiceNum}
            styles={styles}
          />
        </Page>
      )}
    </Document>
  )
}
