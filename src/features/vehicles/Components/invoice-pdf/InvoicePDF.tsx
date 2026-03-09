import React from 'react'
import { Document, Page, Text, View, Image } from '@react-pdf/renderer'
import { formatDateForPdf, DEFAULT_DATE_FORMAT } from '@/lib/format'
import { createStyles, gray, getFontBold } from './styles'
import { Header } from './Header'
import { InfoSection } from './InfoSection'
import { PartsTable, LaborTable } from './Tables'
import { Totals } from './Totals'
import { NotesOnly, BankAccountSection, DiagnosticNotesSection } from './Notes'
import { CustomFields } from './CustomFields'
import { Footer, AttachmentsFooter } from './Footer'
import type { InvoiceLayoutConfig } from '@/features/settings/Schema/invoiceLayoutSchema'
import type {
  TemplateConfig,
  InvoiceData,
  WorkshopInfo,
  InvoiceSettingsProps,
  PaymentSummary,
  ImageAttachment,
  OtherAttachment,
} from './types'

// ---------------------------------------------------------------------------
// Layout config helpers
// ---------------------------------------------------------------------------

const DEFAULT_SECTION_ORDER = [
  'header',
  'info',
  'parts_table',
  'labor_table',
  'totals',
  'custom_fields',
  'notes',
  'diagnostic_notes',
  'bank_account',
  'footer',
]

function getSortedSectionIds(layoutConfig: InvoiceLayoutConfig | undefined): string[] {
  if (!layoutConfig) return DEFAULT_SECTION_ORDER
  return [...layoutConfig.sections]
    .sort((a, b) => a.order - b.order)
    .filter((s) => s.visible)
    .map((s) => s.id)
}

function getVisibleInfoFields(layoutConfig: InvoiceLayoutConfig | undefined): Set<string> | null {
  return getVisibleFieldsForSection(layoutConfig, 'info')
}

function getVisibleFieldsForSection(layoutConfig: InvoiceLayoutConfig | undefined, sectionId: string): Set<string> | null {
  if (!layoutConfig) return null // show all – fall back to individual toggles
  const section = layoutConfig.sections.find((s) => s.id === sectionId)
  if (!section?.fields) return null
  return new Set(section.fields.filter((f) => f.visible).map((f) => f.id))
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
  portalUrl,
  labels = {},
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
  labels?: Record<string, string>
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

  // ---------------------------------------------------------------------------
  // Layout-driven section rendering
  // ---------------------------------------------------------------------------
  const layoutConfig = template?.layoutConfig
  const sectionOrder = getSortedSectionIds(layoutConfig)
  const visibleInfoFields = getVisibleInfoFields(layoutConfig)
  const visibleHeaderFields = getVisibleFieldsForSection(layoutConfig, 'header')
  const visibleBankAccountFields = getVisibleFieldsForSection(layoutConfig, 'bank_account')

  // Map each section ID to its JSX. Sections that have no data naturally
  // return null and will be skipped by React.
  const sectionMap: Record<string, React.ReactNode> = {
    header: (
      <Header
        headerStyle={headerStyle}
        primaryColor={primaryColor}
        fontFamily={fontFamily}
        showLogo={showLogo}
        showCompanyName={showCompanyName}
        visibleFields={visibleHeaderFields}
        logoDataUri={logoDataUri}
        torqvoiceLogoDataUri={torqvoiceLogoDataUri}
        workshop={workshop}
        invoiceSettings={invoiceSettings}
        shopDisplayName={shopDisplayName}
        invoiceNum={invoiceNum}
        serviceDate={serviceDate}
        dueDate={dueDate}
        styles={styles}
        labels={labels}
      />
    ),

    info: (
      <InfoSection
        data={data}
        vehicleName={vehicleName}
        invoiceSettings={invoiceSettings}
        styles={styles}
        labels={labels}
        visibleFields={visibleInfoFields}
      />
    ),

    parts_table: (
      <PartsTable data={data} currencyCode={cc} styles={styles} labels={labels} />
    ),

    labor_table: (
      <LaborTable data={data} currencyCode={cc} styles={styles} labels={labels} />
    ),

    totals: (
      <>
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
          labels={labels}
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
            <Text style={{ fontSize: 7, color: gray }}>{labels.poweredBy || 'Powered by'}</Text>
            <Image src={torqvoiceLogoDataUri} style={{ width: 12, height: 12 }} />
            <Text style={{ fontSize: 7, color: gray, fontFamily: fontBold }}>Torqvoice</Text>
          </View>
        )}
      </>
    ),

    custom_fields:
      data.customFields && data.customFields.length > 0 ? (
        <CustomFields fields={data.customFields} styles={styles} labels={labels} />
      ) : null,

    notes: (
      <NotesOnly
        invoiceNotes={data.invoiceNotes}
        otherAttachments={otherAttachments}
        pdfAttachmentNames={pdfAttachmentNames}
        fontFamily={fontFamily}
        styles={styles}
        labels={labels}
      />
    ),

    diagnostic_notes: (
      <DiagnosticNotesSection
        diagnosticNotes={data.diagnosticNotes}
        fontFamily={fontFamily}
        styles={styles}
        labels={labels}
      />
    ),

    bank_account: (
      <BankAccountSection
        invoiceSettings={invoiceSettings}
        fontFamily={fontFamily}
        styles={styles}
        labels={labels}
        visibleFields={visibleBankAccountFields}
      />
    ),

    footer: (
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
        labels={labels}
      />
    ),
  }

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {sectionOrder.map((id) => (
          <React.Fragment key={id}>{sectionMap[id]}</React.Fragment>
        ))}
      </Page>

      {hasAttachments && imageAttachments.length > 0 && (
        <Page size="A4" style={styles.page}>
          <Text style={styles.sectionTitle}>{labels.serviceImages || 'Service Images'}</Text>
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
