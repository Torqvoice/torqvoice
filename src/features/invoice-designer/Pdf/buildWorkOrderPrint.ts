import {
  DEFAULT_DATE_FORMAT,
  DEFAULT_TIME_FORMAT,
  formatCurrency,
  formatDateForPdf,
  formatDateTime,
} from '@/lib/format'
import { documentLaborLines, isShopFeeLine } from '@/features/settings/Lib/shopFee'
import { formatQuantity } from '@/lib/format-quantity'
import { calculateTotals, netLineTotal } from '@/lib/tax'
import { parseTaxComponents } from '@/lib/tax-components'
import { taxLines } from './taxLines'
import {
  getDefaultLayout,
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
import { warrantyForPrint } from './warrantyPrint'
import { type ConditionMapLabels, conditionMapForPrint } from '@/features/condition-map/Lib/print'
import type { ConditionMarkData } from '@/features/condition-map/Lib/marks'

/**
 * A job as the sheet the customer signs and the technician works from.
 *
 * The same record the invoice prints, read while the job is still open: the
 * customer and the car, what they came in with, the work and the parts with
 * their prices, and the totals they are agreeing to, with a line for their
 * pen at the bottom. Nothing of the bill (payments, bank details, a due
 * date) is here, because none of it exists yet. The sheet is never frozen:
 * every print says the job as it stands and the date it was printed.
 */

/** What the work order carries beyond what the invoice's data already says. */
export interface WorkOrderJob {
  /** The job's number as the strip prints it. */
  orderNumber: string
  /** The status in the reader's words: the workshop's own name for it, or the stage. */
  statusLabel: string
  workBay?: string | null
  promisedAt?: Date | string | null
  /** What the customer came in with, in the order they said it. */
  concerns: { description: string; correction?: string | null }[]
  /** A code that opens this job on a phone, when the layout prints one. */
  qrDataUri?: string
  /** When the sheet was printed, which the footer and the signature date say. */
  printedAt: Date
  /**
   * The vehicle's condition marks: what the customer acknowledges was there
   * at drop-off. Every open mark prints, this job's own in colour.
   */
  conditionMarks?: ConditionMarkData[]
  bodyType?: string | null
  conditionMapLabels?: ConditionMapLabels
}

export interface WorkOrderPrintInput {
  data: InvoiceData
  job: WorkOrderJob
  workshop?: WorkshopInfo
  invoiceSettings?: InvoiceSettingsProps
  logoDataUri?: string
  /** Who signs for the workshop: whoever opened the job, with their saved signature. */
  signer?: { name: string; dataUri?: string }
  template?: TemplateConfig
  torqvoiceLogoDataUri?: string
  labels?: Record<string, string>
}

function fillTemplate(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce((str, [key, val]) => str.replace(`{${key}}`, val), template)
}

/** A plain note as the rich-text block expects it: paragraphs, nothing else. */
export function plainTextHtml(text: string | null | undefined): string | undefined {
  const trimmed = text?.trim()
  if (!trimmed) return undefined
  const escapeText = (value: string) =>
    value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return trimmed
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeText(paragraph).replace(/\n/g, '<br/>')}</p>`)
    .join('')
}

/**
 * The layout the print follows: the saved work order design filled out with
 * the work order's defaults, and any custom field no section claims put in
 * the extras panel rather than lost.
 */
function resolveLayout(input: WorkOrderPrintInput): InvoiceLayoutConfig {
  const saved = input.template?.layoutConfig
  const layout = saved
    ? mergeWithDefaults({ ...saved, documentType: 'work_order' })
    : getDefaultLayout('work_order')

  let sections = layout.sections
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

/** Whether the layout prints the code that opens the job on a phone. */
export function workOrderQrWanted(layout: Pick<InvoiceLayoutConfig, 'sections'>): boolean {
  return layout.sections.some((s) => s.id === 'job_qr' && s.visible)
}

export function buildWorkOrderPrintSpec(input: WorkOrderPrintInput): DocumentSpec {
  const { workshop, invoiceSettings, template, job } = input
  const data = { ...input.data, laborItems: documentLaborLines(input.data.laborItems) }
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
  const linesInclTax = invoiceSettings?.lineItemsInclTax === true && taxRate > 0
  const gross = (value: number) => (taxInclusive ? value : value * (1 + taxRate / 100))
  const shown = linesInclTax ? gross : net

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

  const df = invoiceSettings?.dateFormat || DEFAULT_DATE_FORMAT
  const tz = invoiceSettings?.timezone || undefined
  const day = (value: Date | string) => formatDateForPdf(value, df, tz)
  const timeFormat = invoiceSettings?.timeFormat === '24h' ? '24h' : DEFAULT_TIME_FORMAT
  const moment = (value: Date | string) => formatDateTime(value, df, timeFormat, tz)
  const openedOn = day(data.startDateTime ?? data.serviceDate)
  const printedOn = day(job.printedAt)

  const shopDisplayName = workshop?.name || data.shopName || 'Torqvoice'
  const customer = data.customer ?? data.vehicle?.customer
  const vehicleName = data.vehicle
    ? `${data.vehicle.year} ${data.vehicle.make} ${data.vehicle.model}`
    : ''
  const tech = data.technician?.name || data.techName || ''
  const unit = invoiceSettings?.unitSystem === 'metric' ? L('km', 'km') : L('mi', 'mi')

  const fields: Record<string, string> = {
    customer_name: customer?.name || '',
    customer_company: customer?.company || '',
    customer_address: customer?.address || '',
    customer_email: customer?.email || '',
    customer_phone: customer?.phone || '',
    customer_tax_id: customer?.taxId ? `${L('customerTaxId', 'Tax ID')}: ${customer.taxId}` : '',
    vehicle_name: vehicleName,
    vin: data.vehicle?.vin ? fillTemplate(L('vin', 'VIN: {vin}'), { vin: data.vehicle.vin }) : '',
    license_plate: data.vehicle?.licensePlate
      ? fillTemplate(L('plate', 'Plate: {plate}'), { plate: data.vehicle.licensePlate })
      : '',
    mileage: data.mileage
      ? `${fillTemplate(L('mileage', 'Mileage: {mileage}'), {
          mileage: data.mileage.toLocaleString(),
        })} ${unit}`
      : '',
    service_title: data.title || '',
    service_type: data.vehicle ? fillTemplate(L('type', 'Type: {type}'), { type: data.type }) : '',
    tech_name: tech ? fillTemplate(L('tech', 'Tech: {tech}'), { tech }) : '',
    // The facts of the job, each already worded as its own line.
    status: job.statusLabel
      ? fillTemplate(L('status', 'Status: {status}'), { status: job.statusLabel })
      : '',
    technician: tech ? fillTemplate(L('technician', 'Technician: {tech}'), { tech }) : '',
    scheduled: data.startDateTime
      ? fillTemplate(L('scheduled', 'Scheduled: {date}'), { date: moment(data.startDateTime) })
      : '',
    promised: job.promisedAt
      ? fillTemplate(L('promised', 'Promised: {date}'), { date: moment(job.promisedAt) })
      : '',
    work_bay: job.workBay ? fillTemplate(L('workBay', 'Bay: {bay}'), { bay: job.workBay }) : '',
    company_name: shopDisplayName,
    company_slogan: workshop?.slogan?.trim() || '',
    company_address: workshop?.address || '',
    company_phone: workshop?.phone
      ? fillTemplate(L('tel', 'Tel: {phone}'), { phone: workshop.phone })
      : '',
    company_email: workshop?.email || '',
    company_org_number:
      invoiceSettings?.showOrgNumber && invoiceSettings?.orgNumber
        ? fillTemplate(L('org', 'Org: {org}'), { org: invoiceSettings.orgNumber })
        : '',
    bank_account: '',
    // Every print says when it was taken, because the job keeps moving.
    footer_note: `${invoiceSettings?.footerNote || shopDisplayName} · ${fillTemplate(
      L('printedOn', 'Printed {date}'),
      { date: printedOn }
    )}`,
  }
  for (const cfEntry of data.customFields ?? []) {
    if (cfEntry.value === '' || cfEntry.value == null) continue
    fields[toCustomFieldId(cfEntry.fieldId)] =
      `${cfEntry.label}: ${formatFieldValue(cfEntry.value, cfEntry.fieldType)}`
  }

  const items: DocumentData['items'] = [
    ...data.laborItems.map((l, i) => ({
      n: String(i + 1),
      qty: String(l.hours),
      unit: l.pricingType === 'service' || isShopFeeLine(l) ? L('unit', 'unit') : L('hrs', 'hrs'),
      desc: l.description,
      price: money(shown(l.rate)),
      total: money(shown(l.total)),
    })),
    ...data.partItems.map((p, i) => ({
      n: String(data.laborItems.length + i + 1),
      qty: formatQuantity(p.quantity, p.unit),
      unit: p.unit || '',
      desc: p.name,
      sub: p.partNumber || undefined,
      price: money(shown(p.unitPrice)),
      total: money(shown(p.total)),
    })),
  ]
  const parts: DocumentData['parts'] = data.partItems.map((p) => ({
    ref: p.partNumber || '-',
    desc: p.name,
    qty: formatQuantity(p.quantity, p.unit),
    price: money(shown(p.unitPrice)),
    total: money(shown(p.total)),
  }))
  const labor: DocumentData['labor'] = data.laborItems.map((l) => {
    const isService = l.pricingType === 'service' || isShopFeeLine(l)
    return {
      desc: l.description,
      qty: isService ? `${l.hours} ${L('unit', 'unit')}` : `${l.hours} ${L('hrs', 'hrs')}`,
      rate: isService
        ? money(shown(l.rate))
        : fillTemplate(L('ratePerHour', '{rate}/hr'), { rate: money(shown(l.rate)) }),
      total: money(shown(l.total)),
    }
  })

  // The board copy's list: the work without its prices, a fee left out
  // because nobody ticks off a fee.
  const checklist = data.laborItems
    .filter((l) => !isShopFeeLine(l))
    .map((l) => ({
      label: l.description,
      detail:
        l.pricingType === 'service'
          ? undefined
          : l.hours
            ? `${l.hours} ${L('hrs', 'hrs')}`
            : undefined,
    }))

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

  // The same ladder the invoice prints, without the payments: nothing has
  // been paid on a job that is still open.
  const itemsTableVisible = layout.sections.some((s) => s.id === 'items_table' && s.visible)
  const totals: TotalLine[] = []
  if (!itemsTableVisible && data.partItems.length > 0) {
    totals.push({ label: L('parts', 'Parts'), value: money(shown(partsSubtotal)), kind: 'line' })
  }
  if (!itemsTableVisible && data.laborItems.length > 0) {
    totals.push({ label: L('labor', 'Labor'), value: money(shown(laborSubtotal)), kind: 'line' })
  }
  const displaySubtotal = shown(data.subtotal)
  if (displaySubtotal > 0) {
    totals.push({
      label: linesInclTax
        ? L('subtotalInclTax', 'Subtotal (incl. tax)')
        : L('subtotal', 'Subtotal'),
      value: money(displaySubtotal),
      kind: 'line',
    })
  }
  const displayDiscount = shown(data.discountAmount ?? 0)
  if (displayDiscount > 0) {
    totals.push({
      label:
        data.discountType === 'percentage'
          ? fillTemplate(L('discountPercent', 'Discount ({percent}%)'), {
              percent: String(data.discountValue),
            })
          : L('discount', 'Discount'),
      value: money(-displayDiscount),
      kind: 'discount',
    })
  }
  totals.push(
    ...taxLines({
      taxRate,
      taxAmount: data.taxAmount,
      components: parseTaxComponents(data.taxComponents),
      linesInclTax,
      labels,
      money,
    })
  )
  totals.push({ label: L('total', 'Total'), value: money(displayTotal), kind: 'total' })

  const mapSection = layout.sections.find((s) => s.id === 'condition_map')
  const conditionMap =
    job.conditionMarks && job.conditionMapLabels
      ? conditionMapForPrint({
          bodyType: job.bodyType,
          marks: job.conditionMarks,
          scope: { serviceRecordId: data.id },
          includePrevious:
            mapSection?.fields?.find((f) => f.id === 'previous_marks')?.visible !== false,
          labels: job.conditionMapLabels,
          width: 515 - 2 * (doc.margin ?? 40) + 80,
        })
      : null

  const documentData: DocumentData = {
    fields,
    logoUrl: input.logoDataUri,
    labels,
    meta: {
      title: L('title', 'WORK ORDER'),
      number: job.orderNumber,
      customerNumber: customer?.customerNumber ?? undefined,
      date: openedOn,
      plate: data.vehicle?.licensePlate ?? undefined,
    },
    items,
    parts,
    labor,
    findings,
    totals,
    notes: { html: data.invoiceNotes ?? undefined },
    warranty: warrantyForPrint(data, {
      labels,
      unitSystem: invoiceSettings?.unitSystem,
      expires: data.warrantyExpiresAt ? day(data.warrantyExpiresAt) : undefined,
    }),
    payment: [],
    branding: input.torqvoiceLogoDataUri ? { logoDataUri: input.torqvoiceLogoDataUri } : undefined,
    sectionLabels: {
      customer: L('customer', 'Customer'),
      vehicle: L('vehicle', 'Vehicle'),
      service: L('service', 'Service'),
      job_details: L('jobDetails', 'Job details'),
      general: L('customFieldsTitle', 'Additional Information'),
      findings: L('findings', 'Findings'),
      condition_map: L('conditionMapTitle', 'Vehicle condition'),
    },
    conditionMap: conditionMap ?? undefined,
    workOrder: {
      concerns: job.concerns.map((concern) => ({
        description: concern.description,
        detail: concern.correction?.trim() || undefined,
      })),
      description: { html: plainTextHtml(data.description) },
      checklist,
      qr: job.qrDataUri
        ? { dataUri: job.qrDataUri, label: L('scanToOpen', 'Scan to open this work order') }
        : undefined,
    },
    signature: {
      heading: L('signature', 'Signature'),
      name: input.signer?.name ?? '',
      nameCaption: L('signedBy', 'Signed by'),
      date: printedOn,
      dateCaption: L('signatureDate', 'Date'),
      image: input.signer?.dataUri,
      customerName: customer?.name ?? '',
      customerCaption: L('customerSignature', 'Customer signature'),
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
    stripeColor: doc.stripeColor || mixColors(background, text, 0.045),
    headerStyle,
    frameSide: template?.frameSide === 'right' ? 'right' : 'left',
    frameBorderColor: template?.frameBorderColor || undefined,
    frameShadow: frameShadowWidth(template?.frameShadow),
    frameRadius: template?.frameRadius ?? 0,
    logoSize: template?.logoSize ?? 100,
    // A work order never printed through the classic renderer.
    classic: false,
  }

  return buildDocumentSpec(layout, theme, documentData)
}
