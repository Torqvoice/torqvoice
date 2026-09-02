import { messagingConnector, requireFields, verifyByGet } from '../messaging/factory'
import { manifest } from './manifest'

export const connector = messagingConnector(manifest, async ({ credentials }) => {
  const missing = requireFields(credentials, ['apiKey'], 'Postmark')
  if (missing) return missing
  return verifyByGet(
    'https://api.postmarkapp.com/server',
    { 'X-Postmark-Server-Token': credentials.apiKey, Accept: 'application/json' },
    'Postmark'
  )
})
