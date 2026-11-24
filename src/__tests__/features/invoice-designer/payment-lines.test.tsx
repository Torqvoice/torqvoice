/**
 * The payments a customer reads on the invoice: on the shared page, in the PDF
 * and in the portal, which all draw the same sheet.
 *
 * A payment received is money in and reads as the amount the customer paid,
 * not with a minus in front of it. Its method is a word in the document's
 * language ("Kort", not "(card)"). Money handed back is called a refund and is
 * the one figure with a minus, so Total less Payments received is still the
 * Amount Due under it.
 */

import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('lucide-react', () => ({
  Camera: () => <span />,
  ChevronLeft: () => <span />,
  ChevronRight: () => <span />,
  CreditCard: () => <span />,
  Download: () => <span />,
  FileText: () => <span />,
  Film: () => <span />,
  Loader2: () => <span />,
  Paperclip: () => <span />,
  X: () => <span />,
}))

import { InvoiceView } from '@/app/(public)/share/invoice/[orgId]/[token]/invoice-view'
import { buildInvoicePrintSpec } from '@/features/invoice-designer/Pdf/buildInvoicePrint'
import { loadPrintLabels } from '@/features/invoice-designer/Pdf/printLabels'
import type { InvoiceData, PaymentSummary } from '@/features/vehicles/Components/invoice-pdf/types'

const invoice: InvoiceData = {
  id: 'svc_payments01',
  title: 'Brake pads',
  description: null,
  type: 'repair',
  serviceDate: new Date('2026-11-20'),
  invoiceDate: new Date('2026-11-20'),
  invoiceDueDate: null,
  shopName: 'ZZ Test Garage',
  techName: null,
  mileage: null,
  diagnosticNotes: null,
  invoiceNotes: null,
  subtotal: 500,
  taxRate: 0,
  taxAmount: 0,
  totalAmount: 500,
  cost: 500,
  invoiceNumber: 'INV-1001',
  discountType: null,
  discountValue: 0,
  discountAmount: 0,
  partItems: [{ partNumber: 'P-1', name: 'Pads', quantity: 1, unitPrice: 500, total: 500 }],
  laborItems: [],
  vehicle: null,
}

/** A card payment, a cash payment and a refund of part of the card one. */
const payments: PaymentSummary = {
  totalPaid: 250,
  payments: [
    { amount: 200, date: '24/11/2026', method: 'card' },
    { amount: 100, date: '24/11/2026', method: 'cash' },
    { amount: -50, date: '25/11/2026', method: 'card' },
  ],
}

function totalsText(labels?: Record<string, string>, summary: PaymentSummary = payments) {
  const spec = buildInvoicePrintSpec({
    data: invoice,
    workshop: { name: 'ZZ Test Garage' },
    invoiceSettings: { currencyCode: 'GBP' },
    paymentSummary: summary,
    labels,
  })
  const totals = spec.blocks.find((b) => b.id === 'totals')
  const texts: string[] = []
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return
    const n = node as Record<string, unknown>
    if (n.kind === 'text' && typeof n.text === 'string') texts.push(n.text)
    for (const value of Object.values(n)) {
      if (Array.isArray(value)) value.forEach(walk)
      else if (value && typeof value === 'object') walk(value)
    }
  }
  walk(totals)
  return texts
}

/** The figure printed beside a label: the text right after it. */
function figureBeside(texts: string[], label: string) {
  const at = texts.indexOf(label)
  expect(at, `no line labelled "${label}" in ${JSON.stringify(texts)}`).toBeGreaterThan(-1)
  return texts[at + 1]
}

describe('payments on the invoice a customer reads', () => {
  it('lists each payment as money received, with its method in words', async () => {
    const texts = totalsText(await loadPrintLabels('en', {}))
    expect(figureBeside(texts, 'Total')).toBe('£500.00')
    expect(figureBeside(texts, 'Payments Received')).toBe('£250.00')
    expect(figureBeside(texts, '24/11/2026 (Card)')).toBe('£200.00')
    expect(figureBeside(texts, '24/11/2026 (Cash)')).toBe('£100.00')
    expect(figureBeside(texts, 'Amount Due')).toBe('£250.00')
    expect(texts.join(' ')).not.toMatch(/\(card\)|\(cash\)|-£200|-£100/)
  })

  it('calls money handed back a refund, the one figure with a minus', async () => {
    const texts = totalsText(await loadPrintLabels('en', {}))
    expect(figureBeside(texts, 'Refund 25/11/2026 (Card)')).toBe('-£50.00')
  })

  it('writes the method and the refund in the language of the document', async () => {
    const texts = totalsText(await loadPrintLabels('nb', {}))
    expect(figureBeside(texts, 'Mottatte betalinger')).toBe('£250.00')
    expect(figureBeside(texts, '24/11/2026 (Kort)')).toBe('£200.00')
    expect(figureBeside(texts, '24/11/2026 (Kontant)')).toBe('£100.00')
    expect(figureBeside(texts, 'Refusjon 25/11/2026 (Kort)')).toBe('-£50.00')
  })

  it('names a payment taken online after the vendor that took it', async () => {
    const texts = totalsText(await loadPrintLabels('de', {}), {
      totalPaid: 500,
      payments: [
        { amount: 300, date: '24/11/2026', method: 'stripe' },
        { amount: 200, date: '24/11/2026', method: 'transfer' },
      ],
    })
    expect(figureBeside(texts, '24/11/2026 (Stripe)')).toBe('£300.00')
    expect(figureBeside(texts, '24/11/2026 (Überweisung)')).toBe('£200.00')
    expect(texts).toContain('VOLLSTÄNDIG BEZAHLT')
  })

  it('shows the same on the shared page', async () => {
    const spec = buildInvoicePrintSpec({
      data: invoice,
      workshop: { name: 'ZZ Test Garage' },
      invoiceSettings: { currencyCode: 'GBP' },
      paymentSummary: payments,
      labels: await loadPrintLabels('en', {}),
    })
    const { container } = render(
      <InvoiceView
        spec={spec}
        record={{ ...invoice, manuallyPaid: false, payments: [], attachments: [] } as never}
        workshop={{ name: 'ZZ Test Garage' }}
        currencyCode="GBP"
        orgId="org-1"
        token="tok-1"
        enabledProviders={[]}
      />
    )
    const page = within(container)
    expect(page.getAllByText('24/11/2026 (Card)').length).toBeGreaterThan(0)
    expect(page.getAllByText('£200.00').length).toBeGreaterThan(0)
    expect(page.getAllByText('Refund 25/11/2026 (Card)').length).toBeGreaterThan(0)
    expect(screen.queryByText('-£200.00')).toBeNull()
    expect(screen.queryByText(/\(card\)/)).toBeNull()
  })
})
