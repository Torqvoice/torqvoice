/**
 * How each payment vendor wants an amount written.
 *
 * The app keeps every amount as a decimal number of the currency's main unit
 * (12.50 means twelve and a half). The vendors do not: Stripe takes an integer
 * in the currency's smallest unit, and what that unit is depends on the
 * currency. Scaling every currency by 100 charges a yen invoice a hundred
 * times over, so the scaling lives here and nowhere else.
 */

/**
 * Stripe's zero-decimal currencies: the amount is sent as it is, 500 for
 * 500 JPY. From https://docs.stripe.com/currencies#zero-decimal.
 *
 * UGX is on Stripe's list but is left out here, because the same page's
 * special cases say it is still written as a two-decimal value.
 */
const STRIPE_ZERO_DECIMAL = new Set([
  'BIF',
  'CLP',
  'DJF',
  'GNF',
  'JPY',
  'KMF',
  'KRW',
  'MGA',
  'PYG',
  'RWF',
  'VND',
  'VUV',
  'XAF',
  'XOF',
  'XPF',
])

/**
 * Stripe's special cases: currencies with no fractions that are still written
 * as two-decimal values whose decimals are always 00, so 5 ISK is sent as 500.
 */
const STRIPE_WHOLE_UNITS_IN_HUNDREDTHS = new Set(['ISK', 'UGX'])

/**
 * Stripe's three-decimal currencies: 5.124 KWD is sent as 5124, and the last
 * digit must be 0. The app's amounts carry two decimals, so it always is.
 */
const STRIPE_THREE_DECIMAL = new Set(['BHD', 'JOD', 'KWD', 'OMR', 'TND'])

function stripeScale(currency: string): number {
  const code = currency.toUpperCase()
  if (STRIPE_ZERO_DECIMAL.has(code)) return 1
  if (STRIPE_THREE_DECIMAL.has(code)) return 1000
  return 100
}

/** An amount in the app's terms, as the integer Stripe charges. */
export function toStripeAmount(amount: number, currency: string): number {
  const code = currency.toUpperCase()
  if (STRIPE_WHOLE_UNITS_IN_HUNDREDTHS.has(code)) return Math.round(amount) * 100
  if (STRIPE_THREE_DECIMAL.has(code)) return Math.round(amount * 100) * 10
  return Math.round(amount * stripeScale(code))
}

/**
 * The integer Stripe reports, back in the app's terms. A session that carries
 * no currency is read the way two-decimal currencies are.
 */
export function fromStripeAmount(amount: number, currency: string | null | undefined): number {
  return amount / stripeScale(currency ?? '')
}

/**
 * PayPal's currencies without decimals: "If you pass a decimal amount, an
 * error occurs". From
 * https://developer.paypal.com/api/rest/reference/currency-codes/.
 */
const PAYPAL_NO_DECIMALS = new Set(['HUF', 'JPY', 'TWD'])

/** An amount as the string PayPal's order API takes for that currency. */
export function toPayPalValue(amount: number, currency: string): string {
  return PAYPAL_NO_DECIMALS.has(currency.toUpperCase())
    ? String(Math.round(amount))
    : amount.toFixed(2)
}
