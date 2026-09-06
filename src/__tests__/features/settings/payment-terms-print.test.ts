/**
 * @vitest-environment node
 *
 * Payment terms are the workshop's own sentence, written in payment settings.
 * The sheet used to invent one from the due date ("Net 14 Days") whenever a
 * due date existed, so a workshop that had written nothing still printed a
 * term it had never agreed to, right next to the due date it was counted off.
 * An empty field now prints no terms line at all.
 */
import { describe, expect, it } from 'vitest'
import { buildInvoicePrintSpec } from '@/features/invoice-designer/Pdf/buildInvoicePrint'
import {
  DESIGNER_LAYOUT_VERSION,
  getDefaultInvoiceLayout,
} from '@/features/settings/Schema/invoiceLayoutSchema'
import type { InvoiceLayoutConfig } from '@/features/settings/Schema/invoiceLayoutSchema'
import type { InvoiceData } from '@/features/vehicles/Components/invoice-pdf/types'

const data: InvoiceData = {
  id: 'svc-terms',
  title: 'Service',
  description: null,
  type: 'repair',
  serviceDate: new Date('2026-08-14'),
  invoiceDate: new Date('2026-08-14'),
  invoiceDueDate: new Date('2026-08-28'),
  shopName: 'Shop',
  techName: null,
  mileage: null,
  diagnosticNotes: null,
  invoiceNotes: null,
  subtotal: 100,
  taxRate: 0,
  taxAmount: 0,
  totalAmount: 100,
  cost: 100,
  invoiceNumber: 'INV-2026-1001',
  partItems: [],
  laborItems: [{ description: 'Work', hours: 1, rate: 100, total: 100 }],
  customer: null,
  vehicle: null,
}

/** The payment panel, as JSON, which is where a terms line would show up. */
function paymentPanel(paymentTerms?: string, layout?: InvoiceLayoutConfig) {
  const spec = buildInvoicePrintSpec({
    data,
    invoiceSettings: { currencyCode: 'EUR', bankAccount: 'XX00 1234', paymentTerms },
    ...(layout ? { template: { layoutConfig: layout } } : {}),
  })
  const block = spec.blocks.find((b) => b.id === 'bank_account')
  return JSON.stringify(block ?? {})
}

/** A designer-saved layout with the payment panel's fields set to `fields`. */
function layoutWithPaymentFields(fields: { id: string; visible: boolean }[]) {
  const layout = { ...getDefaultInvoiceLayout(), version: DESIGNER_LAYOUT_VERSION }
  layout.sections = layout.sections.map((s) => (s.id === 'bank_account' ? { ...s, fields } : s))
  return layout
}

describe('payment terms on a printed invoice', () => {
  it('prints no terms when the setting is empty, due date or not', () => {
    for (const terms of [undefined, '', '   ']) {
      const panel = paymentPanel(terms)
      expect(panel, `terms ${JSON.stringify(terms)}`).not.toContain('Payment Terms')
      // The date the money is due is its own line and stays.
      expect(panel).toContain('Due Date')
    }
  })

  it("prints the workshop's own terms when they have written some", () => {
    const panel = paymentPanel('Payable on collection')
    expect(panel).toContain('Payment Terms')
    expect(panel).toContain('Payable on collection')
  })
})

/**
 * Payment terms and due date print as rows of the payment panel and only got
 * their own switches once a workshop asked for them. Every layout saved before
 * that names neither, and a field a layout does not name is off, so the
 * switches had to arrive without taking the rows off anybody's paper.
 */
describe('the payment panel switches', () => {
  it('keeps both rows on a layout saved before the switches existed', () => {
    const panel = paymentPanel(
      'Payable on collection',
      layoutWithPaymentFields([
        { id: 'bank_account', visible: true },
        { id: 'org_number', visible: true },
      ])
    )
    expect(panel).toContain('Payment Terms')
    expect(panel).toContain('Due Date')
  })

  it.each([
    ['payment_terms', 'Payment Terms', 'Due Date'],
    ['due_date', 'Due Date', 'Payment Terms'],
  ])('takes the %s row off when it is switched off', (id, gone, kept) => {
    const panel = paymentPanel(
      'Payable on collection',
      layoutWithPaymentFields([
        { id: 'bank_account', visible: true },
        { id: 'org_number', visible: true },
        { id: 'payment_terms', visible: id !== 'payment_terms' },
        { id: 'due_date', visible: id !== 'due_date' },
      ])
    )
    expect(panel).not.toContain(gone)
    expect(panel).toContain(kept)
  })
})
