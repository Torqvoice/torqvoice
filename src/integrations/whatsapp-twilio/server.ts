import { messagingConnector, requireFields, verifyByGet } from '../messaging/factory'
import { manifest } from './manifest'

export const connector = messagingConnector(
  manifest,
  async ({ credentials }) => {
    const missing = requireFields(credentials, ['accountSid', 'authToken'], 'Twilio')
    if (missing) return missing
    const auth = Buffer.from(`${credentials.accountSid}:${credentials.authToken}`).toString(
      'base64'
    )
    return verifyByGet(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(credentials.accountSid)}.json`,
      { Authorization: `Basic ${auth}` },
      'Twilio'
    )
  },
  {
    identify: async ({ credentials }) => ({
      id: credentials.accountSid,
      name: credentials.accountSid,
    }),
  }
)
