import { DEFAULT_DATE_FORMAT, formatDateForPdf } from '@/lib/format'
import {
  getDefaultLayout,
  mergeWithDefaults,
  type InvoiceLayoutConfig,
} from '@/features/settings/Schema/invoiceLayoutSchema'
import { BASE_FONT_SIZE } from '@/features/vehicles/Components/invoice-pdf/styles'
import type { TemplateConfig } from '@/features/vehicles/Components/invoice-pdf/types'
import {
  buildDocumentSpec,
  frameShadowWidth,
  mixColors,
  type DocumentData,
  type DocumentTheme,
} from '@/features/invoice-designer/Spec/buildSpec'
import type { DocumentSpec } from '@/features/invoice-designer/Spec/documentSpec'
import type { CertificateData } from '@/features/invoice-designer/Spec/certificateData'
import {
  CONDITION_TOKENS,
  TEST_RESULT_TOKENS,
  type Condition,
  type SeverityScale,
  countConditions,
  deriveTestResult,
  gradedConditionLabel,
  isDefect,
} from '../Lib/conditions'
import { defectsWorstFirst } from '../Lib/conversion'

/**
 * A completed inspection, expressed as the document the designer edits, the
 * way the invoice and the quote are. The certificate's own sections read
 * from `certificate`; the shared ones (letterhead, title strip, customer and
 * vehicle panels, notes, footer) read the same fields an invoice fills.
 */

export interface CertificatePrintItem {
  id: string
  name: string
  section: string
  sectionCode?: string | null
  code?: string | null
  condition: string
  notes: string | null
  sortOrder: number
  measuredValue?: number | null
  unit?: string | null
  textValue?: string | null
}

export interface CertificatePrintData {
  id: string
  status: string
  mileage: number | null
  notes: string | null
  createdAt: Date
  completedAt: Date | null
  severityScale: string | null
  country: string | null
  vehicleCategory: string | null
  nextTestDue: Date | null
  certificateNumber: string | null
  inspectorName: string | null
  testLocation: string | null
  template: { name: string; severityScale: string; country: string | null }
  technician?: { name: string } | null
  vehicle: {
    make: string
    model: string
    year: number
    vin: string | null
    licensePlate: string | null
    mileage: number | null
    customer: {
      name: string
      email?: string | null
      phone?: string | null
      address?: string | null
      company?: string | null
    } | null
  }
  items: CertificatePrintItem[]
}

export interface CertificatePrintInput {
  data: CertificatePrintData
  workshop?: { name: string; address: string; phone: string; email: string; slogan?: string }
  labels?: Record<string, string>
  logoDataUri?: string
  /** The inspector's saved signature, drawn on the signature line. */
  signatureDataUri?: string
  torqvoiceLogoDataUri?: string
  dateFormat?: string
  timezone?: string
  template?: TemplateConfig
  layoutConfig?: InvoiceLayoutConfig
  portalUrl?: string
  /** Photos on each check, keyed by check id, already sized for the page. */
  itemPhotos?: Record<string, { dataUri: string }[]>
  /** Photos on the inspection as a whole. */
  overviewPhotos?: { dataUri: string; caption: string | null }[]
  /** Names of the documents appended after the certificate. */
  attachedDocuments?: string[]
}

function fillTemplate(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce((str, [key, val]) => str.replace(`{${key}}`, val), template)
}

const RESULT_LABEL_KEY = {
  pass: 'resultPass',
  pass_minor: 'resultPassMinor',
  fail: 'resultFail',
  fail_dangerous: 'resultFailDangerous',
  incomplete: 'resultIncomplete',
} as const

const RESULT_DETAIL_KEY = {
  pass: 'resultDetailPass',
  pass_minor: 'resultDetailPassMinor',
  fail: 'resultDetailFail',
  fail_dangerous: 'resultDetailFailDangerous',
  incomplete: 'resultDetailIncomplete',
} as const

