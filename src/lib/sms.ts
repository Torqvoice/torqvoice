import { db } from './db'
import { channelSettings } from '@/features/integrations/Lib/messaging'
import { ORG_SMS_KEYS } from '@/features/sms/Schema/smsSettingsSchema'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { getFeatures } from './features'
import {
  platformSmsAccount,
  TWILIO_MESSAGING_SERVICE_KEY,
  withPlatformSmsAllowance,
} from './platform-sms'
import { normalizePortalPhone } from './portal-phone'

export type SmsProvider = 'twilio' | 'vonage' | 'telnyx'

export interface SendSmsOptions {
  to: string
  body: string
}

type SettingsMap = Map<string, string>

/**
 * What a workshop's texts go out through.
 *
 * Its own provider when it has connected one. A setup made before SMS moved
 * into the catalog is adopted on the way past, so this keeps answering for
 * workshops that never touched the new screen. Otherwise the platform's
 * account, when there is one and the plan includes texts from it, with the
 * number of texts a day the plan allows. Null when neither applies, which is
 * how every screen learns that SMS is not available here.
 */
type SmsRoute =
  | { source: 'own'; settings: SettingsMap }
  | { source: 'platform'; settings: SettingsMap; dailyLimit: number }

async function smsRoute(organizationId: string): Promise<SmsRoute | null> {
  const own = await channelSettings(organizationId, 'sms')
  if (own.get(ORG_SMS_KEYS.SMS_PROVIDER)) return { source: 'own', settings: own }

  const platform = await platformSmsAccount()
  if (!platform) return null

  const { platformSmsPerDay } = await getFeatures(organizationId)
  if (!(platformSmsPerDay > 0)) return null
  return { source: 'platform', settings: platform, dailyLimit: platformSmsPerDay }
}

function providerOf(settings: SettingsMap): SmsProvider | null {
  const value = settings.get(ORG_SMS_KEYS.SMS_PROVIDER)
  return value === 'twilio' || value === 'vonage' || value === 'telnyx' ? value : null
}

export async function getOrgSmsProvider(organizationId: string): Promise<SmsProvider | null> {
  const route = await smsRoute(organizationId)
  return route ? providerOf(route.settings) : null
}

export async function getOrgSmsPhoneNumber(organizationId: string): Promise<string | null> {
  const route = await smsRoute(organizationId)
  return route?.settings.get(ORG_SMS_KEYS.SMS_PHONE_NUMBER) || null
}

/**
 * Whether this workshop texts from the platform's shared number, and how many
 * a day. The screens use it to say that replies will not arrive.
 */
export async function getPlatformSmsAllowance(organizationId: string): Promise<number | null> {
  const route = await smsRoute(organizationId)
  return route?.source === 'platform' ? route.dailyLimit : null
}

// ─── Refusals worth explaining ──────────────────────────────────────────────

/**
 * Twilio's code for a destination country the account is not allowed to text
 * (its geo permissions). The account owner decides which countries are on, so
 * the text never went out and nothing was charged.
 */
const TWILIO_REGION_NOT_ALLOWED = 21408

/**
 * The provider refused the text because of the country it was going to.
 * `platform` says whose account refused: the platform's shared one, where the
 * workshop can only connect its own provider, or the workshop's own, where it
 * can turn the country on itself. Callers that talk to a person turn this into
 * a translated sentence; the message is the plain English one for logs and
 * stored records.
 */
export class SmsCountryRefusedError extends Error {
  platform = false

  constructor() {
    super('Texts to this country are not allowed by the SMS account.')
    this.name = 'SmsCountryRefusedError'
  }
}

// ─── Twilio ──────────────────────────────────────────────────────────────────

interface TwilioResult {
  sid: string
  status: string
}

