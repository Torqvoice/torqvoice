import { DEFAULT_DATE_FORMAT, formatCurrency, formatDateForPdf } from '@/lib/format'
import { formatQuantity } from '@/lib/format-quantity'
import { calculateTotals, netLineTotal } from '@/lib/tax'
import {
  getDefaultInvoiceLayout,
  isCustomFieldId,
  mergeWithDefaults,
  toCustomFieldId,
  type InvoiceLayoutConfig,
} from '@/features/settings/Schema/invoiceLayoutSchema'
import { formatFieldValue } from '@/features/vehicles/Components/invoice-pdf/CustomFields'
import { BASE_FONT_SIZE } from '@/features/vehicles/Components/invoice-pdf/styles'
import type {
  InvoiceData,
  InvoiceSettingsProps,
  PaymentSummary,
  TemplateConfig,
  WorkshopInfo,
} from '@/features/vehicles/Components/invoice-pdf/types'
import {
  buildDocumentSpec,
  frameShadowWidth,
  mixColors,
  type DocumentData,
  type DocumentTheme,
  type TotalLine,
} from '../Spec/buildSpec'
import type { DocumentSpec } from '../Spec/documentSpec'

/**
 * A real job, expressed as the document the designer edits.
 *
 * Everything the old PDF components computed for themselves — net prices,
 * dates, discounts, payments, custom fields, translated labels — is computed
 * once here and handed to the generator as plain strings. From that point on
 * the invoice prints through exactly the pipeline the designer previews, so
 * what the workshop arranged is what the customer receives.
 */

export interface InvoicePrintInput {
  data: InvoiceData
  workshop?: WorkshopInfo
  invoiceSettings?: InvoiceSettingsProps
  paymentSummary?: PaymentSummary
  pdfAttachmentNames?: string[]
  otherAttachmentNames?: string[]
  logoDataUri?: string
  template?: TemplateConfig
  torqvoiceLogoDataUri?: string
  portalUrl?: string
  telegramQrDataUri?: string
  telegramLabel?: string
  labels?: Record<string, string>
}

function fillTemplate(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce((str, [key, val]) => str.replace(`{${key}}`, val), template)
}

/**
 * The layout the print follows: the saved one filled out with defaults, with
 * two legacy adjustments. Template-level logo toggles apply when no layout
 * was saved, and custom fields no section claims still print in the extras
 * panel rather than vanishing.
 */
function resolveLayout(input: InvoicePrintInput): InvoiceLayoutConfig {
  const saved = input.template?.layoutConfig
  const layout = saved ? mergeWithDefaults(saved) : getDefaultInvoiceLayout()

  let sections = layout.sections
  if (!saved) {
    sections = sections.map((section) =>
      section.id === 'header'
        ? {
            ...section,
            fields: section.fields?.map((field) =>
              field.id === 'logo'
                ? { ...field, visible: input.template?.showLogo !== false }
                : field.id === 'company_name'
                  ? { ...field, visible: input.template?.showCompanyName !== false }
                  : field
            ),
          }
        : section
    )
  }

  const assigned = new Set(
    sections.flatMap((s) => (s.fields ?? []).filter((f) => isCustomFieldId(f.id)).map((f) => f.id))
  )
  const unassigned = (input.data.customFields ?? [])
    .map((cf) => toCustomFieldId(cf.fieldId))
    .filter((id) => !assigned.has(id))
  if (unassigned.length) {
    sections = sections.map((section) =>
      section.id === 'general'
        ? {
            ...section,
            fields: [...(section.fields ?? []), ...unassigned.map((id) => ({ id, visible: true }))],
          }
        : section
    )
  }

  return { ...layout, sections }
}

