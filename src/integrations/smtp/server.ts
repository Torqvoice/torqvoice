import { sendTestEmail } from '../messaging/email-test'
import { messagingConnector, requireFields } from '../messaging/factory'
import { manifest } from './manifest'

/**
 * A live check would mean opening an SMTP session on every save, which is
 * slow and blocked outbound on plenty of hosts. The connection page's "send a
 * test email" is the real proof. The from address is not checked here: it is
 * a setting, saved after the keys, and the settings form requires it.
 */
export const connector = messagingConnector(
  manifest,
  async ({ credentials }) => {
    const missing = requireFields(credentials, ['host', 'port'], 'SMTP')
    if (missing) return missing
    if (!Number.isFinite(Number(credentials.port))) {
      return { ok: false, message: 'The SMTP port must be a number.' }
    }
    return { ok: true }
  },
  {
    identify: async ({ credentials }) => {
      // The username is often an email address already, so it is shown next
      // to the server rather than joined to it.
      const name = credentials.user ? `${credentials.user} (${credentials.host})` : credentials.host
      return { id: `${credentials.host}:${credentials.port}`, name }
    },
    sendTest: sendTestEmail,
  }
)
