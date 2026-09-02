import { messagingConnector, requireFields, verifyByGet } from '../messaging/factory'
import { manifest } from './manifest'

const DEFAULT_GRAPH_VERSION = 'v21.0'

export const connector = messagingConnector(
  manifest,
  async ({ credentials }) => {
    const missing = requireFields(
      credentials,
      ['phoneNumberId', 'accessToken', 'verifyToken'],
      'WhatsApp'
    )
    if (missing) return missing
    const version = credentials.apiVersion?.trim() || DEFAULT_GRAPH_VERSION
    return verifyByGet(
      `https://graph.facebook.com/${version}/${encodeURIComponent(credentials.phoneNumberId)}`,
      { Authorization: `Bearer ${credentials.accessToken}` },
      'Meta'
    )
  },
  async ({ credentials }) => ({ id: credentials.phoneNumberId, name: credentials.phoneNumberId })
)
