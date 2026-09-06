import { messagingConnector, requireFields } from '../messaging/factory'
import { manifest } from './manifest'

/**
 * Vonage wants the key and secret as query parameters on its account
 * endpoints, so a live check would put the secret in a URL. The keys are
 * proven by the first message instead, and a failure there surfaces on the
 * connection with Vonage's own wording.
 */
export const connector = messagingConnector(manifest, async ({ credentials }) => {
  const missing = requireFields(credentials, ['apiKey', 'apiSecret'], 'Vonage')
  return missing ?? { ok: true }
})
