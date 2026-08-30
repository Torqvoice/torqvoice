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
import type { TemplateConfig } from '@/features/vehicles/Components/invoice-pdf/types'
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
 * A quote, expressed as the document the designer edits, the same way the
 * invoice is. Quotes carry a validity date instead of a due date, lines the
 * customer opted out of, and no payment records.
 */

export interface QuotePrintData {
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
    unit?: string | null
    unitPrice: number
    total: number
    excluded?: boolean
  }[]
  laborItems: {
    description: string
    hours: number
    rate: number
    total: number
    pricingType?: string
    excluded?: boolean
  }[]
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

export interface QuotePrintInput {
  data: QuotePrintData
  workshop?: { name: string; address: string; phone: string; email: string; slogan?: string }
  currencyCode?: string
  currencyFormat?: 'symbol' | 'code'
  logoDataUri?: string
  torqvoiceLogoDataUri?: string
  dateFormat?: string
  timezone?: string
  template?: TemplateConfig
  portalUrl?: string
  pdfAttachmentNames?: string[]
  otherAttachmentNames?: string[]
  customFields?: Array<{ fieldId: string; label: string; value: string; fieldType: string }>
  labels?: Record<string, string>
  layoutConfig?: InvoiceLayoutConfig
}

function fillTemplate(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce((str, [key, val]) => str.replace(`{${key}}`, val), template)
}

