import type { ConnectorContext, ConnectorServer } from '@/features/integrations/Lib/types'
import { PaystackProvider, paystackConfigFrom } from '@/lib/payment-providers/paystack'
import { manifest } from './manifest'

function providerOf(ctx: ConnectorContext): PaystackProvider | null {
  const config = paystackConfigFrom(ctx.credentials)
  return config ? new PaystackProvider(config) : null
}

/**
 * Reading one row of the account's own transactions is the cheapest call
 * that proves a secret key. A test key and a live key both pass: which one
 * it is shows in the key itself, and a workshop is meant to try a payment on
 * the test key first.
 */
export const connector: ConnectorServer = {
  manifest,

  async test(ctx) {
    const provider = providerOf(ctx)
    if (!provider) return { ok: false, message: 'Paystack: a secret key is required' }
    try {
      await provider.checkKey()
      return { ok: true }
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : 'Paystack did not answer' }
    }
  },

  jobs: {},
}
