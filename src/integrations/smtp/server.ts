import { messagingConnector, requireFields } from '../messaging/factory'
import { manifest } from './manifest'

/**
 * A live check would mean opening an SMTP session on every save, which is
 * slow and blocked outbound on plenty of hosts. The settings page keeps its
 * own "send a test email" button for the real proof.
 */
export const connector = messagingConnector(manifest, async ({ credentials, settings }) => {
  const missing = requireFields(credentials, ['host', 'port'], 'SMTP')
  if (missing) return missing
  if (!Number.isFinite(Number(credentials.port))) {
    return { ok: false, message: 'The SMTP port must be a number.' }
  }
  if (!String(settings.fromEmail ?? '').includes('@')) {
    return { ok: false, message: 'Set the address mail is sent from.' }
  }
  return { ok: true }
})
