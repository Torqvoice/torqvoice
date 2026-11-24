/**
 * How a payment's method reads to a person.
 *
 * A payment stores its method as a code: one of the four the payments form
 * offers, or the vendor that took it online. The code is not a word anybody
 * should read; a Norwegian invoice saying "(card)" is a bug. The four are
 * translated by whoever draws them (the app in the viewer's language, a
 * printed or shared document in the document's), and a vendor is its own
 * name in every language. Anything else, from an old backup or an import,
 * prints as it was stored rather than not at all.
 */

/** The methods the payments form offers, in the order it offers them. */
export const PAYMENT_METHODS = ['cash', 'card', 'transfer', 'other'] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

/** The vendors a payment can come in through online, as they write their own names. */
const VENDOR_NAMES: Record<string, string> = {
  stripe: 'Stripe',
  paypal: 'PayPal',
  vipps: 'Vipps',
  paystack: 'Paystack',
}

export function isPaymentMethod(method: string): method is PaymentMethod {
  return (PAYMENT_METHODS as readonly string[]).includes(method)
}

export function paymentMethodLabel(
  method: string,
  translate: (method: PaymentMethod) => string
): string {
  if (isPaymentMethod(method)) return translate(method)
  return VENDOR_NAMES[method] ?? method
}

/**
 * A payment of less than nothing is money handed back: a refund booked in the
 * ledger and synced in, or a correction. It is listed as a refund, never as a
 * payment with a minus in front.
 */
export function isRefund(amount: number): boolean {
  return amount < 0
}
