import { toCustomFieldId } from '@/features/settings/Schema/invoiceLayoutSchema'
import { calculateTotals } from '@/lib/tax'
import { taxComponentLabel } from '@/lib/tax-components'
import type { DocumentData, PaymentPair, TotalLine } from '../Spec/buildSpec'
import type { DesignerWorkshop, DocumentType } from './types'

/**
 * What the canvas prints for each field the layout can show.
 *
 * Keyed by field id, because that is what a layout stores. Every value here
 * is deliberately made up: the designer is shown to every workshop, so it
 * must never carry a real customer, vehicle or account from anyone's books.
 * The workshop's own company details are the one exception, because the sheet
 * being previewed is that workshop's own sheet.
 *
 * The prose is translated, because the preview is meant to look like the sheet
 * the workshop will actually print, and that sheet is printed in the customer's
 * language. Names, plates and account numbers stay as they are: they read the
 * same everywhere, and translating them would only make them look real.
 */

/** A translator, narrowed to what this file asks of it. */
export type SampleT = (key: string, values?: Record<string, string | number>) => string

/**
 * The document labels the print path resolves from `pdf.json`, so the preview
 * names its columns and panels the way the printed sheet does.
 */
export type PrintLabels = Record<string, string>

/** `{name}` style placeholders, the same substitution the print builders use. */
export function fillTemplate(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce((str, [key, val]) => str.replace(`{${key}}`, val), template)
}

export interface SampleTables {
  items: {
    n: number
    qty: string
    unit: string
    desc: string
    sku?: string
    price: string
    total: string
  }[]
  findings: { severity: string; color: string; description: string; notes: string }[]
  subtotal: string
  tax: string
  total: string
  number: string
  date: string
  due: string
  customerNumber: string
  notes: string
  warranty: string
  title: string
}

export function sampleTables(t: SampleT, labels: PrintLabels): SampleTables {
  const L = (key: string, fallback: string) => labels[key] || fallback
  return {
    items: [
      {
        n: 1,
        qty: '2.5',
        unit: L('hrs', 'hrs'),
        desc: t('sample.itemLabor'),
        price: '€ 89.00',
        total: '€ 222.50',
      },
      {
        n: 2,
        qty: '1',
        unit: t('sample.unitPcs'),
        desc: t('sample.itemDisc'),
        sku: 'BD-1042',
        price: '€ 149.00',
        total: '€ 149.00',
      },
      {
        n: 3,
        qty: '1',
        unit: t('sample.unitSet'),
        desc: t('sample.itemPads'),
        sku: 'BP-2210',
        price: '€ 96.50',
        total: '€ 96.50',
      },
      {
        n: 4,
        qty: '1',
        unit: t('sample.unitEach'),
        desc: t('sample.itemConsumables'),
        price: '€ 12.00',
        total: '€ 12.00',
      },
    ],
    findings: [
      {
        severity: L('findingSeverityNeedsWork', 'Medium'),
        color: '#f59e0b',
        description: t('sample.findingPads'),
        notes: t('sample.findingPadsNote'),
      },
      {
        severity: L('findingSeverityMonitor', 'Low'),
        color: '#3b82f6',
        description: t('sample.findingOilWeep'),
        notes: '',
      },
    ],
    subtotal: '€ 480.00',
    tax: '€ 120.00',
    total: '€ 600.00',
    number: 'INV-2026-0042',
    date: '14.08.2026',
    due: '28.08.2026',
    customerNumber: 'C-0117',
    notes: t('sample.notes'),
    warranty: t('sample.warranty'),
    title: L('title', 'INVOICE'),
  }
}

/**
 * The value each field prints. The workshop's own details where it has them,
 * so the sheet on screen is the workshop's sheet; everything about the sample
 * job is invented.
 */
