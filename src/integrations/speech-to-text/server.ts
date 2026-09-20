import type { ConnectorServer } from '@/features/integrations/Lib/types'
import { isCloudInstance } from '@/lib/cloud-instance'
import { OPENAI_BASE, apiKeyOf, compatibleBaseUrlOf, openAiHeaders } from '../ai/models'
import { manifest } from './manifest'

/**
 * Proved the way the chat connectors are: list the models. It shows the key
 * reaches the account, or that the address is a server which answers, without
 * sending anybody's voice anywhere to find out.
 */
export const connector: ConnectorServer = {
  manifest,

  async test(ctx) {
    const apiKey = apiKeyOf(ctx)
    // The address is a self-hosted field; on the cloud instance it is never
    // read, whatever the stored credentials say.
    const custom = isCloudInstance() ? '' : compatibleBaseUrlOf(ctx)

    if (!custom) {
      if (!apiKey) return { ok: false, message: 'An OpenAI API key is required' }
      const res = await ctx.http.fetch(`${OPENAI_BASE}/models`, { headers: openAiHeaders(apiKey) })
      if (res.status === 401 || res.status === 403)
        return { ok: false, message: 'OpenAI rejected the key' }
      if (!res.ok) return { ok: false, message: `OpenAI answered HTTP ${res.status}` }
      return { ok: true }
    }

    let host: string
    try {
      const url = new URL(custom)
      if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('scheme')
      host = url.host
    } catch {
      return { ok: false, message: 'The server address must start with http:// or https://' }
    }
    let res: Response
    try {
      res = await ctx.http.fetch(`${custom}/models`, { headers: openAiHeaders(apiKey) })
    } catch {
      return { ok: false, message: `Could not reach ${host}. Check the server address.` }
    }
    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        message: apiKey ? 'The server rejected the API key' : 'The server wants an API key',
      }
    }
    // Some speech servers have no model list at all. They answered, which is
    // what this check is for; the first dictation will say the rest.
    if (res.status === 404) return { ok: true }
    if (!res.ok) return { ok: false, message: `${host} answered HTTP ${res.status}` }
    return { ok: true }
  },

  jobs: {},
}
