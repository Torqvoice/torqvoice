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
 * What the customer has paid on the invoice, which is the most a refund on
 * cancelling can hand back. An invoice marked paid by hand was paid in full,
 * whatever payments were recorded against it. Rounded to the cent.
 */
export function refundableAmount(invoice: {
  totalAmount: number
  cost: number
  manuallyPaid: boolean
  payments: { amount: number }[]
}): number {
  const recorded = invoice.payments.reduce((sum, p) => sum + p.amount, 0)
  const total = invoice.totalAmount > 0 ? invoice.totalAmount : invoice.cost
  const paid = invoice.manuallyPaid ? Math.max(recorded, total) : recorded
  return Math.max(0, Math.round(paid * 100) / 100)
}
