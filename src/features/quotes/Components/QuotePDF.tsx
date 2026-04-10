import React from 'react'
import { Document, Page, Text, View, Image } from '@react-pdf/renderer'
import { formatCurrency, formatDateForPdf, DEFAULT_DATE_FORMAT } from '@/lib/format'
import { createStyles, gray, getFontBold } from '@/features/vehicles/Components/invoice-pdf/styles'
import { HtmlToPdf } from '@/features/vehicles/Components/invoice-pdf/Notes'
import { CustomFields } from '@/features/vehicles/Components/invoice-pdf/CustomFields'
import type { TemplateConfig } from '@/features/vehicles/Components/invoice-pdf/types'
import type { InvoiceLayoutConfig, InvoiceSection } from '@/features/settings/Schema/invoiceLayoutSchema'
import { calculateTotals } from '@/lib/tax'
import { isCustomFieldId, fromCustomFieldId, groupSectionsForRendering, getDefaultInvoiceLayout, getOrderedFieldIds, getVisibleFieldsForSection as getVisibleFieldsForSectionHelper } from '@/features/settings/Schema/invoiceLayoutSchema'

const DEFAULT_HEADER_FIELD_ORDER = ['logo', 'company_name', 'company_address', 'company_phone', 'company_email', 'company_org_number']

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
  taxInclusive?: boolean
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
    excluded?: boolean
  }[]
  laborItems: { description: string; hours: number; rate: number; total: number; pricingType?: string; excluded?: boolean }[]
  customer: {
    name: string
    email: string | null
    phone: string | null
    address: string | null
    company: string | null
    taxId?: string | null
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
  customFields = [],
  labels = {},
  layoutConfig,
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
  customFields?: Array<{ fieldId: string; label: string; value: string; fieldType: string }>
  labels?: Record<string, string>
  layoutConfig?: InvoiceLayoutConfig
}) {
  const primaryColor = template?.primaryColor || '#d97706'
  const fontFamily = template?.fontFamily || 'Helvetica'
  const headerStyle = template?.headerStyle || 'standard'
  const showLogo = template?.showLogo !== false
  const showCompanyName = template?.showCompanyName !== false
  const logoScale = (template?.logoSize || 100) / 100
  const headerFields = layoutConfig ? getVisibleFieldsForSectionHelper(layoutConfig, 'header') : null
  const headerFieldOrder = getOrderedFieldIds(headerFields, DEFAULT_HEADER_FIELD_ORDER)
  const styles = createStyles(primaryColor, fontFamily)
  const fontBold = getFontBold(fontFamily)

  // Layout config helpers
  const sections = layoutConfig?.sections ?? []
  const sectionMap = new Map<string, InvoiceSection>(sections.map((s) => [s.id, s]))

  const getVisibleFieldsForSection = (sectionId: string): Set<string> | null => {
    const section = sectionMap.get(sectionId)
    if (!section?.fields) return null
    return new Set(section.fields.filter((f) => f.visible).map((f) => f.id))
  }

  const getCustomFieldsForSection = (
    sectionId: string,
  ): Array<{ fieldId: string; label: string; value: string; fieldType: string }> => {
    if (!layoutConfig || !customFields?.length) return []
    const section = sectionMap.get(sectionId)
    if (!section?.fields) return []
    const cfIds = new Set(
      section.fields
        .filter(f => f.visible && isCustomFieldId(f.id))
        .map(f => fromCustomFieldId(f.id))
    )
    return customFields.filter(cf => cfIds.has(cf.fieldId))
  }

  const quoteNum = data.quoteNumber || 'QUOTE'
  const df = dateFormat || DEFAULT_DATE_FORMAT
  const tz = timezone || undefined
  const createdDate = formatDateForPdf(data.createdAt, df, tz)
  const validDate = data.validUntil ? formatDateForPdf(data.validUntil, df, tz) : null
  const shopName = workshop?.name || 'Torqvoice'

  const renderCompactField = (fieldId: string) => {
    switch (fieldId) {
      case 'logo':
        return showLogo && logoDataUri ? (
          <Image key="logo" src={logoDataUri} style={{ maxWidth: 40 * logoScale, maxHeight: 40 * logoScale, borderRadius: 4, objectFit: 'contain', marginBottom: 4 }} />
        ) : null
      case 'company_name':
        return showCompanyName ? (
          <Text key="company_name" style={{ fontSize: 16, fontFamily: fontBold, color: primaryColor }}>{shopName}</Text>
        ) : null
      case 'company_address':
        return workshop?.address ? <Text key="company_address" style={{ fontSize: 8, color: gray }}>{workshop.address}</Text> : null
      case 'company_phone':
        return workshop?.phone ? <Text key="company_phone" style={{ fontSize: 8, color: gray }}>{labels.tel ? fillTemplate(labels.tel, { phone: workshop.phone }) : `Tel: ${workshop.phone}`}</Text> : null
      case 'company_email':
        return workshop?.email ? <Text key="company_email" style={{ fontSize: 8, color: gray }}>{workshop.email}</Text> : null
      case 'company_org_number':
        return null // org number not shown in quote header
      default:
        return null
    }
  }

  const renderCompactHeader = () => (
    <View style={{ marginBottom: 20 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          paddingBottom: 10,
          borderBottomWidth: 1,
          borderBottomColor: '#e5e7eb',
        }}
      >
        <View>
          {headerFieldOrder.map(renderCompactField)}
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ fontSize: 14, fontFamily: fontBold, color: primaryColor }}>{labels.title || 'QUOTE'}</Text>
          <Text style={{ fontSize: 9, color: gray, marginTop: 2 }}>{quoteNum}</Text>
          <Text style={{ fontSize: 9, color: gray }}>{createdDate}</Text>
          {validDate && <Text style={{ fontSize: 9, color: gray }}>{labels.validUntil ? fillTemplate(labels.validUntil, { date: validDate }) : `Valid until: ${validDate}`}</Text>}
        </View>
      </View>
      {torqvoiceLogoDataUri && (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 3, marginTop: 6, paddingHorizontal: 2 }}>
          <Image src={torqvoiceLogoDataUri} style={{ width: 12, height: 12 }} />
          <Text style={{ fontSize: 7, fontFamily: fontBold, color: gray }}>Torqvoice</Text>
        </View>
      )}
    </View>
  )

  const renderModernField = (fieldId: string) => {
    switch (fieldId) {
      case 'logo':
        return showLogo && logoDataUri ? (
          <Image key="logo" src={logoDataUri} style={{ maxWidth: 50 * logoScale, maxHeight: 50 * logoScale, borderRadius: 4, objectFit: 'contain', marginBottom: 6 }} />
        ) : null
      case 'company_name':
        return showCompanyName ? (
          <Text key="company_name" style={{ fontSize: 22, fontFamily: fontBold, color: 'white' }}>{shopName}</Text>
        ) : null
      case 'company_address':
        return workshop?.address ? (
          <Text key="company_address" style={{ fontSize: 9, color: 'rgba(255,255,255,0.8)', marginTop: 2 }}>{workshop.address}</Text>
        ) : null
      case 'company_phone':
        return workshop?.phone ? (
          <Text key="company_phone" style={{ fontSize: 8, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>{labels.tel ? fillTemplate(labels.tel, { phone: workshop.phone }) : `Tel: ${workshop.phone}`}</Text>
        ) : null
      case 'company_email':
        return workshop?.email ? (
          <Text key="company_email" style={{ fontSize: 8, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>{workshop.email}</Text>
        ) : null
      case 'company_org_number':
        return null // org number not shown in quote header
      default:
        return null
    }
  }

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
        <View style={{ alignItems: 'center' }}>
          {headerFieldOrder.map(renderModernField)}
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

  const renderStandardField = (fieldId: string) => {
    switch (fieldId) {
      case 'logo':
        return showLogo && logoDataUri ? (
          <Image key="logo" src={logoDataUri} style={{ maxWidth: 150 * logoScale, maxHeight: 60 * logoScale, marginBottom: 6, borderRadius: 4, objectFit: 'contain', objectPosition: 'left' }} />
        ) : null
      case 'company_name':
        return showCompanyName ? <Text key="company_name" style={styles.brandName}>{shopName}</Text> : null
      case 'company_address':
        return workshop?.address ? <Text key="company_address" style={styles.brandSub}>{workshop.address}</Text> : null
      case 'company_phone':
        return workshop?.phone ? <Text key="company_phone" style={styles.brandContact}>{labels.tel ? fillTemplate(labels.tel, { phone: workshop.phone }) : `Tel: ${workshop.phone}`}</Text> : null
      case 'company_email':
        return workshop?.email ? <Text key="company_email" style={styles.brandContact}>{workshop.email}</Text> : null
      case 'company_org_number':
        return null // org number not shown in quote header
      default:
        return null
    }
  }

  const renderStandardHeader = () => (
    <View style={styles.header}>
      <View>
        {headerFieldOrder.map(renderStandardField)}
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

  // ---------- Section renderers ----------

  const customerCf = getCustomFieldsForSection('customer')
  const vehicleCf = getCustomFieldsForSection('vehicle')
  const serviceCf = getCustomFieldsForSection('service')
  const generalCf = getCustomFieldsForSection('general')
  const generalFallbackCf = !layoutConfig ? customFields : generalCf

  const visibleCustomerFields = getVisibleFieldsForSection('customer')
  const visibleVehicleFields = getVisibleFieldsForSection('vehicle')
  const visibleServiceFields = getVisibleFieldsForSection('service')

  const renderCustomerSection = () => {
    const showC = (fid: string) => !visibleCustomerFields || visibleCustomerFields.has(fid)
    const hasCustomer = data.customer && (showC('customer_name') || (showC('customer_company') && data.customer.company) || (showC('customer_address') && data.customer.address) || (showC('customer_email') && data.customer.email) || (showC('customer_phone') && data.customer.phone) || (showC('customer_tax_id') && data.customer.taxId))
    const hasCustCf = customerCf.some(cf => cf.value !== '' && cf.value != null)
    if (!hasCustomer && !hasCustCf) return null

    const fieldOrder = getOrderedFieldIds(visibleCustomerFields, ['customer_name', 'customer_company', 'customer_address', 'customer_email', 'customer_phone', 'customer_tax_id'])
    const c = data.customer

    const renderField = (fid: string) => {
      if (!c || !showC(fid)) return null
      switch (fid) {
        case 'customer_name': return <Text key={fid} style={styles.infoTextBold}>{c.name}</Text>
        case 'customer_company': return c.company ? <Text key={fid} style={styles.infoText}>{c.company}</Text> : null
        case 'customer_address': return c.address ? <Text key={fid} style={styles.infoTextSmall}>{c.address}</Text> : null
        case 'customer_email': return c.email ? <Text key={fid} style={styles.infoTextSmall}>{c.email}</Text> : null
        case 'customer_phone': return c.phone ? <Text key={fid} style={styles.infoTextSmall}>{c.phone}</Text> : null
        case 'customer_tax_id': return c.taxId ? <Text key={fid} style={styles.infoTextSmall}>{(labels.customerTaxId || 'Tax ID')}: {c.taxId}</Text> : null
        default: return null
      }
    }

    return (
      <View style={styles.infoBox}>
        <Text style={styles.infoLabel}>{labels.to || 'To'}</Text>
        {fieldOrder.map(renderField)}
        {customerCf.filter(cf => cf.value !== '' && cf.value != null).map((cf, i) => (
          <Text key={`cf-cust-${i}`} style={styles.infoTextSmall}>{cf.label}: {cf.value}</Text>
        ))}
      </View>
    )
  }

  const renderVehicleSection = () => {
    const showV = (fid: string) => !visibleVehicleFields || visibleVehicleFields.has(fid)
    const hasVehicle = data.vehicle && (showV('vehicle_name') || (showV('vin') && data.vehicle.vin) || (showV('license_plate') && data.vehicle.licensePlate))
    const hasVehCf = vehicleCf.some(cf => cf.value !== '' && cf.value != null)
    if (!hasVehicle && !hasVehCf) return null

    const fieldOrder = getOrderedFieldIds(visibleVehicleFields, ['vehicle_name', 'vin', 'license_plate'])
    const v = data.vehicle

    const renderField = (fid: string) => {
      if (!v || !showV(fid)) return null
      switch (fid) {
        case 'vehicle_name': return <Text key={fid} style={styles.infoTextBold}>{v.year} {v.make} {v.model}</Text>
        case 'vin': return v.vin ? <Text key={fid} style={styles.infoTextSmall}>{labels.vin ? fillTemplate(labels.vin, { vin: v.vin }) : `VIN: ${v.vin}`}</Text> : null
        case 'license_plate': return v.licensePlate ? <Text key={fid} style={styles.infoTextSmall}>{labels.plate ? fillTemplate(labels.plate, { plate: v.licensePlate }) : `Plate: ${v.licensePlate}`}</Text> : null
        default: return null
      }
    }

    return (
      <View style={styles.infoBox}>
        <Text style={styles.infoLabel}>{labels.vehicle || 'Vehicle'}</Text>
        {fieldOrder.map(renderField)}
        {vehicleCf.filter(cf => cf.value !== '' && cf.value != null).map((cf, i) => (
          <Text key={`cf-veh-${i}`} style={styles.infoTextSmall}>{cf.label}: {cf.value}</Text>
        ))}
      </View>
    )
  }

  const renderServiceSection = () => {
    const show = (fid: string) => !visibleServiceFields || visibleServiceFields.has(fid)
    const hasBuiltin = show('service_title')
    const hasCf = serviceCf.some(cf => cf.value !== '' && cf.value != null)
    if (!hasBuiltin && !hasCf) return null

    const fieldOrder = getOrderedFieldIds(visibleServiceFields, ['service_title'])

    const renderField = (fid: string) => {
      if (!show(fid)) return null
      switch (fid) {
        case 'service_title': return <Text key={fid} style={styles.infoTextBold}>{data.title}</Text>
        default: return null
      }
    }

    return (
      <View style={styles.infoBox}>
        <Text style={styles.infoLabel}>{labels.quoteDetails || 'Quote Details'}</Text>
        {fieldOrder.map(renderField)}
        {serviceCf.filter(cf => cf.value !== '' && cf.value != null).map((cf, i) => (
          <Text key={`cf-${i}`} style={styles.infoTextSmall}>{cf.label}: {cf.value}</Text>
        ))}
      </View>
    )
  }

  const renderPartsTable = () => {
    if (data.partItems.length === 0) return null
    return (
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
            <View key={i} style={{ ...styles.tableRow, ...(p.excluded ? { opacity: 0.5 } : {}) }}>
              <Text style={{ ...styles.tableCell, width: '15%', ...(p.excluded ? { textDecoration: 'line-through' } : {}) }}>{p.partNumber || '-'}</Text>
              <Text style={{ ...styles.tableCell, width: '35%', ...(p.excluded ? { textDecoration: 'line-through' } : {}) }}>{p.name}</Text>
              <Text style={{ ...styles.tableCell, width: '12%', textAlign: 'right', ...(p.excluded ? { textDecoration: 'line-through' } : {}) }}>
                {p.quantity}
              </Text>
              <Text style={{ ...styles.tableCell, width: '18%', textAlign: 'right', ...(p.excluded ? { textDecoration: 'line-through' } : {}) }}>
                {formatCurrency(p.unitPrice, currencyCode)}
              </Text>
              <Text style={{ ...styles.tableCellBold, width: '20%', textAlign: 'right', ...(p.excluded ? { textDecoration: 'line-through' } : {}) }}>
                {formatCurrency(p.total, currencyCode)}
              </Text>
            </View>
          ))}
        </View>
      </View>
    )
  }

  const renderLaborTable = () => {
    if (data.laborItems.length === 0) return null
    return (
      <View>
        <Text style={styles.sectionTitle}>{labels.labor || 'Labor'}</Text>
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={{ ...styles.tableHeaderCell, width: '45%' }}>{labels.description || 'Description'}</Text>
            <Text style={{ ...styles.tableHeaderCell, width: '15%', textAlign: 'right' }}>
              {labels.qtyOrHours || labels.hours || 'Qty / Hours'}
            </Text>
            <Text style={{ ...styles.tableHeaderCell, width: '20%', textAlign: 'right' }}>
              {labels.rate || 'Rate'}
            </Text>
            <Text style={{ ...styles.tableHeaderCell, width: '20%', textAlign: 'right' }}>
              {labels.total || 'Total'}
            </Text>
          </View>
          {data.laborItems.map((l, i) => {
            const isService = l.pricingType === 'service'
            return (
              <View key={i} style={{ ...styles.tableRow, ...(l.excluded ? { opacity: 0.5 } : {}) }}>
                <Text style={{ ...styles.tableCell, width: '45%', ...(l.excluded ? { textDecoration: 'line-through' } : {}) }}>{l.description}</Text>
                <Text style={{ ...styles.tableCell, width: '15%', textAlign: 'right', ...(l.excluded ? { textDecoration: 'line-through' } : {}) }}>
                  {isService
                    ? `${l.hours} ${labels.unit || 'unit'}`
                    : `${l.hours} ${labels.hrs || 'hrs'}`}
                </Text>
                <Text style={{ ...styles.tableCell, width: '20%', textAlign: 'right', ...(l.excluded ? { textDecoration: 'line-through' } : {}) }}>
                  {isService
                    ? formatCurrency(l.rate, currencyCode)
                    : labels.ratePerHour
                      ? fillTemplate(labels.ratePerHour, { rate: formatCurrency(l.rate, currencyCode) })
                      : `${formatCurrency(l.rate, currencyCode)}/hr`}
                </Text>
                <Text style={{ ...styles.tableCellBold, width: '20%', textAlign: 'right', ...(l.excluded ? { textDecoration: 'line-through' } : {}) }}>
                  {formatCurrency(l.total, currencyCode)}
                </Text>
              </View>
            )
          })}
        </View>
      </View>
    )
  }

  const renderTotals = () => {
    const laborTotal = data.laborItems.reduce((sum, l) => l.excluded ? sum : sum + l.total, 0)
    const partsTotal = data.partItems.reduce((sum, p) => p.excluded ? sum : sum + p.total, 0)
    const sub = laborTotal + partsTotal
    const disc = data.discountType === 'percentage'
      ? sub * (data.discountValue / 100)
      : data.discountType === 'fixed'
      ? Math.min(data.discountValue, sub)
      : 0
    const taxInclusive = data.taxInclusive ?? false
    const { taxAmount: tax, totalAmount: total } = calculateTotals({
      subtotal: sub,
      discountAmount: disc,
      taxRate: data.taxRate,
      taxInclusive,
    })
    return (
      <View style={styles.totalsBox}>
        {data.laborItems.length > 0 && (
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>{labels.labor || 'Labor'}</Text>
            <Text style={styles.totalValue}>
              {formatCurrency(laborTotal, currencyCode)}
            </Text>
          </View>
        )}
        {data.partItems.length > 0 && (
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>{labels.parts || 'Parts'}</Text>
            <Text style={styles.totalValue}>
              {formatCurrency(partsTotal, currencyCode)}
            </Text>
          </View>
        )}
        {sub > 0 && (
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>
              {taxInclusive
                ? (labels.subtotalInclTax || labels.subtotal || 'Subtotal (incl. tax)')
                : (labels.subtotal || 'Subtotal')}
            </Text>
            <Text style={styles.totalValue}>{formatCurrency(sub, currencyCode)}</Text>
          </View>
        )}
        {disc > 0 && (
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>
              {data.discountType === 'percentage'
                ? (labels.discountPercent ? fillTemplate(labels.discountPercent, { percent: String(data.discountValue) }) : `Discount (${data.discountValue}%)`)
                : (labels.discount || 'Discount')}
            </Text>
            <Text style={{ ...styles.totalValue, color: '#dc2626' }}>
              {formatCurrency(-disc, currencyCode)}
            </Text>
          </View>
        )}
        {data.taxRate > 0 && (
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>
              {taxInclusive
                ? (labels.taxIncluded
                    ? fillTemplate(labels.taxIncluded, { rate: String(data.taxRate) })
                    : `Includes tax (${data.taxRate}%)`)
                : (labels.tax
                    ? fillTemplate(labels.tax, { rate: String(data.taxRate) })
                    : `Tax (${data.taxRate}%)`)}
            </Text>
            <Text style={styles.totalValue}>{formatCurrency(tax, currencyCode)}</Text>
          </View>
        )}
        <View style={styles.totalDivider} />
        <View style={styles.grandTotalRow}>
          <Text style={styles.grandTotalLabel}>{labels.total || 'Total'}</Text>
          <Text style={styles.grandTotalValue}>
            {formatCurrency(total, currencyCode)}
          </Text>
        </View>
      </View>
    )
  }

  const renderGeneralSection = () => {
    if (generalFallbackCf.length === 0) return null
    return (
      <View style={{ marginTop: 10 }}>
        <CustomFields fields={generalFallbackCf} styles={styles} labels={labels} />
      </View>
    )
  }

  const renderNotes = () => {
    if (!data.description) return null
    return (
      <View style={styles.notesSection}>
        <Text style={styles.notesLabel}>Description</Text>
        <HtmlToPdf html={data.description} baseStyle={styles.notesText} fontBold={fontBold} />
      </View>
    )
  }

  const renderFooter = () => (
    <>
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
    </>
  )

  // ---------- Map section IDs to renderers ----------

  const renderSection = (sectionId: string) => {
    switch (sectionId) {
      case 'header':
        return headerStyle === 'compact'
          ? renderCompactHeader()
          : headerStyle === 'modern'
            ? renderModernHeader()
            : renderStandardHeader()
      case 'customer':
        return renderCustomerSection()
      case 'vehicle':
        return renderVehicleSection()
      case 'service':
        return renderServiceSection()
      case 'parts_table':
        return renderPartsTable()
      case 'labor_table':
        return renderLaborTable()
      case 'totals':
        return (
          <>
            {renderTotals()}
            {torqvoiceLogoDataUri && (
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 3, marginTop: 6 }}>
                <Text style={{ fontSize: 7, color: gray }}>{labels.poweredBy || 'Powered by'}</Text>
                <Image src={torqvoiceLogoDataUri} style={{ width: 12, height: 12 }} />
                <Text style={{ fontSize: 7, color: gray, fontFamily: fontBold }}>Torqvoice</Text>
              </View>
            )}
          </>
        )
      case 'general':
        return renderGeneralSection()
      case 'notes':
        return renderNotes()
      case 'footer':
        return renderFooter()
      default:
        return null
    }
  }

  // Use column-based grouping from layout config
  const effectiveSections = layoutConfig?.sections ?? getDefaultInvoiceLayout().sections
  const renderGroups = groupSectionsForRendering(effectiveSections)
  const renderedSections: React.ReactNode[] = []

  for (const group of renderGroups) {
    if (group.type === 'full-width') {
      if (group.sectionId === 'footer') continue
      renderedSections.push(
        <View key={group.sectionId}>{renderSection(group.sectionId)}</View>
      )
    } else {
      const allIds = [...group.left, ...group.right].filter(id => id !== 'footer')
      if (allIds.length === 0) continue
      renderedSections.push(
        <View key={`col-${allIds[0]}`} style={styles.infoRow}>
          <View style={{ flex: 1, gap: 4 }}>
            {group.left.map(id => <React.Fragment key={id}>{renderSection(id)}</React.Fragment>)}
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            {group.right.map(id => <React.Fragment key={id}>{renderSection(id)}</React.Fragment>)}
          </View>
        </View>
      )
    }
  }

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {renderedSections}
        {renderFooter()}
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
