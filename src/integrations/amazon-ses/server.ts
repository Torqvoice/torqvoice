import { sendTestEmail } from '../messaging/email-test'
import { messagingConnector, requireFields } from '../messaging/factory'
import { manifest } from './manifest'

/**
 * Checking SES keys means a SigV4-signed request, which is more machinery
 * than a settings save should carry. The fields are checked here and the keys
 * are proven by the test email on the connection page.
 */
export const connector = messagingConnector(
  manifest,
  async ({ credentials }) => {
    const missing = requireFields(
      credentials,
      ['accessKeyId', 'secretAccessKey', 'region'],
      'Amazon SES'
    )
    return missing ?? { ok: true }
  },
  {
    identify: async ({ credentials }) => ({
      id: credentials.accessKeyId,
      name: `${credentials.accessKeyId} (${credentials.region})`,
    }),
    sendTest: sendTestEmail,
  }
)