export function buildInvoicePrintSpec(input: InvoicePrintInput): DocumentSpec {
  const { data, workshop, invoiceSettings, paymentSummary, template } = input
  const labels = input.labels ?? {}
  const L = (key: string, fallback: string) => labels[key] || fallback

  const layout = resolveLayout(input)
  const doc = layout.document ?? {}

  const cc = invoiceSettings?.currencyCode || 'USD'
  const cf: 'symbol' | 'code' = invoiceSettings?.currencyFormat === 'code' ? 'code' : 'symbol'
  const money = (value: number) => formatCurrency(value, cc, cf)
  const taxRate = data.taxRate
  const taxInclusive = data.taxInclusive ?? false
  const net = (value: number) => netLineTotal(value, taxRate, taxInclusive)

  const partsSubtotal = data.partItems.reduce((sum, p) => sum + p.total, 0)
  const laborSubtotal = data.laborItems.reduce((sum, l) => sum + l.total, 0)
  const computedSubtotal = partsSubtotal + laborSubtotal
  const computedDiscount =
    data.discountType === 'percentage'
      ? computedSubtotal * ((data.discountValue || 0) / 100)
      : data.discountType === 'fixed'
        ? Math.min(data.discountValue || 0, computedSubtotal)
        : 0
  const { totalAmount: computedTotal } = calculateTotals({
    subtotal: computedSubtotal,
    discountAmount: computedDiscount,
    taxRate,
    taxInclusive,
  })
  const displayTotal =
    data.totalAmount > 0 ? data.totalAmount : computedTotal > 0 ? computedTotal : data.cost

  const invoiceNum = data.invoiceNumber || `INV-${data.id.slice(-8).toUpperCase()}`
  const df = invoiceSettings?.dateFormat || DEFAULT_DATE_FORMAT
  const tz = invoiceSettings?.timezone || undefined
  const effectiveInvoiceDate = data.invoiceDate ?? data.startDateTime ?? data.serviceDate
  const serviceDate = formatDateForPdf(effectiveInvoiceDate, df, tz)
  const dueDateRaw = data.invoiceDueDate
    ? new Date(data.invoiceDueDate)
    : (invoiceSettings?.dueDays || 0) > 0
      ? new Date(
          new Date(effectiveInvoiceDate).getTime() + (invoiceSettings?.dueDays || 0) * 86400000
        )
      : null
  const dueDate = dueDateRaw ? formatDateForPdf(dueDateRaw, df, tz) : null

  const balanceDue = paymentSummary ? displayTotal - paymentSummary.totalPaid : displayTotal
  const isPaidInFull = paymentSummary ? paymentSummary.totalPaid >= displayTotal : false

  const shopDisplayName = workshop?.name || data.shopName || 'Torqvoice'
  const customer = data.customer ?? data.vehicle?.customer
  const vehicleName = data.vehicle
    ? `${data.vehicle.year} ${data.vehicle.make} ${data.vehicle.model}`
    : ''
  const tech = data.technician?.name || data.techName

  // -------------------------------------------------------------------------
  // Fields: everything a panel can print, already formatted.
  // -------------------------------------------------------------------------
  const fields: Record<string, string> = {
    customer_name: customer?.name || '',
    customer_company: customer?.company || '',
    customer_address: customer?.address || '',
    customer_email: customer?.email || '',
    customer_phone: customer?.phone || '',
    customer_tax_id: customer?.taxId ? `${L('customerTaxId', 'Tax ID')}: ${customer.taxId}` : '',
    vehicle_name: vehicleName,
    vin: data.vehicle?.vin
      ? labels.vin
        ? fillTemplate(labels.vin, { vin: data.vehicle.vin })
        : `VIN: ${data.vehicle.vin}`
      : '',
    license_plate: data.vehicle?.licensePlate
      ? labels.plate
        ? fillTemplate(labels.plate, { plate: data.vehicle.licensePlate })
        : `Plate: ${data.vehicle.licensePlate}`
      : '',
    mileage: data.mileage
      ? `${
          labels.mileage
            ? fillTemplate(labels.mileage, { mileage: data.mileage.toLocaleString() })
            : `Mileage: ${data.mileage.toLocaleString()}`
        } ${invoiceSettings?.unitSystem === 'metric' ? L('km', 'km') : L('mi', 'mi')}`
      : '',
    service_title: data.title || '',
    // Counter sales (no vehicle) aren't a service; the default type is noise.
    service_type: data.vehicle
      ? labels.type
        ? fillTemplate(labels.type, { type: data.type })
        : `Type: ${data.type}`
      : '',
    tech_name: tech ? (labels.tech ? fillTemplate(labels.tech, { tech }) : `Tech: ${tech}`) : '',
    company_name: shopDisplayName,
    company_slogan: workshop?.slogan?.trim() || '',
    company_address: workshop?.address || '',
    company_phone: workshop?.phone
      ? labels.tel
        ? fillTemplate(labels.tel, { phone: workshop.phone })
        : `Tel: ${workshop.phone}`
      : '',
    company_email: workshop?.email || '',
    company_org_number:
      invoiceSettings?.showOrgNumber && invoiceSettings?.orgNumber
        ? labels.org
          ? fillTemplate(labels.org, { org: invoiceSettings.orgNumber })
          : `Org: ${invoiceSettings.orgNumber}`
        : '',
    bank_account: invoiceSettings?.bankAccount?.split(/\r?\n/).filter(Boolean).join(' · ') || '',
    footer_note: invoiceSettings?.footerNote || `${shopDisplayName} · ${serviceDate}`,
  }
  for (const cfEntry of data.customFields ?? []) {
    if (cfEntry.value === '' || cfEntry.value == null) continue
    fields[toCustomFieldId(cfEntry.fieldId)] =
      `${cfEntry.label}: ${formatFieldValue(cfEntry.value, cfEntry.fieldType)}`
  }

  // -------------------------------------------------------------------------
  // Tables. Labor first, then parts: a job reads as the work that was done
  // followed by what it took.
  // -------------------------------------------------------------------------
  const items: DocumentData['items'] = [
    ...data.laborItems.map((l, i) => ({
      n: String(i + 1),
      qty: String(l.hours),
      unit: l.pricingType === 'service' ? L('unit', 'unit') : L('hrs', 'hrs'),
      desc: l.description,
      price: money(net(l.rate)),
      total: money(net(l.total)),
    })),
    ...data.partItems.map((p, i) => ({
      n: String(data.laborItems.length + i + 1),
      qty: formatQuantity(p.quantity, p.unit),
      unit: p.unit || '',
      desc: p.name,
      sub: p.partNumber || undefined,
      price: money(net(p.unitPrice)),
      total: money(net(p.total)),
    })),
  ]

  const parts: DocumentData['parts'] = data.partItems.map((p) => ({
    ref: p.partNumber || '-',
    desc: p.name,
    qty: formatQuantity(p.quantity, p.unit),
    price: money(net(p.unitPrice)),
    total: money(net(p.total)),
  }))

  const labor: DocumentData['labor'] = data.laborItems.map((l) => {
    const isService = l.pricingType === 'service'
    return {
      desc: l.description,
      qty: isService ? `${l.hours} ${L('unit', 'unit')}` : `${l.hours} ${L('hrs', 'hrs')}`,
      rate: isService
        ? money(net(l.rate))
        : labels.ratePerHour
          ? fillTemplate(labels.ratePerHour, { rate: money(net(l.rate)) })
          : `${money(net(l.rate))}/hr`,
      total: money(net(l.total)),
    }
  })

  const severityLabels: Record<string, string> = {
    urgent: L('findingSeverityUrgent', 'Urgent'),
    needs_work: L('findingSeverityNeedsWork', 'Needs Work'),
    monitor: L('findingSeverityMonitor', 'Monitor'),
  }
  const severityColors: Record<string, string> = {
    urgent: '#ef4444',
    needs_work: '#f59e0b',
    monitor: '#3b82f6',
  }
  const findings: DocumentData['findings'] = (data.findings ?? []).map((f) => ({
    severity: severityLabels[f.severity] || f.severity,
    color: severityColors[f.severity] || '#666666',
    description: f.description,
    notes: f.notes || '',
  }))

  // -------------------------------------------------------------------------
  // Totals: category subtotals when the combined table is off, then the same
  // ladder the old sheet printed — subtotal, discount, tax, total, payments.
  // -------------------------------------------------------------------------
  const itemsTableVisible = layout.sections.some((s) => s.id === 'items_table' && s.visible)
  const totals: TotalLine[] = []
  if (!itemsTableVisible && data.partItems.length > 0) {
    totals.push({ label: L('parts', 'Parts'), value: money(net(partsSubtotal)), kind: 'line' })
  }
  if (!itemsTableVisible && data.laborItems.length > 0) {
    totals.push({ label: L('labor', 'Labor'), value: money(net(laborSubtotal)), kind: 'line' })
  }
  const displaySubtotal = net(data.subtotal)
  if (displaySubtotal > 0) {
    totals.push({ label: L('subtotal', 'Subtotal'), value: money(displaySubtotal), kind: 'line' })
  }
  const displayDiscount = net(data.discountAmount ?? 0)
  if (displayDiscount > 0) {
    totals.push({
      label:
        data.discountType === 'percentage'
          ? labels.discountPercent
            ? fillTemplate(labels.discountPercent, { percent: String(data.discountValue) })
            : `Discount (${data.discountValue}%)`
          : L('discount', 'Discount'),
      value: money(-displayDiscount),
      kind: 'discount',
    })
  }
  if (taxRate > 0) {
    totals.push({
      label: labels.tax ? fillTemplate(labels.tax, { rate: String(taxRate) }) : `Tax (${taxRate}%)`,
      value: money(data.taxAmount),
      kind: 'line',
    })
  }
  totals.push({ label: L('total', 'Total'), value: money(displayTotal), kind: 'total' })
  if (paymentSummary && paymentSummary.payments.length > 0) {
    for (const payment of paymentSummary.payments) {
      totals.push({
        label: `${payment.date} (${payment.method})`,
        value: money(-payment.amount),
        kind: 'payment',
      })
    }
    totals.push(
      isPaidInFull
        ? { label: L('paidInFull', 'PAID IN FULL'), value: '', kind: 'paid' }
        : { label: L('amountDue', 'Amount Due'), value: money(balanceDue), kind: 'due' }
    )
  }

  // -------------------------------------------------------------------------
  // The rest of the sheet.
  // -------------------------------------------------------------------------
  const attachedDocuments = [
    ...(input.pdfAttachmentNames ?? []).map((name) =>
      labels.seeAppendedPages
        ? fillTemplate(labels.seeAppendedPages, { name })
        : `${name} (see appended pages)`
    ),
    ...(input.otherAttachmentNames ?? []),
  ]

  const warrantyParts: string[] = []
  if (data.warrantyMonths) {
    warrantyParts.push(
      `${data.warrantyMonths} ${
        labels.warrantyMonthsUnit || (data.warrantyMonths === 1 ? 'month' : 'months')
      }`
    )
  }
  if (data.warrantyMileage) {
    warrantyParts.push(`${data.warrantyMileage.toLocaleString()} ${L('km', 'km')}`)
  }

  const netDays = dueDateRaw
    ? Math.max(
        0,
        Math.ceil((dueDateRaw.getTime() - new Date(effectiveInvoiceDate).getTime()) / 86400000)
      )
    : 0
  const paymentTermsText =
    netDays > 0
      ? labels.netDays
        ? fillTemplate(labels.netDays, { days: String(netDays) })
        : `Net ${netDays} Days`
      : invoiceSettings?.paymentTerms || ''

  const payment: DocumentData['payment'] = []
  if (invoiceSettings?.bankAccount) {
    payment.push({
      id: 'bank_account',
      label: L('bankAccount', 'Bank Account'),
      value: invoiceSettings.bankAccount.split(/\r?\n/).filter(Boolean).join('\n'),
    })
  }
  if (invoiceSettings?.orgNumber) {
    payment.push({
      id: 'org_number',
      label: L('orgNumberLabel', 'Org. Number'),
      value: invoiceSettings.orgNumber,
    })
  }
  if (paymentTermsText) {
    payment.push({ label: L('paymentTermsLabel', 'Payment Terms'), value: paymentTermsText })
  }
  if (dueDate) {
    payment.push({ label: L('dueDateLabel', 'Due Date'), value: dueDate })
  }

  const documentData: DocumentData = {
    fields,
    logoUrl: input.logoDataUri,
    labels,
    meta: {
      title: L('title', 'INVOICE'),
      number: invoiceNum,
      customerNumber: customer?.customerNumber ?? undefined,
      date: serviceDate,
      due: dueDate ?? undefined,
    },
    items,
    parts,
    labor,
    findings,
    totals,
    notes: {
      html: data.invoiceNotes ?? undefined,
      attachedDocuments: attachedDocuments.length ? attachedDocuments : undefined,
    },
    warranty: {
      duration: warrantyParts.length ? warrantyParts.join(' / ') : undefined,
      expires: data.warrantyExpiresAt
        ? formatDateForPdf(data.warrantyExpiresAt, df, tz)
        : undefined,
      terms: data.warrantyNotes ?? undefined,
    },
    payment,
    telegramQr: input.telegramQrDataUri
      ? {
          dataUri: input.telegramQrDataUri,
          label: input.telegramLabel || 'Chat with us on Telegram',
        }
      : undefined,
    branding: input.torqvoiceLogoDataUri ? { logoDataUri: input.torqvoiceLogoDataUri } : undefined,
    portalUrl: input.portalUrl,
    sectionLabels: {
      customer: L('billTo', 'Bill To'),
      vehicle: L('vehicle', 'Vehicle'),
      service: L('service', 'Service'),
      bank_account: L('paymentInformation', 'Payment Information'),
      general: L('customFieldsTitle', 'Additional Information'),
      findings: L('findings', 'Findings'),
    },
  }

  const primary = template?.primaryColor || '#d97706'
  const headerStyle = template?.headerStyle || 'standard'
  const banded = headerStyle === 'framed' || headerStyle === 'modern'
  const text = template?.textColor || '#111827'
  const background = template?.backgroundColor || '#ffffff'

  const theme: DocumentTheme = {
    primary,
    background,
    text,
    muted: template?.textColor ? mixColors(text, background, 0.42) : '#6b7280',
    accent: doc.accentColor || primary,
    companyText: template?.companyTextColor || (banded ? '#ffffff' : primary),
    fontFamily: doc.fontFamily || template?.fontFamily || 'Helvetica',
    fontSize: doc.fontSize ?? BASE_FONT_SIZE,
    margin: doc.margin ?? 40,
    rowPadding: doc.rowPadding ?? 5,
    stripes: doc.stripes !== false,
    stripeColor: doc.stripeColor || '#f3f4f6',
    headerStyle,
    frameSide: template?.frameSide === 'right' ? 'right' : 'left',
    frameBorderColor: template?.frameBorderColor || undefined,
    frameShadow: frameShadowWidth(template?.frameShadow),
    logoSize: template?.logoSize ?? 100,
  }

  return buildDocumentSpec(layout, theme, documentData)
}
