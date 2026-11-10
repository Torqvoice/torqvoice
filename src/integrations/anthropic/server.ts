import type { ConnectorServer } from '@/features/integrations/Lib/types'
import { probeAiModel } from '@/lib/ai'
import {
  ANTHROPIC_BASE,
  anthropicHeaders,
  apiKeyOf,
  chosenModelOf,
  listAnthropicModels,
} from '../ai/models'
import { manifest } from './manifest'

/**
 * Anthropic authenticates with x-api-key rather than a bearer token, and
 * wants its API version on every request. Listing models proves the key
 * without spending tokens.
 *
 * As with OpenAI, a key that lists models can still be refused every
 * completion, for want of credit or of access to the chosen model. Once a
 * model is chosen the test asks it for a few tokens, the way a real request
 * would. It only runs when someone connects or presses Test, never on a timer.
 */
export const connector: ConnectorServer = {
  manifest,

  async test(ctx) {
    const apiKey = apiKeyOf(ctx)
    if (!apiKey) return { ok: false, message: 'Anthropic: an API key is required' }
    const model = chosenModelOf(ctx)
    if (model) return probeAiModel({ provider: 'anthropic', apiKey, model })
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
