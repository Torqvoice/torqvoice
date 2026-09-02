import { messagingConnector, requireFields, verifyByGet } from '../messaging/factory'
import { manifest } from './manifest'

export const connector = messagingConnector(manifest, async ({ credentials }) => {
  const missing = requireFields(credentials, ['apiKey'], 'Resend')
  if (missing) return missing
  return verifyByGet(
    'https://api.resend.com/domains',
    { Authorization: `Bearer ${credentials.apiKey}` },
    'Resend'
  )
})
