import { messagingConnector, requireFields, verifyByGet } from '../messaging/factory'
import { manifest } from './manifest'

export const connector = messagingConnector(manifest, async ({ credentials }) => {
  const missing = requireFields(credentials, ['apiKey'], 'Telnyx')
  if (missing) return missing
  return verifyByGet(
    'https://api.telnyx.com/v2/messaging_profiles?page[size]=1',
    { Authorization: `Bearer ${credentials.apiKey}` },
    'Telnyx'
  )
})
