import { roundAsPrinted, roundMoney } from '@/lib/money'

/**
 * What may still be paid on a job, to the cent: its total as the invoice
 * prints it (or `cost`, for records older than itemised totals, as the header
 * and the PDF show it) less every payment recorded against it. "Mark as paid"
 * is a status, not money, so it does not count here: the actual payment can
 * still be booked after it.
 *
 * Shared by the payment form and createPayment, so the amount the form offers
 * is the amount the server takes.
 */
export function paymentBalanceDue(job: { totalAmount: number; cost: number }, paid: number) {
  const total = job.totalAmount > 0 ? job.totalAmount : job.cost
  return Math.max(0, roundMoney(roundAsPrinted(total) - roundMoney(paid)))
}
