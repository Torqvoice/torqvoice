import { keptOnInvoice } from '@/features/invoices/Lib/cancelInvoice'

/**
 * Where an invoice stands for the customer: paid, partly paid or unpaid, and
 * what is still owed. A workshop that marks an invoice paid by hand has been
 * paid in full whatever payments are recorded.
 */

export type PortalPaymentState = 'paid' | 'partial' | 'unpaid' | 'cancelled'

export interface PortalPayment {
  state: PortalPaymentState
  /** What has been paid so far. */
  paid: number
  /** What is still owed, never below zero. */
  balance: number
}

export function portalPayment(invoice: {
  totalAmount: number
  manuallyPaid: boolean
  payments: { amount: number }[]
  /** The job's status: a cancelled invoice is owed nothing. */
  status?: string
}): PortalPayment {
  const recorded = invoice.payments.reduce((sum, p) => sum + p.amount, 0)
  if (invoice.status === 'cancelled') {
    // Nothing is owed; what was paid stays paid, less any refund.
    return { state: 'cancelled', paid: keptOnInvoice(invoice), balance: 0 }
  }
  if (invoice.manuallyPaid) {
    return { state: 'paid', paid: Math.max(recorded, invoice.totalAmount), balance: 0 }
  }
  // Half a cent of rounding is not a debt.
  const balance = Math.max(0, Math.round((invoice.totalAmount - recorded) * 100) / 100)
  if (balance <= 0) return { state: 'paid', paid: recorded, balance: 0 }
  return { state: recorded > 0 ? 'partial' : 'unpaid', paid: recorded, balance }
}
