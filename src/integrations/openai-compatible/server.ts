import type { ConnectorServer } from '@/features/integrations/Lib/types'
import { apiKeyOf, compatibleBaseUrlOf, listCompatibleModels, openAiHeaders } from '../ai/models'
import { manifest } from './manifest'

/**
 * The same proof OpenAI gets, against the workshop's own server: list the
 * models. Here the URL is as likely to be wrong as the key, so the answers
 * say which. A key is optional because Ollama and vLLM usually run without
 * one; when the server does want one and none was given, it says 401 and the
 * message points at the key.
 */
export const connector: ConnectorServer = {
  manifest,

  async test(ctx) {
    const base = compatibleBaseUrlOf(ctx)
    let host: string
    try {
      const url = new URL(base)
      if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('scheme')
      host = url.host
    } catch {
      return { ok: false, message: 'The base URL must start with http:// or https://' }
    }

    let res: Response
    try {
      res = await ctx.http.fetch(`${base}/models`, { headers: openAiHeaders(apiKeyOf(ctx)) })
    } catch {
      return { ok: false, message: `Could not reach ${host}. Check the base URL.` }
    }
    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        message: apiKeyOf(ctx) ? 'The server rejected the API key' : 'The server wants an API key',
      }
    }
    if (res.status === 404) {
      return {
        ok: false,
        message: `${host} has no /models under that path. The base URL should end where the vendor's API starts, such as /v1 or /api.`,
      }
    }
    if (!res.ok) return { ok: false, message: `${host} answered HTTP ${res.status}` }
    return { ok: true }
  },

  remoteOptions: { models: listCompatibleModels },

  jobs: {},
}