export function fieldValues(
  workshop: DesignerWorkshop,
  t: SampleT,
  labels: PrintLabels
): Record<string, string> {
  const L = (key: string, fallback: string) => labels[key] || fallback
  return {
    // A made-up customer, the same for every workshop.
    customer_name: 'Alex Carter',
    customer_company: 'Carter Logistics Ltd',
    // Two lines, because a customer address is written on two and the
    // designer should show what that does to the block before it prints.
    customer_address: '12 Harbour Road\nSpringfield',
    customer_email: 'alex@example.com',
    customer_phone: '+1 555 0134',
    customer_tax_id: `${L('customerTaxId', 'Tax ID')}: 000 000 000`,
    // A made-up vehicle.
    vehicle_name: '2020 Volvo V60',
    vin: fillTemplate(L('vin', 'VIN: {vin}'), { vin: 'YV1AA0000L0000000' }),
    license_plate: fillTemplate(L('plate', 'Plate: {plate}'), { plate: 'AB 12345' }),
    mileage: fillTemplate(L('mileage', 'Mileage: {mileage}'), {
      mileage: `84,120 ${L('km', 'km')}`,
    }),
    // A made-up job.
    service_title: t('sample.serviceTitle'),
    service_type: fillTemplate(L('type', 'Type: {type}'), { type: t('sample.serviceType') }),
    tech_name: fillTemplate(L('tech', 'Tech: {tech}'), { tech: 'Jamie Lee' }),
    // Company, on the letterhead and in the footer
    company_name: workshop.name || t('sample.companyName'),
    // A placeholder when the workshop has none, so the slogan section is
    // something to see and drag rather than an invisible sliver.
    company_slogan: workshop.slogan || t('sample.slogan'),
    company_address: workshop.address || '',
    company_phone: workshop.phone
      ? fillTemplate(L('tel', 'Tel: {phone}'), { phone: workshop.phone })
      : '',
    company_email: workshop.email || '',
    company_org_number: workshop.orgNumber
      ? fillTemplate(L('org', 'Org: {org}'), { org: workshop.orgNumber })
      : '',
    footer_note: t('sample.footerNote'),
    bank_account: 'XX00 1234 5678 9000 00',
    org_number: workshop.orgNumber
      ? fillTemplate(L('org', 'Org: {org}'), { org: workshop.orgNumber })
      : '',
  }
}

/** The sample's money, written the way its other figures are. */
function sampleMoney(value: number): string {
  return `€ ${value.toFixed(2)}`
}

/**
 * The tax rows of the sample, and the registration numbers they bring: the
 * workshop's own split when it has one, taxed on the sample's net subtotal
 * so the lines add up on the canvas as they will on paper; otherwise the
 * single 25% line every workshop has always seen here.
 */
function sampleTax(
  workshop: DesignerWorkshop,
  sample: SampleTables,
  labels: PrintLabels
): { lines: TotalLine[]; total: string; registrations: PaymentPair[] } {
  const L = (key: string, fallback: string) => labels[key] || fallback
  const components = workshop.taxComponents ?? null
  if (!components || components.length === 0) {
    return {
      lines: [
        {
          // The tax label carries the rate, the way the printed sheet does.
          label: fillTemplate(L('tax', 'Tax ({rate}%)'), { rate: '25' }),
          value: sample.tax,
          kind: 'line',
        },
      ],
      total: sample.total,
      registrations: [],
    }
  }
  const subtotal = Number(sample.subtotal.replace(/[^\d.]/g, ''))
  const totals = calculateTotals({
    subtotal,
    discountAmount: 0,
    taxRate: 0,
    taxInclusive: false,
    components,
  })
  return {
    lines: (totals.components ?? []).map((component) => ({
      label: taxComponentLabel(component),
      value: sampleMoney(component.amount),
      kind: 'line' as const,
    })),
    total: sampleMoney(totals.totalAmount),
    registrations: components
      .filter((component) => component.registrationNumber)
      .map((component) => ({
        label: fillTemplate(L('taxRegistrationLabel', '{name} No.'), { name: component.name }),
        value: component.registrationNumber as string,
      })),
  }
}

/**
 * The whole sample document: what a workshop's own sheet says, with the
 * sample standing in for a job. One builder, so the designer's canvas and the
 * template cards in settings preview exactly the same paper.
 */
