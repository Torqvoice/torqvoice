import Stripe from 'stripe'

/**
 * Where the payment vendors' APIs are, for this server.
 *
 * Always the vendors' own hosts in production. `STRIPE_API_BASE_URL` and
 * `PAYPAL_API_BASE_URL` point a server at a stand-in instead: the end-to-end
 * suite's fake vendor (`e2e/payment-sink.ts`), or stripe-mock on a
 * developer's machine. They are read from the environment only. A workshop
 * cannot set them, so no tenant can send its keys, or anyone else's,
 * somewhere other than the vendor.
 */

/** Stripe's client, aimed at the stand-in when one is configured. */
export function stripeClient(secretKey: string): Stripe {
  const base = process.env.STRIPE_API_BASE_URL?.trim()
  if (!base) return new Stripe(secretKey)
  const url = new URL(base)
  return new Stripe(secretKey, {
    host: url.hostname,
    port: url.port ? Number(url.port) : undefined,
    protocol: url.protocol === 'http:' ? 'http' : 'https',
  })
}

/** PayPal's REST base, sandbox or live, unless a stand-in is configured. */
export function paypalApiBase(useSandbox: boolean): string {
  const base = process.env.PAYPAL_API_BASE_URL?.trim()
  if (base) return base.replace(/\/+$/, '')
  return useSandbox ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com'
}
