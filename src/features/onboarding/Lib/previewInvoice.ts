import type { InvoicePrintInput } from '@/features/invoice-designer/Pdf/buildInvoicePrint'
import { calculateTotals } from '@/lib/tax'
import { parseTaxRate, type SetupDraft } from './setupDraft'
import { starterTemplate } from './starterDesign'

/** The made-up job's prose, in the language customers get. */
export interface PreviewSample {
  jobTitle: string
  serviceType: string
  customerName: string
  customerAddress: string
  laborLine: string
  partLine: string
  /** Three more parts after the first, so the sheet looks like a real job. */
  part2: string
  part3: string
  part4: string
  /** Three more labour lines after the first. */
  labor2: string
  labor3: string
  labor4: string
  workshopName: string
}

const RATE = 65

/** The sample's parts: the oil in the workshop's own measure. */
function sampleParts(draft: SetupDraft, sample: PreviewSample) {
  const imperial = draft.measure === 'imperial'
  const lines = [
    { partNumber: 'OF-1182', name: sample.partLine, quantity: 1, unit: null, unitPrice: 12.9 },
    {
      partNumber: 'OL-5W30',
      name: sample.part2,
      quantity: imperial ? 5 : 4.5,
      unit: imperial ? 'qt' : 'l',
      unitPrice: imperial ? 13.5 : 14.5,
    },
    { partNumber: 'AF-2210', name: sample.part3, quantity: 1, unit: null, unitPrice: 24 },
    { partNumber: 'WB-650', name: sample.part4, quantity: 2, unit: null, unitPrice: 18.9 },
  ]
  return lines
    .filter((line) => line.name)
    .map((line) => ({ ...line, total: round(line.quantity * line.unitPrice) }))
}

function sampleLabor(sample: PreviewSample) {
  const lines = [
    { description: sample.laborLine, hours: 1.5 },
    { description: sample.labor2, hours: 0.3 },
    { description: sample.labor3, hours: 0.2 },
    { description: sample.labor4, hours: 0.5 },
  ]
  return lines
    .filter((line) => line.description)
    .map((line) => ({ ...line, rate: RATE, total: round(line.hours * RATE) }))
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

/** An address for the sample customer, made from their name: "camille.dubois@example.com". */
function sampleEmail(name: string): string {
  const local = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
  return `${local || 'customer'}@example.com`
}

/** The tax the preview charges, as the draft stands. */
export function previewTax(draft: SetupDraft): { rate: number; inclusive: boolean } {
  if (draft.taxChoice !== 'yes') return { rate: 0, inclusive: false }
  return { rate: parseTaxRate(draft.taxRate) ?? 0, inclusive: draft.taxInclusive }
}

/**
 * The first invoice as the setup would print it: the real document builder,
 * fed a small sample job, the labels of the language customers get, and every
 * choice made so far. Nothing here is drawn by hand.
 */
export function previewInvoiceInput(
  draft: SetupDraft,
  labels: Record<string, string>,
  sample: PreviewSample,
  today: Date = new Date()
): InvoicePrintInput {
  const partItems = sampleParts(draft, sample)
  const laborItems = sampleLabor(sample)
  const subtotal = round([...partItems, ...laborItems].reduce((sum, line) => sum + line.total, 0))
  const tax = previewTax(draft)
  const totals = calculateTotals({
    subtotal,
    discountAmount: 0,
    taxRate: tax.rate,
    taxInclusive: tax.inclusive,
  })
  const taxLabel = draft.taxChoice === 'yes' ? draft.taxLabel.trim() : ''
  const due = new Date(today)
  due.setDate(due.getDate() + 14)
  const dial = draft.dialCode ? `${draft.dialCode} ` : ''
  const customer = {
    name: sample.customerName,
    email: sampleEmail(sample.customerName),
    phone: `${dial}412 55 018`,
    address: sample.customerAddress,
    company: null,
  }
  return {
    data: {
      id: 'setup-preview',
      title: sample.jobTitle,
      description: null,
      type: sample.serviceType,
      serviceDate: today,
      invoiceDate: today,
      invoiceDueDate: due,
      shopName: null,
      techName: null,
      mileage: draft.kind === 'marine' ? null : 48210,
      diagnosticNotes: null,
      invoiceNotes: null,
      subtotal,
      taxRate: tax.rate,
      taxAmount: totals.taxAmount,
      taxInclusive: tax.inclusive,
      totalAmount: totals.totalAmount,
      cost: totals.totalAmount,
      invoiceNumber: '1001',
      partItems,
      laborItems,
      customer,
      vehicle:
        draft.kind === 'marine'
          ? {
              make: 'Yamaha',
              model: 'F150',
              year: 2021,
              vin: null,
              licensePlate: null,
              mileage: 0,
              customer,
            }
          : draft.kind === 'motorcycles'
            ? {
                make: 'Triumph',
                model: 'Street Triple',
                year: 2021,
                vin: null,
                licensePlate: 'AB12 CDE',
                mileage: 48210,
                customer,
              }
            : {
                make: 'Volkswagen',
                model: 'Golf',
                year: 2021,
                vin: null,
                licensePlate: 'AB12 CDE',
                mileage: 48210,
                customer,
              },
    },
    workshop: {
      name: draft.workshopName.trim() || sample.workshopName,
      address: draft.address.trim(),
      phone: `${dial}22 33 44 55`,
      email: '',
    },
    invoiceSettings: {
      currencyCode: draft.currencyCode,
      dateFormat: draft.dateFormat,
      timeFormat: draft.timeFormat,
      timezone: draft.timezone,
      unitSystem: draft.distance,
    },
    // As the PDF routes do: the workshop's own name for its tax.
    labels: taxLabel ? { ...labels, tax: `${taxLabel} ({rate}%)` } : labels,
    locale: draft.locale,
    // The template the workshop will start on, so the preview is its first invoice.
    template: starterTemplate(),
  }
}