async function sendViaTwilio(
  settings: SettingsMap,
  from: string,
  to: string,
  body: string
): Promise<TwilioResult> {
  const accountSid = settings.get(ORG_SMS_KEYS.SMS_TWILIO_ACCOUNT_SID)
  const authToken = settings.get(ORG_SMS_KEYS.SMS_TWILIO_AUTH_TOKEN)

  if (!accountSid || !authToken) {
    throw new Error('Twilio is not configured. Add your Account SID and Auth Token.')
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`
  const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64')

  // The platform account sends through a Messaging Service, which chooses the
  // sender per country; everyone else sends from their own number.
  const messagingServiceSid = settings.get(TWILIO_MESSAGING_SERVICE_KEY)
  const params = new URLSearchParams(
    messagingServiceSid
      ? { MessagingServiceSid: messagingServiceSid, To: to, Body: body }
      : { From: from, To: to, Body: body }
  )

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  })

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { message?: string; code?: number }
    if (err.code === TWILIO_REGION_NOT_ALLOWED) throw new SmsCountryRefusedError()
    throw new Error(`Twilio error: ${err.message || res.statusText}`)
  }

  const data = (await res.json()) as TwilioResult
  return { sid: data.sid, status: data.status }
}

// ─── Vonage ──────────────────────────────────────────────────────────────────

interface VonageResult {
  messageId: string
  status: string
}

async function sendViaVonage(
  settings: SettingsMap,
  from: string,
  to: string,
  body: string
): Promise<VonageResult> {
  const apiKey = settings.get(ORG_SMS_KEYS.SMS_VONAGE_API_KEY)
  const apiSecret = settings.get(ORG_SMS_KEYS.SMS_VONAGE_API_SECRET)

  if (!apiKey || !apiSecret) {
    throw new Error('Vonage is not configured. Add your API Key and Secret.')
  }

  // Vonage REST API expects digits only (no '+' prefix)
  const vonageTo = to.replace(/^\+/, '')
  const vonageFrom = from.replace(/^\+/, '')

  const res = await fetch('https://rest.nexmo.com/sms/json', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      api_secret: apiSecret,
      from: vonageFrom,
      to: vonageTo,
      text: body,
    }),
  })

  if (!res.ok) {
    throw new Error(`Vonage error: ${res.statusText}`)
  }

  const data = (await res.json()) as {
    messages: { 'message-id': string; status: string; 'error-text'?: string }[]
  }
  const msg = data.messages?.[0]

  if (msg?.status !== '0') {
    throw new Error(`Vonage error: ${msg?.['error-text'] || 'Unknown error'}`)
  }

  return { messageId: msg['message-id'], status: msg.status }
}

// ─── Telnyx ──────────────────────────────────────────────────────────────────

interface TelnyxResult {
  id: string
}

async function sendViaTelnyx(
  settings: SettingsMap,
  from: string,
  to: string,
  body: string
): Promise<TelnyxResult> {
  const apiKey = settings.get(ORG_SMS_KEYS.SMS_TELNYX_API_KEY)

  if (!apiKey) {
    throw new Error('Telnyx is not configured. Add your API Key.')
  }

  const res = await fetch('https://api.telnyx.com/v2/messages', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to, text: body }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const errors = (err as { errors?: { detail?: string }[] }).errors
    throw new Error(`Telnyx error: ${errors?.[0]?.detail || res.statusText}`)
  }

  const data = (await res.json()) as { data: { id: string } }
  return { id: data.data.id }
}

// ─── Validation ─────────────────────────────────────────────────────────────

const E164_REGEX = /^\+[1-9]\d{6,14}$/

export function isValidE164(phone: string): boolean {
  return E164_REGEX.test(phone)
}

// ─── Phone normalization ────────────────────────────────────────────────────

/**
 * Resolve a customer phone (which may be local digits, may have a trunk
 * prefix, may use 00 instead of +) into E.164 using the workshop's
 * configured default country code as a fallback. Returns null when the
 * input cannot be turned into a valid E.164 number.
 *
 * Use this when the caller needs the canonical number BEFORE calling
 * sendOrgSms — for example to record what was actually sent in an audit
 * log. Callers that don't care can rely on sendOrgSms doing the same
 * normalization internally (idempotent).
 */
export async function normalizeOrgPhone(
  organizationId: string,
  phone: string
): Promise<string | null> {
  const setting = await db.appSetting.findUnique({
    where: {
      organizationId_key: {
        organizationId,
        key: SETTING_KEYS.WORKSHOP_DEFAULT_COUNTRY_CODE,
      },
    },
    select: { value: true },
  })
  return normalizePortalPhone(phone, setting?.value ?? null)
}

// ─── Main dispatch ───────────────────────────────────────────────────────────

export interface SendSmsResult {
  providerMsgId: string
  /** The normalized E.164 number the provider was actually called with. */
  to: string
}

export async function sendOrgSms(
  organizationId: string,
  options: SendSmsOptions
): Promise<SendSmsResult> {
  // One read of the route covers the vendor, its keys and the number, and
  // the country code is a workshop setting rather than the vendor's.
  const [route, countryRow] = await Promise.all([
    smsRoute(organizationId),
    db.appSetting.findUnique({
      where: {
        organizationId_key: {
          organizationId,
          key: SETTING_KEYS.WORKSHOP_DEFAULT_COUNTRY_CODE,
        },
      },
      select: { value: true },
    }),
  ])

  const settings = route?.settings ?? new Map<string, string>()
  const provider = providerOf(settings)
  if (!route || !provider) {
    throw new Error('SMS is not configured. Set up an SMS provider in Settings.')
  }

  const from = settings.get(ORG_SMS_KEYS.SMS_PHONE_NUMBER)
  if (!from) {
    throw new Error('SMS phone number is not configured.')
  }

  // Twilio, Vonage and Telnyx all require strict E.164, so the destination is
  // normalized before any of them sees it.
  const normalizedTo = normalizePortalPhone(options.to, countryRow?.value ?? null)
  if (!normalizedTo) {
    throw new Error(
      'Invalid phone number format. Must be E.164 format (e.g. +15551234567), ' +
        'or set a default country code in Settings → Localization.'
    )
  }

  const send = async (): Promise<SendSmsResult> => {
    switch (provider) {
      case 'twilio': {
        const result = await sendViaTwilio(settings, from, normalizedTo, options.body)
        return { providerMsgId: result.sid, to: normalizedTo }
      }
      case 'vonage': {
        const result = await sendViaVonage(settings, from, normalizedTo, options.body)
        return { providerMsgId: result.messageId, to: normalizedTo }
      }
      case 'telnyx': {
        const result = await sendViaTelnyx(settings, from, normalizedTo, options.body)
        return { providerMsgId: result.id, to: normalizedTo }
      }
    }
  }

  // Counted here rather than in each caller, so the sign-in codes, the
  // scheduled reminders and the messages typed by hand all draw on the same
  // allowance. A workshop's own provider is its own bill and has no limit.
  if (route.source === 'platform') {
    return withPlatformSmsAllowance(organizationId, route.dailyLimit, options.body, send).catch(
      (error: unknown) => {
        if (error instanceof SmsCountryRefusedError) {
          error.platform = true
          error.message =
            'Texts to this country are not available from the Torqvoice number. ' +
            'Connect your own SMS provider to text this customer.'
        }
        throw error
      }
    )
  }
  return send().catch((error: unknown) => {
    if (error instanceof SmsCountryRefusedError) {
      error.message =
        'Your Twilio account does not allow texts to this country. ' +
        'Turn the country on under Geo permissions in Twilio.'
    }
    throw error
  })
}
