import type { ConnectorContext, ConnectorServer } from '@/features/integrations/Lib/types'
import { VippsProvider, vippsConfigFrom } from '@/lib/payment-providers/vipps'
import { manifest } from './manifest'

function providerOf(ctx: ConnectorContext): VippsProvider | null {
  const config = vippsConfigFrom(ctx.credentials, ctx.connection.settings)
  return config ? new VippsProvider(config) : null
}

/**
 * Fetching an access token is the whole of Vipps's authentication, and it
 * checks every one of the four values at once: a wrong client secret and a
 * wrong subscription key both come back as a refusal.
 */
export const connector: ConnectorServer = {
  manifest,

  async test(ctx) {
    const provider = providerOf(ctx)
    if (!provider) return { ok: false, message: 'Vipps: all four credentials are required' }
    try {
      await provider.getAccessToken()
      return { ok: true }
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : 'Vipps did not answer' }
    }
  },

  async identify(ctx) {
    const msn = String(ctx.credentials.merchantSerialNumber ?? '').trim()
    return { id: msn, name: `MSN ${msn}` }
  },

  jobs: {},
}
