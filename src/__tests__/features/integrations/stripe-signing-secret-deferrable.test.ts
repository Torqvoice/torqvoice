import { describe, expect, it } from 'vitest'
import { PAYMENT_VENDORS } from '@/integrations/payments/catalog'

/**
 * Stripe shows the webhook signing secret only after the inbound URL from
 * the connected page has been added as an endpoint, so it has to be a key
 * the workshop can save onto a live connection, never one Connect waits for.
 */
describe('Stripe signing secret', () => {
  const stripe = PAYMENT_VENDORS.find((v) => v.id === 'stripe')
  const secret = stripe?.credentials.find((c) => c.key === 'webhookSecret')

  it('is optional at connect and saved afterwards', () => {
    expect(secret?.required).toBeFalsy()
    expect(secret?.deferrable).toBe(true)
  })

  it('is the only late key, so the secret key still gates Connect', () => {
    expect(stripe?.credentials.filter((c) => c.deferrable).map((c) => c.key)).toEqual([
      'webhookSecret',
    ])
    expect(stripe?.credentials.find((c) => c.key === 'secretKey')?.required).toBe(true)
  })
})