export function buildSampleData(
  workshop: DesignerWorkshop,
  customFields: { id: string; label?: string | null; name: string; isActive: boolean }[],
  t: SampleT,
  labels: PrintLabels,
  docType: DocumentType
): DocumentData {
  const L = (key: string, fallback: string) => labels[key] || fallback
  const sample = sampleTables(t, labels)
  const values = fieldValues(workshop, t, labels)
  const tax = sampleTax(workshop, sample, labels)
  return {
    fields: {
      ...values,
      // A custom field prints whatever the job carries; here it shows its
      // own name so the workshop can see where it will sit.
      ...Object.fromEntries(
        customFields
          .filter((f) => f.isActive)
          .map((f) => [toCustomFieldId(f.id), `${f.label || f.name}: ${t('sample.value')}`])
      ),
    },
    logoUrl: workshop.logoUrl || undefined,
    labels,
    meta: {
      title: sample.title,
      number: sample.number,
      customerNumber: sample.customerNumber,
      date: sample.date,
      due: sample.due,
    },
    items: sample.items.map((item) => ({
      n: String(item.n),
      qty: item.qty,
      unit: item.unit,
      desc: item.desc,
      sub: item.sku,
      price: item.price,
      total: item.total,
    })),
    parts: sample.items
      .filter((item) => item.sku)
      .map((item) => ({
        ref: item.sku as string,
        desc: item.desc,
        qty: item.qty,
        price: item.price,
        total: item.total,
      })),
    labor: sample.items
      .filter((item) => !item.sku)
      .map((item) => ({
        desc: item.desc,
        qty: `${item.qty} ${item.unit}`,
        rate: item.price,
        total: item.total,
      })),
    findings: sample.findings,
    totals: [
      { label: L('subtotal', 'Subtotal'), value: sample.subtotal, kind: 'line' as const },
      ...tax.lines,
      { label: L('total', 'Total'), value: tax.total, kind: 'total' as const },
      // A settled invoice, so the payment line and the paid stamp can be
      // seen and styled. Quotes never carry payments, so theirs ends at the
      // total.
      ...(docType === 'invoice'
        ? [
            {
              label: `${sample.date} (Visa)`,
              value: `-${tax.total}`,
              kind: 'payment' as const,
            },
            { label: L('paidInFull', 'PAID IN FULL'), value: '', kind: 'paid' as const },
          ]
        : []),
    ],
    notes: { html: sample.notes },
    // Stand-ins for files a job carries, so the block can be found, placed
    // and styled. Filenames need no translating.
    attachedDocuments: [
      fillTemplate(L('seeAppendedPages', '{name} (see appended pages)'), {
        name: 'inspection-report.pdf',
      }),
      'tire-photos.jpg',
    ],
    warranty: { duration: sample.warranty },
    payment: [
      { id: 'bank_account', label: L('bankAccount', 'Bank Account'), value: values.bank_account },
      {
        id: 'org_number',
        label: L('orgNumberLabel', 'Org. Number'),
        value: values.org_number || `${L('org', 'Org: {org}').replace('{org}', '123 456 789')}`,
      },
      {
        // The workshop's own terms, or a stand-in when they have written none,
        // so the row is something to see and switch rather than an absence.
        // The stand-in prints as nothing, which is why the canvas marks it.
        id: 'payment_terms',
        label: L('paymentTermsLabel', 'Payment Terms'),
        value: workshop.paymentTerms?.trim() || t('sample.paymentTerms'),
      },
      { id: 'due_date', label: L('dueDateLabel', 'Due Date'), value: sample.due },
      // The workshop's registration for each of its taxes, where it has one;
      // the printed sheet carries these the same way, after the rows above.
      ...tax.registrations,
    ],
    // A stand-in link, so the canvas shows the portal line the printed sheet
    // carries and the footer's switch for it has something to switch.
    portalUrl: 'https://example.com/portal/a1b2c3',
    sectionLabels: {
      customer: L('billTo', 'Bill To'),
      vehicle: L('vehicle', 'Vehicle'),
      service: L('service', 'Service'),
      bank_account: L('paymentInformation', 'Payment Information'),
      general: L('customFieldsTitle', 'Additional Information'),
      findings: L('findings', 'Observations'),
      test_details: L('testDetails', 'Test details'),
      defects: L('deficiencies', 'Deficiencies found'),
      results_table: L('allResults', 'All results'),
      inspection_photos: L('photos', 'Photos'),
      signature: L('signature', 'Signature'),
    },
    ...(docType === 'certificate' ? sampleCertificate(t, labels, values, sample) : {}),
  }
}