/** A plain note as the rich-text block expects it: paragraphs, nothing else. */
function notesHtml(notes: string | null): string | undefined {
  const text = notes?.trim()
  if (!text) return undefined
  const escapeText = (value: string) =>
    value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return text
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeText(paragraph).replace(/\n/g, '<br/>')}</p>`)
    .join('')
}

export function buildCertificatePrintSpec(input: CertificatePrintInput): DocumentSpec {
  const { data, workshop, template } = input
  const labels = input.labels ?? {}
  const L = (key: string, fallback: string) => labels[key] || fallback
  const layout = input.layoutConfig
    ? mergeWithDefaults({ ...input.layoutConfig, documentType: 'certificate' })
    : getDefaultLayout('certificate')
  const doc = layout.document ?? {}

  const df = input.dateFormat || DEFAULT_DATE_FORMAT
  const tz = input.timezone || undefined
  const testDate = formatDateForPdf(data.completedAt ?? data.createdAt, df, tz)
  const nextDue = data.nextTestDue ? formatDateForPdf(data.nextTestDue, df, tz) : null
  const shopName = workshop?.name || 'Torqvoice'
  const scale: SeverityScale =
    (data.severityScale ?? data.template.severityScale) === 'basic' ? 'basic' : 'eu'
  const country = data.country ?? data.template.country
  const inspector = data.inspectorName || data.technician?.name || ''
  const mileage = data.mileage ?? data.vehicle.mileage

  // The grade as the certificate words it, with the national number where
  // the country has one: "2 — Major defect".
  const conditionText = (condition: string) => {
    const suffix = condition.replace(/(^|_)([a-z])/g, (_, __, c: string) => c.toUpperCase())
    return L(`${scale}${suffix}`, CONDITION_TOKENS[condition as Condition]?.label ?? condition)
  }
  const gradeOf = (condition: string) =>
    gradedConditionLabel(condition, scale, country, conditionText(condition))

  const fields: Record<string, string> = {
    customer_name: data.vehicle.customer?.name || '',
    customer_company: data.vehicle.customer?.company || '',
    customer_address: data.vehicle.customer?.address || '',
    customer_email: data.vehicle.customer?.email || '',
    customer_phone: data.vehicle.customer?.phone || '',
    customer_tax_id: '',
    vehicle_name: `${data.vehicle.year} ${data.vehicle.make} ${data.vehicle.model}`,
    vin: data.vehicle.vin ? fillTemplate(L('vin', 'VIN: {vin}'), { vin: data.vehicle.vin }) : '',
    license_plate: data.vehicle.licensePlate
      ? fillTemplate(L('plate', 'Plate: {plate}'), { plate: data.vehicle.licensePlate })
      : '',
    mileage:
      mileage !== null && mileage !== undefined
        ? fillTemplate(L('mileage', 'Mileage: {mileage}'), { mileage: mileage.toLocaleString() })
        : '',
    // The facts of the test, each already worded as its own line.
    test_date: `${L('testDate', 'Date of test')}: ${testDate}`,
    test_location: data.testLocation
      ? `${L('testLocation', 'Place of test')}: ${data.testLocation}`
      : '',
    inspector: inspector ? `${L('inspector', 'Inspector')}: ${inspector}` : '',
    certificate_number: data.certificateNumber
      ? `${L('certificateNumber', 'Certificate number')}: ${data.certificateNumber}`
      : '',
    vehicle_category: data.vehicleCategory
      ? `${L('vehicleCategory', 'Vehicle category')}: ${data.vehicleCategory}`
      : '',
    odometer:
      mileage !== null && mileage !== undefined
        ? fillTemplate(L('mileage', 'Mileage: {mileage}'), { mileage: mileage.toLocaleString() })
        : '',
    next_test_due: nextDue ? `${L('nextTestDue', 'Next test due')}: ${nextDue}` : '',
    company_name: shopName,
    company_slogan: workshop?.slogan?.trim() || '',
    company_address: workshop?.address || '',
    company_phone: workshop?.phone
      ? fillTemplate(L('tel', 'Tel: {phone}'), { phone: workshop.phone })
      : '',
    company_email: workshop?.email || '',
    company_org_number: '',
    bank_account: '',
    footer_note: fillTemplate(L('footerText', 'Vehicle Inspection — {shopName}'), { shopName }),
  }

  const graded = data.items
    .filter((item) => item.condition !== 'not_inspected')
    .sort((a, b) => a.sortOrder - b.sortOrder)
  const counts = countConditions(graded)
  const result = deriveTestResult(graded)
  const resultToken = TEST_RESULT_TOKENS[result]

  const summaryParts: string[] = []
  for (const [key, count] of [
    ['pass', counts.pass],
    ['attention', counts.attention],
    ['fail', counts.fail],
    ['dangerous', counts.dangerous],
    ['not_applicable', counts.notApplicable],
  ] as const) {
    if (count > 0) summaryParts.push(`${count} × ${conditionText(key)}`)
  }

  const itemPhotos = input.itemPhotos ?? {}
  const readingOf = (item: CertificatePrintItem): string | null => {
    if (item.measuredValue !== null && item.measuredValue !== undefined) {
      return `${item.measuredValue}${item.unit ? ` ${item.unit}` : ''}`
    }
    return item.textValue?.trim() || null
  }
  const noteOf = (item: CertificatePrintItem): string | null => {
    const reading = readingOf(item)
    const note = item.notes?.trim() || null
    return [reading, note].filter(Boolean).join(' · ') || null
  }

  const sectionOrder: string[] = []
  const bySection: Record<string, CertificatePrintItem[]> = {}
  for (const item of graded) {
    if (!bySection[item.section]) {
      bySection[item.section] = []
      sectionOrder.push(item.section)
    }
    bySection[item.section].push(item)
  }

  const certificate: CertificateData = {
    result: {
      label: L(RESULT_LABEL_KEY[result], resultToken.label),
      detail: L(RESULT_DETAIL_KEY[result], resultToken.detail),
      color: resultToken.pdf,
    },
    summary: summaryParts.join(' · '),
    defects: defectsWorstFirst(graded).map((item) => ({
      code: item.code ?? null,
      name: item.name,
      grade: gradeOf(item.condition),
      color: CONDITION_TOKENS[item.condition as Condition]?.pdf ?? resultToken.pdf,
      notes: noteOf(item),
      photos: (itemPhotos[item.id] ?? []).map((photo) => photo.dataUri),
    })),
    sections: sectionOrder.map((name) => ({
      code: bySection[name][0]?.sectionCode ?? null,
      name,
      rows: bySection[name].map((item) => ({
        code: item.code ?? null,
        name: item.name,
        grade: gradeOf(item.condition),
        notes: noteOf(item),
        kind: isDefect(item.condition)
          ? 'defect'
          : item.condition === 'not_applicable'
            ? 'not_applicable'
            : 'pass',
      })),
    })),
    photos: input.overviewPhotos ?? [],
  }

  const documentData: DocumentData = {
    fields,
    logoUrl: input.logoDataUri,
    labels,
    meta: {
      title: L('title', 'VEHICLE INSPECTION'),
      number: data.certificateNumber || data.id.slice(-8).toUpperCase(),
      date: testDate,
      due: nextDue ?? undefined,
    },
    items: [],
    parts: [],
    labor: [],
    findings: [],
    totals: [],
    notes: { html: notesHtml(data.notes) },
    attachedDocuments: (input.attachedDocuments ?? []).map((name) =>
      fillTemplate(L('seeAppendedPages', '{name} (see appended pages)'), { name })
    ),
    warranty: {},
    payment: [],
    branding: input.torqvoiceLogoDataUri ? { logoDataUri: input.torqvoiceLogoDataUri } : undefined,
    portalUrl: input.portalUrl,
    sectionLabels: {
      customer: L('customer', 'Customer'),
      vehicle: L('vehicle', 'Vehicle'),
      test_details: L('testDetails', 'Test details'),
      defects: L('deficiencies', 'Deficiencies found'),
      results_table: L('allResults', 'All results'),
      inspection_photos: L('photos', 'Photos'),
    },
    certificate,
    signature: {
      heading: L('signature', 'Signature'),
      name: inspector,
      nameCaption: L('inspector', 'Inspector'),
      date: testDate,
      dateCaption: L('testDate', 'Date of test'),
      image: input.signatureDataUri,
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
    // A certificate never printed through the classic renderer: a workshop
    // reaches this builder only once it has a designed layout.
    classic: false,
  }

  return buildDocumentSpec(layout, theme, documentData)
}
