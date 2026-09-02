import { sendTestEmail } from '../messaging/email-test'
import { messagingConnector, requireFields } from '../messaging/factory'
import { manifest } from './manifest'

/**
 * Mailgun authenticates as the user `api`, and its domain endpoint answers
 * only for the region the domain lives in, so the region setting is part of
 * what is being checked here.
 */
export const connector = messagingConnector(
  manifest,
  async ({ credentials, settings }) => {
    const missing = requireFields(credentials, ['apiKey', 'domain'], 'Mailgun')
    if (missing) return missing
    const host = settings.region === 'eu' ? 'api.eu.mailgun.net' : 'api.mailgun.net'
    const auth = Buffer.from(`api:${credentials.apiKey}`).toString('base64')
    try {
      const res = await fetch(
        `https://${host}/v3/domains/${encodeURIComponent(credentials.domain)}`,
        {
          headers: { Authorization: `Basic ${auth}` },
        }
      )
      if (res.ok) return { ok: true }
      if (res.status === 404) {
        return {
          ok: false,
          message: `Mailgun does not have ${credentials.domain} in this region.`,
        }
      }
      return { ok: false, message: `Mailgun rejected the key (${res.status}).` }
    } catch (err) {
      return { ok: false, message: `Could not reach Mailgun: ${(err as Error).message}` }
    }
  },
  {
    /** The sending domain is what a Mailgun key is scoped to. */
    identify: async ({ credentials }) => ({ id: credentials.domain, name: credentials.domain }),
    sendTest: sendTestEmail,
  }
)
