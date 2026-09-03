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
function paymentPanel(paymentTerms?: string) {
  const spec = buildInvoicePrintSpec({
    data,
    invoiceSettings: { currencyCode: 'EUR', bankAccount: 'XX00 1234', paymentTerms },
  })
  const block = spec.blocks.find((b) => b.id === 'bank_account')
  return JSON.stringify(block ?? {})
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
