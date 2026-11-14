/**
 * The platform's own SMS account, for workshops that have not connected one.
 *
 * Mail has always worked this way: a workshop with no provider sends from the
 * platform's address. Texting needed a Twilio, Vonage or Telnyx account before
 * the first message could go out, which is a lot to ask of a workshop that
 * only wants to tell a customer the car is ready. A paid plan now sends
 * through the platform's Twilio account until the workshop connects its own,
 * up to a number of texts a day that the plan sets.
 *
 * The account is entered in the torqvoice.com admin, which writes the three
 * rows below into `system_settings`; this app only reads them. They are kept
 * out of SYSTEM_SETTING_KEYS on purpose, so the app's own admin page neither
 * shows nor overwrites the token.
 *
 * Replies do not come back: the number is shared by every workshop using it,
 * so an answer cannot be tied to one of them. Two-way texting is what
 * connecting a provider is for.
 */

import { ORG_SMS_KEYS } from '@/features/sms/Schema/smsSettingsSchema'
import { db } from './db'
import { FeatureGatedError, isCloudMode } from './features'
import { smsSegmentCount } from './sms-segments'

/** Keep in step with the torqvoice.com admin, which writes these rows. */
export const PLATFORM_SMS_KEYS = {
  TWILIO_ACCOUNT_SID: 'platformSms.twilio.accountSid',
  TWILIO_AUTH_TOKEN: 'platformSms.twilio.authToken',
  PHONE_NUMBER: 'platformSms.phoneNumber',
} as const

/**
 * The platform account under the keys the send path already reads, or null
 * when there is none. Cloud only: a self-hosted install has no platform
 * paying for its texts, so rows that arrived in a restored backup are ignored.
 */
export async function platformSmsAccount(): Promise<Map<string, string> | null> {
  if (!isCloudMode()) return null

  const rows = await db.systemSetting.findMany({
    where: { key: { in: Object.values(PLATFORM_SMS_KEYS) } },
    select: { key: true, value: true },
  })
  const stored = new Map(rows.map((row) => [row.key, row.value.trim()]))

  const accountSid = stored.get(PLATFORM_SMS_KEYS.TWILIO_ACCOUNT_SID)
  const authToken = stored.get(PLATFORM_SMS_KEYS.TWILIO_AUTH_TOKEN)
  const phoneNumber = stored.get(PLATFORM_SMS_KEYS.PHONE_NUMBER)
  // All three or nothing. Half an account cannot send, and offering SMS on
  // the strength of it would only queue messages that fail.
  if (!accountSid || !authToken || !phoneNumber) return null

  return new Map([
    [ORG_SMS_KEYS.SMS_PROVIDER, 'twilio'],
    [ORG_SMS_KEYS.SMS_PHONE_NUMBER, phoneNumber],
    [ORG_SMS_KEYS.SMS_TWILIO_ACCOUNT_SID, accountSid],
    [ORG_SMS_KEYS.SMS_TWILIO_AUTH_TOKEN, authToken],
  ])
}

function today(now: Date): string {
  return now.toISOString().slice(0, 10)
}

/**
 * Takes a text's share of today's allowance. Atomic, the same way the mail
 * allowance is: the increment only happens while the whole text still fits
 * under the limit, so two sends racing for the last of it cannot both get it.
 */
async function takeSlots(
  organizationId: string,
  day: string,
  limit: number,
  segments: number
): Promise<boolean> {
  await db.platformSmsUsage.createMany({
    data: [{ organizationId, day, count: 0 }],
    skipDuplicates: true,
  })
  const taken = await db.platformSmsUsage.updateMany({
    where: { organizationId, day, count: { lte: limit - segments } },
    data: { count: { increment: segments } },
  })
  return taken.count === 1
}

async function giveBack(organizationId: string, day: string, segments: number) {
  await db.platformSmsUsage.updateMany({
    where: { organizationId, day, count: { gte: segments } },
    data: { count: { decrement: segments } },
  })
}

/**
 * Runs one send through the platform account under the plan's daily
 * allowance. The allowance is counted in segments, the unit the provider
 * bills in: a long text is sent as several SMS and uses as many of the day's.
 * A send that throws gives them back, so a wrong number or a provider outage
 * does not use up the day.
 */
export async function withPlatformSmsAllowance<T>(
  organizationId: string,
  limit: number,
  body: string,
  send: () => Promise<T>,
  now = new Date()
): Promise<T> {
  const day = today(now)
  const segments = Math.max(1, smsSegmentCount(body))
  if (!(await takeSlots(organizationId, day, limit, segments))) {
    throw new FeatureGatedError(
      'platformSmsDaily',
      `Daily limit of ${limit} text messages reached. Connect your own SMS provider to send more.`,
      limit
    )
  }
  try {
    return await send()
  } catch (error) {
    await giveBack(organizationId, day, segments)
    throw error
  }
}
