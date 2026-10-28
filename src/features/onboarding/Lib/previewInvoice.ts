import type { InvoicePrintInput } from '@/features/invoice-designer/Pdf/buildInvoicePrint'
import { calculateTotals } from '@/lib/tax'
import { parseTaxRate, type SetupDraft } from './setupDraft'

/** The made-up job's prose, in the language customers get. */
export interface PreviewSample {
  jobTitle: string
  serviceType: string
  customerName: string
  customerAddress: string
  laborLine: string
  partLine: string
  workshopName: string
}

const LABOR = { hours: 1.5, rate: 65 }
const PART = { quantity: 1, unitPrice: 12.9 }

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
  const laborTotal = LABOR.hours * LABOR.rate
  const partTotal = PART.quantity * PART.unitPrice
  const subtotal = Math.round((laborTotal + partTotal) * 100) / 100
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
  const customer = {
    name: sample.customerName,
    email: null,
    phone: null,
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
      partItems: [
        {
          partNumber: null,
          name: sample.partLine,
          quantity: PART.quantity,
          unitPrice: PART.unitPrice,
          total: partTotal,
        },
      ],
      laborItems: [
        { description: sample.laborLine, hours: LABOR.hours, rate: LABOR.rate, total: laborTotal },
      ],
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
      phone: '',
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
  }
}
