import type { DesignerWorkshop } from './types'

/**
 * What the canvas prints for each field the layout can show.
 *
 * Keyed by field id, because that is what a layout stores. The canvas used to
 * hold pre-baked lines per section, which is why turning a field on changed
 * nothing: there was no field to turn on, only a paragraph someone had written
 * out by hand.
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
      qty: '4.8',
      unit: 'hrs',
      desc: 'Front brakes replaced',
      price: '56,50 €',
      total: '271,20 €',
    },
    {
      n: 2,
      qty: '1',
      unit: 'Stk.',
      desc: 'Brake disc, front left',
      sku: '34116860018',
      price: '256,12 €',
      total: '256,12 €',
    },
    {
      n: 3,
      qty: '1',
      unit: 'Satz',
      desc: 'Brake pad set, front axle',
      sku: '34106889266',
      price: '239,94 €',
      total: '239,94 €',
    },
    { n: 4, qty: '1', unit: 'x', desc: 'Consumables', price: '4,96 €', total: '4,96 €' },
  ],
  findings: [
    {
      severity: 'Needs work',
      color: '#f59e0b',
      description: 'Rear pads at 15%',
      notes: 'Replace within 5,000 km',
    },
    { severity: 'Monitor', color: '#3b82f6', description: 'Weep at valve cover', notes: '' },
  ],
  subtotal: '1.053,63 €',
  tax: '200,19 €',
  total: '1.253,82 €',
  number: 'RE241096',
  date: '14.08.2026',
  due: '24.08.2026',
  customerNumber: 'D035156',
  notes: 'Please re-torque the wheel nuts after 100 km.',
  warranty: '12 months / 20,000 km on parts and labour.',
  title: 'INVOICE',
}

/**
 * The value each field prints. The workshop's own details where it has them,
 * so the sheet on screen is the workshop's sheet and not a stranger's.
 */
export function fieldValues(workshop: DesignerWorkshop): Record<string, string> {
  return {
    // Customer
    customer_name: 'Carl Hinrichs',
    customer_company: 'Hinrichs Transport GmbH',
    customer_address: 'Südgeorgsfehner Straße 5-7, 26689 Augustfehn',
    customer_email: 'carl@hinrichs.example',
    customer_phone: '+49 4489 1227',
    customer_tax_id: 'DE 123 456 789',
    // Vehicle
    vehicle_name: '2021 BMW M340d xDrive',
    vin: 'VIN: WBA51DZ050FL79472',
    license_plate: 'Plate: WST-X340',
    mileage: 'Mileage: 105,866 km',
    // Service
    service_title: 'Brakes and coolant',
    service_type: 'Type: Repair',
    tech_name: 'Tech: Manuel Lücking',
    // Company, on the letterhead and in the footer
    company_name: workshop.name || 'Your Workshop',
    company_slogan: workshop.slogan || '',
    company_address: workshop.address || '',
    company_phone: workshop.phone ? `Tel: ${workshop.phone}` : '',
    company_email: workshop.email || '',
    company_org_number: workshop.orgNumber ? `Org: ${workshop.orgNumber}` : '',
    footer_note: 'Thank you for your business',
    bank_account: 'DE89 2806 1822 1233 8613 01',
    org_number: workshop.orgNumber ? `Org: ${workshop.orgNumber}` : '',
  }
}
