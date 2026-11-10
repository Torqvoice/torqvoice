import type { ConnectorServer } from '@/features/integrations/Lib/types'
import { probeAiModel } from '@/lib/ai'
import { OPENAI_BASE, apiKeyOf, chosenModelOf, listOpenAiModels, openAiHeaders } from '../ai/models'
import { manifest } from './manifest'

/**
 * OpenAI needs nothing set up remotely: the key either reaches the account or
 * it does not. Listing models is the cheapest request that proves it, and it
 * is the same call the model dropdown makes.
 *
 * It does not prove the account can pay or that the key may use the model the
 * workshop went on to pick: a key on an account without credit lists models
 * and then fails every request. So once a model is chosen the test asks that
 * model for a few tokens instead. It only runs when someone connects or
 * presses Test, never on a timer.
 */
export const connector: ConnectorServer = {
  manifest,

  async test(ctx) {
    const apiKey = apiKeyOf(ctx)
    if (!apiKey) return { ok: false, message: 'OpenAI: an API key is required' }
    const model = chosenModelOf(ctx)
    if (model) {
      const probe = await probeAiModel({ provider: 'openai', apiKey, model })
      // A provider that was busy or down says nothing about the key, and a
      // failed test turns the connection off: fall through to the key check.
      if (!probe.inconclusive) return { ok: probe.ok, message: probe.message }
    }
    const res = await ctx.http.fetch(`${OPENAI_BASE}/models`, { headers: openAiHeaders(apiKey) })
    if (res.status === 401 || res.status === 403)
      return { ok: false, message: 'OpenAI rejected the key' }
    if (!res.ok) return { ok: false, message: `OpenAI answered HTTP ${res.status}` }
    return { ok: true }
  },

  remoteOptions: { models: listOpenAiModels },

  jobs: {},
}
