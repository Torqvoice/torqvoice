import { messagingConnector, requireFields, verifyByGet } from '../messaging/factory'
import { manifest } from './manifest'

export const connector = messagingConnector(manifest, async ({ credentials }) => {
  const missing = requireFields(credentials, ['apiKey'], 'SendGrid')
  if (missing) return missing
  return verifyByGet(
    'https://api.sendgrid.com/v3/scopes',
    { Authorization: `Bearer ${credentials.apiKey}` },
    'SendGrid'
  )
})
