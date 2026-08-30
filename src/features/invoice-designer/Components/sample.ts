import type { DesignerWorkshop } from './types'

/**
 * What the canvas prints for each field the layout can show.
 *
 * Keyed by field id, because that is what a layout stores. Every value here
 * is deliberately made up: the designer is shown to every workshop, so it
 * must never carry a real customer, vehicle or account from anyone's books.
 * The workshop's own company details are the one exception, because the sheet
 * being previewed is that workshop's own sheet.
 */
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

export const SAMPLE_TABLES: SampleTables = {
  items: [
    {
      n: 1,
      qty: '2.5',
      unit: 'hrs',
      desc: 'Front brakes replaced',
      price: '€ 89.00',
      total: '€ 222.50',
    },
    {
      n: 2,
      qty: '1',
      unit: 'pcs',
      desc: 'Brake disc, front',
      sku: 'BD-1042',
      price: '€ 149.00',
      total: '€ 149.00',
    },
    {
      n: 3,
      qty: '1',
      unit: 'set',
      desc: 'Brake pad set, front axle',
      sku: 'BP-2210',
      price: '€ 96.50',
      total: '€ 96.50',
    },
    { n: 4, qty: '1', unit: 'x', desc: 'Consumables', price: '€ 12.00', total: '€ 12.00' },
  ],
  findings: [
    {
      severity: 'Needs work',
      color: '#f59e0b',
      description: 'Rear pads at 15%',
      notes: 'Replace within 5,000 km',
    },
    {
      severity: 'Monitor',
      color: '#3b82f6',
      description: 'Small oil weep at valve cover',
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
  notes: 'Thank you for choosing our workshop. Contact us if you have any questions.',
  warranty: '12 months warranty on parts and labour.',
  title: 'INVOICE',
}

/**
 * The value each field prints. The workshop's own details where it has them,
 * so the sheet on screen is the workshop's sheet; everything about the sample
 * job is invented.
 */
export function fieldValues(workshop: DesignerWorkshop): Record<string, string> {
  return {
    // A made-up customer, the same for every workshop.
    customer_name: 'Alex Carter',
    customer_company: 'Carter Logistics Ltd',
    customer_address: '12 Harbour Road, Springfield',
    customer_email: 'alex@example.com',
    customer_phone: '+1 555 0134',
    customer_tax_id: 'Tax ID: 000 000 000',
    // A made-up vehicle.
    vehicle_name: '2020 Volvo V60',
    vin: 'VIN: YV1AA0000L0000000',
    license_plate: 'Plate: AB 12345',
    mileage: 'Mileage: 84,120 km',
    // A made-up job.
    service_title: 'Annual service and brakes',
    service_type: 'Type: Repair',
    tech_name: 'Tech: Jamie Lee',
    // Company, on the letterhead and in the footer
    company_name: workshop.name || 'Your Workshop',
    // A placeholder when the workshop has none, so the slogan section is
    // something to see and drag rather than an invisible sliver.
    company_slogan: workshop.slogan || 'Quality service you can trust',
    company_address: workshop.address || '',
    company_phone: workshop.phone ? `Tel: ${workshop.phone}` : '',
    company_email: workshop.email || '',
    company_org_number: workshop.orgNumber ? `Org: ${workshop.orgNumber}` : '',
    footer_note: 'Thank you for your business',
    bank_account: 'XX00 1234 5678 9000 00',
    org_number: workshop.orgNumber ? `Org: ${workshop.orgNumber}` : '',
  }
}
