import { afterEach, describe, expect, it } from 'vitest'
import { paypalApiBase, stripeClient } from '@/lib/payment-providers/vendor-hosts'

/**
 * Where a server sends a workshop's payment keys.
 *
 * The override exists so the end-to-end suite can put a stand-in vendor in
 * front of the app. The risk it carries is the one worth pinning: a
 * production server with nothing set must talk to Stripe and PayPal
 * themselves, and nothing but the environment may change that.
 */

const ORIGINAL = {
  stripe: process.env.STRIPE_API_BASE_URL,
  paypal: process.env.PAYPAL_API_BASE_URL,
}

afterEach(() => {
  if (ORIGINAL.stripe === undefined) delete process.env.STRIPE_API_BASE_URL
  else process.env.STRIPE_API_BASE_URL = ORIGINAL.stripe
  if (ORIGINAL.paypal === undefined) delete process.env.PAYPAL_API_BASE_URL
  else process.env.PAYPAL_API_BASE_URL = ORIGINAL.paypal
})

/** The host and port a Stripe client was configured with. */
function stripeTarget(client: ReturnType<typeof stripeClient>) {
  const settings = (
    client as unknown as { _api: { host: string; port: string | number; protocol: string } }
  )._api
  return { host: settings.host, port: String(settings.port), protocol: settings.protocol }
}

describe('with nothing set, as in production', () => {
  it('talks to Stripe itself', () => {
    delete process.env.STRIPE_API_BASE_URL
    expect(stripeTarget(stripeClient('sk_test_x'))).toMatchObject({
      host: 'api.stripe.com',
      protocol: 'https',
    })
  })

  it('talks to PayPal itself, live or sandbox as the workshop chose', () => {
    delete process.env.PAYPAL_API_BASE_URL
    expect(paypalApiBase(false)).toBe('https://api-m.paypal.com')
    expect(paypalApiBase(true)).toBe('https://api-m.sandbox.paypal.com')
  })

  it('treats a blank variable as nothing set', () => {
    process.env.STRIPE_API_BASE_URL = '   '
    process.env.PAYPAL_API_BASE_URL = ''
    expect(stripeTarget(stripeClient('sk_test_x')).host).toBe('api.stripe.com')
    expect(paypalApiBase(false)).toBe('https://api-m.paypal.com')
  })
})

describe('with a stand-in configured', () => {
  it('sends Stripe calls to it, over plain http when that is what it says', () => {
    process.env.STRIPE_API_BASE_URL = 'http://127.0.0.1:8026'
    expect(stripeTarget(stripeClient('sk_test_x'))).toEqual({
      host: '127.0.0.1',
      port: '8026',
      protocol: 'http',
    })
  })

  it('sends PayPal calls to it whichever mode the workshop picked', () => {
    process.env.PAYPAL_API_BASE_URL = 'http://127.0.0.1:8026/'
    expect(paypalApiBase(false)).toBe('http://127.0.0.1:8026')
    expect(paypalApiBase(true)).toBe('http://127.0.0.1:8026')
  })
})
