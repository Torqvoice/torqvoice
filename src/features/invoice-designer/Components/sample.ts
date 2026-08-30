import type { DesignerWorkshop } from './types'

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
    customer_address: '12 Harbour Road, Springfield',
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
