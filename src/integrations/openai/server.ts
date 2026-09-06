import type { ConnectorServer } from '@/features/integrations/Lib/types'
import { OPENAI_BASE, apiKeyOf, listOpenAiModels, openAiHeaders } from '../ai/models'
import { manifest } from './manifest'

/**
 * OpenAI needs nothing set up remotely: the key either reaches the account or
 * it does not. Listing models is the cheapest request that proves it, and it
 * is the same call the model dropdown makes.
 */
export const connector: ConnectorServer = {
  manifest,

  async test(ctx) {
    const apiKey = apiKeyOf(ctx)
    if (!apiKey) return { ok: false, message: 'OpenAI: an API key is required' }
    const res = await ctx.http.fetch(`${OPENAI_BASE}/models`, { headers: openAiHeaders(apiKey) })
    if (res.status === 401 || res.status === 403)
      return { ok: false, message: 'OpenAI rejected the key' }
    if (!res.ok) return { ok: false, message: `OpenAI answered HTTP ${res.status}` }
    return { ok: true }
  },

  remoteOptions: { models: listOpenAiModels },

  jobs: {},
}
