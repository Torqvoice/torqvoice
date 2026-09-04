import type { ConnectorContext, ConnectorServer } from '@/features/integrations/Lib/types'
import { PayPalProvider, paypalConfigFrom } from '@/lib/payment-providers/paypal'
import { manifest } from './manifest'

function providerOf(ctx: ConnectorContext): PayPalProvider | null {
  const config = paypalConfigFrom(ctx.credentials, ctx.connection.settings)
  return config ? new PayPalProvider(config) : null
}

/**
 * A client-credentials token is the cheapest thing PayPal will issue, and it
 * proves the id and secret against the environment the sandbox switch
 * points at: live keys fail on the sandbox and the other way round, which is
 * exactly the mistake worth catching before a customer does.
 */
export const connector: ConnectorServer = {
  manifest,

  async test(ctx) {
    const provider = providerOf(ctx)
    if (!provider) return { ok: false, message: 'PayPal: a client id and secret are required' }
    try {
      await provider.getAccessToken()
      return { ok: true }
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : 'PayPal did not answer' }
    }
  },

  jobs: {},
}