/** A small grey square, so the photo blocks have something to place. */
const SAMPLE_PHOTO = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="158" height="119"><rect width="158" height="119" fill="#e5e7eb"/><path d="M40 84l28-32 22 26 14-16 24 22H40z" fill="#9ca3af"/><circle cx="112" cy="40" r="9" fill="#9ca3af"/></svg>'
)}`

/**
 * The certificate's own part of the sample: a car that passed with one
 * minor defect, so every block has something to draw, and the fields of the
 * test details panel worded the way the print words them.
 */
function sampleCertificate(
  t: SampleT,
  labels: PrintLabels,
  values: Record<string, string>,
  sample: SampleTables
): Pick<DocumentData, 'fields' | 'meta' | 'certificate' | 'notes' | 'attachedDocuments'> {
  const L = (key: string, fallback: string) => labels[key] || fallback
  const grade = (key: string, fallback: string) => L(key, fallback)
  return {
    fields: {
      ...values,
      // A certificate carries no bank details in its footer.
      bank_account: '',
      customer_tax_id: '',
      test_date: `${L('testDate', 'Date of test')}: ${sample.date}`,
      test_location: `${L('testLocation', 'Place of test')}: ${values.company_address || t('sample.testLocation')}`,
      inspector: `${L('inspector', 'Inspector')}: Jamie Lee`,
      certificate_number: `${L('certificateNumber', 'Certificate number')}: CERT-2026-0042`,
      vehicle_category: `${L('vehicleCategory', 'Vehicle category')}: M1`,
      odometer: values.mileage,
      next_test_due: `${L('nextTestDue', 'Next test due')}: ${sample.due}`,
    },
    meta: {
      title: L('title', 'VEHICLE INSPECTION'),
      number: 'CERT-2026-0042',
      date: sample.date,
      due: sample.due,
    },
    notes: { html: `<p>${t('sample.certificateNotes')}</p>` },
    attachedDocuments: [
      fillTemplate(L('seeAppendedPages', '{name} (see appended pages)'), {
        name: 'signed-inspection-form.pdf',
      }),
    ],
    certificate: {
      result: {
        label: L('resultPassMinor', 'Pass with minor defects'),
        detail: L(
          'resultDetailPassMinor',
          'The vehicle passes. Repair the minor deficiencies without undue delay.'
        ),
        color: { bg: '#fef9c3', text: '#713f12' },
      },
      summary: `11 × ${grade('euPass', 'No defect')} · 1 × ${grade('euAttention', 'Minor defect')} · 1 × ${grade('euNotApplicable', 'Not applicable')}`,
      defects: [
        {
          code: '1.1.13',
          name: t('sample.checkBrakeHoses'),
          grade: `1 — ${grade('euAttention', 'Minor defect')}`,
          color: { bg: '#fef9c3', text: '#713f12' },
          notes: t('sample.checkBrakeHosesNote'),
          photos: [SAMPLE_PHOTO],
        },
      ],
      sections: [
        {
          code: '1',
          name: t('sample.sectionBrakes'),
          rows: [
            {
              code: '1.1.1',
              name: t('sample.checkBrakePedal'),
              grade: grade('euPass', 'No defect'),
              notes: null,
              kind: 'pass',
            },
            {
              code: '1.1.13',
              name: t('sample.checkBrakeHoses'),
              grade: `1 — ${grade('euAttention', 'Minor defect')}`,
              notes: t('sample.checkBrakeHosesNote'),
              kind: 'defect',
            },
            {
              code: '1.1.17',
              name: t('sample.checkBrakeFluid'),
              grade: grade('euPass', 'No defect'),
              notes: null,
              kind: 'pass',
            },
          ],
        },
        {
          code: '4',
          name: t('sample.sectionLighting'),
          rows: [
            {
              code: '4.1.1',
              name: t('sample.checkHeadlamps'),
              grade: grade('euPass', 'No defect'),
              notes: null,
              kind: 'pass',
            },
            {
              code: '4.5.1',
              name: t('sample.checkFogLamp'),
              grade: grade('euNotApplicable', 'Not applicable'),
              notes: null,
              kind: 'not_applicable',
            },
          ],
        },
      ],
      photos: [
        { dataUri: SAMPLE_PHOTO, caption: t('sample.photoFront') },
        { dataUri: SAMPLE_PHOTO, caption: t('sample.photoOdometer') },
      ],
      signature: { inspector: 'Jamie Lee', date: sample.date },
    },
  }
}
