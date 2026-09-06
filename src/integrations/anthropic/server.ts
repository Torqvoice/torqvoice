import type { ConnectorServer } from '@/features/integrations/Lib/types'
import { ANTHROPIC_BASE, anthropicHeaders, apiKeyOf, listAnthropicModels } from '../ai/models'
import { manifest } from './manifest'

/**
 * Anthropic authenticates with x-api-key rather than a bearer token, and
 * wants its API version on every request. Listing models proves the key
 * without spending tokens.
 */
export const connector: ConnectorServer = {
  manifest,

  async test(ctx) {
    const apiKey = apiKeyOf(ctx)
    if (!apiKey) return { ok: false, message: 'Anthropic: an API key is required' }
    const res = await ctx.http.fetch(`${ANTHROPIC_BASE}/models?limit=1`, {
      headers: anthropicHeaders(apiKey),
    })
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: 'Anthropic rejected the key' }
    }
    if (!res.ok) return { ok: false, message: `Anthropic answered HTTP ${res.status}` }
    return { ok: true }
  },

  remoteOptions: { models: listAnthropicModels },

  jobs: {},
}