export function buildQuotePrintSpec(input: QuotePrintInput): DocumentSpec {
  const { data, workshop, template } = input
  const labels = input.labels ?? {}
  const L = (key: string, fallback: string) => labels[key] || fallback

  const saved = input.layoutConfig
  let layout = saved ? mergeWithDefaults(saved) : getDefaultInvoiceLayout()

  // Custom fields no section claims still print in the extras panel.
  const assigned = new Set(
    layout.sections.flatMap((s) =>
      (s.fields ?? []).filter((f) => isCustomFieldId(f.id)).map((f) => f.id)
    )
  )
  const unassigned = (input.customFields ?? [])
    .map((cf) => toCustomFieldId(cf.fieldId))
    .filter((id) => !assigned.has(id))
  if (unassigned.length) {
    layout = {
      ...layout,
      sections: layout.sections.map((section) =>
        section.id === 'general'
          ? {
              ...section,
              fields: [
                ...(section.fields ?? []),
                ...unassigned.map((id) => ({ id, visible: true })),
              ],
            }
          : section
      ),
    }
  }

  const doc = layout.document ?? {}
  const cc = input.currencyCode || 'USD'
  const cf: 'symbol' | 'code' = input.currencyFormat === 'code' ? 'code' : 'symbol'
  const money = (value: number) => formatCurrency(value, cc, cf)
  const taxRate = data.taxRate
  const taxInclusive = data.taxInclusive ?? false
  const net = (value: number) => netLineTotal(value, taxRate, taxInclusive)

  const df = input.dateFormat || DEFAULT_DATE_FORMAT
  const tz = input.timezone || undefined
  const createdDate = formatDateForPdf(data.createdAt, df, tz)
  const validDate = data.validUntil ? formatDateForPdf(data.validUntil, df, tz) : null
  const quoteNum = data.quoteNumber || 'QUOTE'
  const shopName = workshop?.name || 'Torqvoice'

  const fields: Record<string, string> = {
    customer_name: data.customer?.name || '',
    customer_company: data.customer?.company || '',
    customer_address: data.customer?.address || '',
    customer_email: data.customer?.email || '',
    customer_phone: data.customer?.phone || '',
    customer_tax_id: data.customer?.taxId
      ? `${L('customerTaxId', 'Tax ID')}: ${data.customer.taxId}`
      : '',
    vehicle_name: data.vehicle
      ? `${data.vehicle.year} ${data.vehicle.make} ${data.vehicle.model}`
      : '',
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
    service_title: data.title || '',
    company_name: shopName,
    company_slogan: workshop?.slogan?.trim() || '',
    company_address: workshop?.address || '',
    company_phone: workshop?.phone
      ? labels.tel
        ? fillTemplate(labels.tel, { phone: workshop.phone })
        : `Tel: ${workshop.phone}`
      : '',
    company_email: workshop?.email || '',
    // The org number never printed on quote letterheads.
    company_org_number: '',
    bank_account: '',
    footer_note: `${
      validDate
        ? labels.validityFooterUntil
          ? fillTemplate(labels.validityFooterUntil, { date: validDate })
          : `This quote is valid until ${validDate}`
        : L('validityFooter30', 'This quote is valid for 30 days')
    } · ${shopName}`,
  }
  for (const cfEntry of input.customFields ?? []) {
    if (cfEntry.value === '' || cfEntry.value == null) continue
    fields[toCustomFieldId(cfEntry.fieldId)] =
      `${cfEntry.label}: ${formatFieldValue(cfEntry.value, cfEntry.fieldType)}`
  }

  const items: DocumentData['items'] = [
    ...data.laborItems.map((l, i) => ({
      n: String(i + 1),
      qty: String(l.hours),
      unit: l.pricingType === 'service' ? L('unit', 'unit') : L('hrs', 'hrs'),
      desc: l.description,
      price: money(net(l.rate)),
      total: money(net(l.total)),
      excluded: l.excluded,
    })),
    ...data.partItems.map((p, i) => ({
      n: String(data.laborItems.length + i + 1),
      qty: formatQuantity(p.quantity, p.unit),
      unit: p.unit || '',
      desc: p.name,
      sub: p.partNumber || undefined,
      price: money(net(p.unitPrice)),
      total: money(net(p.total)),
      excluded: p.excluded,
    })),
  ]

  const parts: DocumentData['parts'] = data.partItems.map((p) => ({
    ref: p.partNumber || '-',
    desc: p.name,
    qty: formatQuantity(p.quantity, p.unit),
    price: money(net(p.unitPrice)),
    total: money(net(p.total)),
    excluded: p.excluded,
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
      excluded: l.excluded,
    }
  })

  // Totals from the lines the customer kept; excluded ones do not count.
  const laborTotal = data.laborItems.reduce((sum, l) => (l.excluded ? sum : sum + l.total), 0)
  const partsTotal = data.partItems.reduce((sum, p) => (p.excluded ? sum : sum + p.total), 0)
  const subtotal = laborTotal + partsTotal
  const discount =
    data.discountType === 'percentage'
      ? subtotal * (data.discountValue / 100)
      : data.discountType === 'fixed'
        ? Math.min(data.discountValue, subtotal)
        : 0
  const { taxAmount, totalAmount } = calculateTotals({
    subtotal,
    discountAmount: discount,
    taxRate,
    taxInclusive,
  })

  const itemsTableVisible = layout.sections.some((s) => s.id === 'items_table' && s.visible)
  const totals: TotalLine[] = []
  if (!itemsTableVisible && data.laborItems.length > 0) {
    totals.push({ label: L('labor', 'Labor'), value: money(net(laborTotal)), kind: 'line' })
  }
  if (!itemsTableVisible && data.partItems.length > 0) {
    totals.push({ label: L('parts', 'Parts'), value: money(net(partsTotal)), kind: 'line' })
  }
  if (net(subtotal) > 0) {
    totals.push({ label: L('subtotal', 'Subtotal'), value: money(net(subtotal)), kind: 'line' })
  }
  if (net(discount) > 0) {
    totals.push({
      label:
        data.discountType === 'percentage'
          ? labels.discountPercent
            ? fillTemplate(labels.discountPercent, { percent: String(data.discountValue) })
            : `Discount (${data.discountValue}%)`
          : L('discount', 'Discount'),
      value: money(-net(discount)),
      kind: 'discount',
    })
  }
  if (taxRate > 0) {
    totals.push({
      label: labels.tax ? fillTemplate(labels.tax, { rate: String(taxRate) }) : `Tax (${taxRate}%)`,
      value: money(taxAmount),
      kind: 'line',
    })
  }
  totals.push({ label: L('total', 'Total'), value: money(totalAmount), kind: 'total' })

  const attachedDocuments = [
    ...(input.otherAttachmentNames ?? []),
    ...(input.pdfAttachmentNames ?? []).map((name) =>
      labels.attached ? fillTemplate(labels.attached, { name }) : `${name} (attached)`
    ),
  ]

  const documentData: DocumentData = {
    fields,
    logoUrl: input.logoDataUri,
    labels: {
      ...labels,
      // The title block prints the quote's own words for its cells.
      invoiceNumberLabel: labels.quoteNumberLabel || labels.invoiceNumberLabel || 'Quote No.',
      dueDateLabel: labels.validUntilLabel || labels.dueDateLabel || 'Valid Until',
    },
    meta: {
      title: L('title', 'QUOTE'),
      number: quoteNum,
      date: createdDate,
      due: validDate ?? undefined,
    },
    items,
    parts,
    labor,
    findings: [],
    totals,
    notes: {
      html: data.description ?? undefined,
      attachedDocuments: attachedDocuments.length ? attachedDocuments : undefined,
    },
    warranty: {},
    payment: [],
    branding: input.torqvoiceLogoDataUri ? { logoDataUri: input.torqvoiceLogoDataUri } : undefined,
    portalUrl: input.portalUrl,
    sectionLabels: {
      customer: L('to', 'To'),
      vehicle: L('vehicle', 'Vehicle'),
      service: L('quoteDetails', 'Quote Details'),
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
