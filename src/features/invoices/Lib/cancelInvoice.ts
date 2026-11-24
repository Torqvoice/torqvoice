/**
 * Cancelling an invoice that went out, instead of deleting it.
 *
 * Once an invoice has reached the customer (issued, or sent or paid before
 * issuing tracked it; see invoiceWentOut) its number belongs to the books.
 * Most countries' accounting rules want invoice numbers without gaps, so the
 * job is kept, set to cancelled, and shows as cancelled everywhere it is
 * read. Money already taken is handed back as a refund: a negative payment
 * on the same invoice, the shape a ledger's refund already arrives in.
 *
 * The wording here is the server's refusal, read by whoever pressed the
 * button; the screens offer Cancel before anybody gets this far.
 */

export const CANCELLED_JOB_REFUSAL =
  'This invoice is cancelled and can no longer be changed. Its number stays in the numbering.'

/** A change refused because the job's invoice is cancelled; matched by name, like the lock's. */
export class CancelledInvoiceError extends Error {
  constructor() {
    super(CANCELLED_JOB_REFUSAL)
    this.name = 'CancelledInvoiceError'
  }
}

export function issuedInvoiceDeleteRefusal(invoiceNumber: string | null): string {
  const which = invoiceNumber ? `Invoice ${invoiceNumber}` : 'This invoice'
  return `${which} has gone out to the customer and cannot be deleted, or its number would leave a gap in the numbering. Cancel it instead: the job is kept and marked cancelled.`
}

export function vehicleWithInvoicesRefusal(invoiceNumbers: (string | null)[]): string {
  const named = invoiceNumbers.filter((n): n is string => Boolean(n))
  const list = named.length ? `: ${named.join(', ')}` : ''
  return `This vehicle has invoices that went out to the customer${list}. Deleting it would delete them and leave gaps in the invoice numbering. Archive the vehicle instead.`
}

/**
 * What the workshop has kept of the customer's money on this invoice: what
 * came in, less what was handed back. An invoice marked paid by hand was paid
 * in full, whatever payments were recorded against it, so its receipts count
 * as at least the total; refunds (negative payments) come off after that.
 * Rounded to the cent; never below zero.
 */
export function keptOnInvoice(invoice: {
  totalAmount: number
  cost?: number
  manuallyPaid: boolean
  payments: { amount: number }[]
}): number {
  const received = invoice.payments.filter((p) => p.amount > 0).reduce((s, p) => s + p.amount, 0)
  const refunded = invoice.payments.filter((p) => p.amount < 0).reduce((s, p) => s + p.amount, 0)
  const total = invoice.totalAmount > 0 ? invoice.totalAmount : (invoice.cost ?? 0)
  const receipts = invoice.manuallyPaid ? Math.max(received, total) : received
  return Math.max(0, Math.round((receipts + refunded) * 100) / 100)
}

/** The most a refund on cancelling can hand back: what the workshop still holds. */
export function refundableAmount(invoice: {
  totalAmount: number
  cost: number
  manuallyPaid: boolean
  payments: { amount: number }[]
}): number {
  return keptOnInvoice(invoice)
}
