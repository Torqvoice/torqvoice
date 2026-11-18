import { messagingConnector, requireFields, verifyByGet } from '../messaging/factory'
import { manifest } from './manifest'

const DEFAULT_GRAPH_VERSION = 'v21.0'

/**
 * Meta's setup runs the other way round from every other vendor: the
 * callback URL has to be verified before Meta issues a phone number ID, and
 * the callback only answers once the connection is live. So a connection
 * with just the verify token (and the app secret the webhook needs) is a
 * valid one: it can take the handshake and receive, and it says so until
 * the number and token arrive. Once both are entered the keys are checked
 * against the Graph API like any other vendor's.
 */
export const connector = messagingConnector(
  manifest,
  async ({ credentials }) => {
    const missing = requireFields(credentials, ['verifyToken'], 'WhatsApp')
    if (missing) return missing
    const phoneNumberId = credentials.phoneNumberId?.trim()
    const accessToken = credentials.accessToken?.trim()
    if (!phoneNumberId && !accessToken) {
      return {
        ok: true,
        message:
          'Webhook ready. Enter the phone number ID and access token once Meta has issued them; nothing can be sent until then.',
      }
    }
    // One without the other sends nothing and verifies nothing: say which.
    const half = requireFields(credentials, ['phoneNumberId', 'accessToken'], 'WhatsApp')
    if (half) return half
    const version = credentials.apiVersion?.trim() || DEFAULT_GRAPH_VERSION
    return verifyByGet(
      `https://graph.facebook.com/${version}/${encodeURIComponent(phoneNumberId as string)}`,
      { Authorization: `Bearer ${accessToken}` },
      'Meta'
    )
  },
  {
    identify: async ({ credentials }) => {
      // No number yet: the page shows a dash rather than a made-up name.
      const id = credentials.phoneNumberId?.trim() ?? ''
      return { id, name: id }
    },
  }
)
