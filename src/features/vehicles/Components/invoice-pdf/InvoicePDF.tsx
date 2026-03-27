import React from 'react'
import { Document, Page, Text, View, Image } from '@react-pdf/renderer'
import { formatDateForPdf, DEFAULT_DATE_FORMAT } from '@/lib/format'
import { createStyles, gray, getFontBold } from './styles'
import { Header } from './Header'
import { CustomerSection, VehicleSection, ServiceSection } from './InfoSection'
import { PartsTable, LaborTable } from './Tables'
import { Totals } from './Totals'
import { NotesOnly, BankAccountSection, DiagnosticNotesSection } from './Notes'
import { CustomFields } from './CustomFields'
import { Footer, AttachmentsFooter } from './Footer'
import type { InvoiceLayoutConfig } from '@/features/settings/Schema/invoiceLayoutSchema'
import { isCustomFieldId, fromCustomFieldId, groupSectionsForRendering, getDefaultInvoiceLayout, getVisibleFieldsForSection } from '@/features/settings/Schema/invoiceLayoutSchema'
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

function getCustomFieldsForSection(
  layoutConfig: InvoiceLayoutConfig | undefined,
  sectionId: string,
  allCustomFields: Array<{ fieldId: string; label: string; value: string; fieldType: string }>,
): Array<{ fieldId: string; label: string; value: string; fieldType: string }> {
  if (!layoutConfig || !allCustomFields?.length) return []
  const section = layoutConfig.sections.find(s => s.id === sectionId)
  if (!section?.fields) return []
  const cfIds = new Set(
    section.fields
      .filter(f => f.visible && isCustomFieldId(f.id))
      .map(f => fromCustomFieldId(f.id))
  )
  return allCustomFields.filter(cf => cfIds.has(cf.fieldId))
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
  telegramQrDataUri,
  telegramLabel,
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
  telegramQrDataUri?: string
  telegramLabel?: string
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
  const effectiveInvoiceDate = data.invoiceDate ?? data.startDateTime ?? data.serviceDate
  const serviceDate = formatDateForPdf(effectiveInvoiceDate, df, tz)

  const dueDate = data.invoiceDueDate
    ? formatDateForPdf(data.invoiceDueDate, df, tz)
    : (invoiceSettings?.dueDays || 0) > 0
      ? formatDateForPdf(
          new Date(new Date(effectiveInvoiceDate).getTime() + (invoiceSettings?.dueDays || 0) * 86400000),
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
  const visibleCustomerFields = getVisibleFieldsForSection(layoutConfig, 'customer')
  const visibleVehicleFields = getVisibleFieldsForSection(layoutConfig, 'vehicle')
  const visibleServiceFields = getVisibleFieldsForSection(layoutConfig, 'service')
  const visibleHeaderFields = getVisibleFieldsForSection(layoutConfig, 'header')
  const visibleBankAccountFields = getVisibleFieldsForSection(layoutConfig, 'bank_account')

  const allCf = data.customFields || []
  const customerCf = getCustomFieldsForSection(layoutConfig, 'customer', allCf)
  const vehicleCf = getCustomFieldsForSection(layoutConfig, 'vehicle', allCf)
  const serviceCf = getCustomFieldsForSection(layoutConfig, 'service', allCf)
  const generalCf = getCustomFieldsForSection(layoutConfig, 'general', allCf)
  // If no layout config, all custom fields go to the general section
  const generalFallbackCf = !layoutConfig ? allCf : generalCf

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
        logoSize={template?.logoSize}
        styles={styles}
        labels={labels}
      />
    ),

    customer: (
      <CustomerSection
        data={data}
        styles={styles}
        labels={labels}
        visibleFields={visibleCustomerFields}
        customFields={customerCf}
      />
    ),

    vehicle: (
      <VehicleSection
        data={data}
        vehicleName={vehicleName}
        invoiceSettings={invoiceSettings}
        styles={styles}
        labels={labels}
        visibleFields={visibleVehicleFields}
        customFields={vehicleCf}
      />
    ),

    service: (
      <ServiceSection
        data={data}
        styles={styles}
        labels={labels}
        visibleFields={visibleServiceFields}
        customFields={serviceCf}
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

    general:
      generalFallbackCf.length > 0 ? (
        <CustomFields fields={generalFallbackCf} styles={styles} labels={labels} />
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
        primaryColor={primaryColor}
        dueDate={dueDate}
        invoiceDate={serviceDate}
      />
    ),

    telegram_qr: telegramQrDataUri ? (
      <View style={{ alignItems: 'center', marginTop: 14, paddingTop: 10 }}>
        <View style={{ alignItems: 'center', backgroundColor: '#fafafa', borderRadius: 6, padding: 10, paddingBottom: 6 }}>
          <Image src={telegramQrDataUri} style={{ width: 56, height: 56 }} />
          <Text style={{ fontSize: 6.5, color: gray[500], marginTop: 4, fontFamily }}>
            {telegramLabel || 'Chat with us on Telegram'}
          </Text>
        </View>
      </View>
    ) : null,

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

  // Use column-based grouping from layout config.
  const effectiveSections = layoutConfig?.sections ?? getDefaultInvoiceLayout().sections
  const renderGroups = groupSectionsForRendering(effectiveSections)
  const renderedSections: React.ReactNode[] = []

  for (const group of renderGroups) {
    if (group.type === 'full-width') {
      renderedSections.push(
        <React.Fragment key={group.sectionId}>{sectionMap[group.sectionId]}</React.Fragment>
      )
    } else {
      const leftNodes = group.left.map(id => <React.Fragment key={id}>{sectionMap[id]}</React.Fragment>).filter(Boolean)
      const rightNodes = group.right.map(id => <React.Fragment key={id}>{sectionMap[id]}</React.Fragment>).filter(Boolean)
      if (leftNodes.length > 0 || rightNodes.length > 0) {
        renderedSections.push(
          <View key={`col-${group.left[0] || group.right[0]}`} style={styles.infoRow}>
            <View style={{ flex: 1, gap: 4 }}>{leftNodes}</View>
            <View style={{ flex: 1, gap: 4 }}>{rightNodes}</View>
          </View>
        )
      }
    }
  }

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {renderedSections}
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
