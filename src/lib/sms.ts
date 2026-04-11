import { db } from './db'
import { ORG_SMS_KEYS } from '@/features/sms/Schema/smsSettingsSchema'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { normalizePortalPhone } from './portal-phone'

export type SmsProvider = 'twilio' | 'vonage' | 'telnyx'

export interface SendSmsOptions {
  to: string
  body: string
}

type SettingsMap = Map<string, string>

async function getOrgSettings(organizationId: string, keys: string[]): Promise<SettingsMap> {
  const rows = await db.appSetting.findMany({
    where: { organizationId, key: { in: keys } },
  })
  return new Map(rows.map((r) => [r.key, r.value]))
}

export async function getOrgSmsProvider(organizationId: string): Promise<SmsProvider | null> {
  const setting = await db.appSetting.findUnique({
    where: {
      organizationId_key: {
        organizationId,
        key: ORG_SMS_KEYS.SMS_PROVIDER,
      },
    },
  })
  const value = setting?.value
  if (value === 'twilio' || value === 'vonage' || value === 'telnyx') {
    return value
  }
  return null
}

export async function getOrgSmsPhoneNumber(organizationId: string): Promise<string | null> {
  const setting = await db.appSetting.findUnique({
    where: {
      organizationId_key: {
        organizationId,
        key: ORG_SMS_KEYS.SMS_PHONE_NUMBER,
      },
    },
  })
  return setting?.value || null
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

  const params = new URLSearchParams({ From: from, To: to, Body: body })

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`Twilio error: ${(err as { message?: string }).message || res.statusText}`)
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
  const provider = await getOrgSmsProvider(organizationId)
  if (!provider) {
    throw new Error('SMS is not configured. Set up an SMS provider in Settings.')
  }

  const from = await getOrgSmsPhoneNumber(organizationId)
  if (!from) {
    throw new Error('SMS phone number is not configured.')
  }

  // Load the SMS provider settings + the workshop's default country code
  // in a single query so we can normalize the destination phone before
  // any provider sees it. Twilio/Vonage/Telnyx all require strict E.164.
  const allKeys = [...Object.values(ORG_SMS_KEYS), SETTING_KEYS.WORKSHOP_DEFAULT_COUNTRY_CODE]
  const settings = await getOrgSettings(organizationId, allKeys)

  const defaultCountryCode = settings.get(SETTING_KEYS.WORKSHOP_DEFAULT_COUNTRY_CODE) ?? null
  const normalizedTo = normalizePortalPhone(options.to, defaultCountryCode)
  if (!normalizedTo) {
    throw new Error(
      'Invalid phone number format. Must be E.164 format (e.g. +15551234567), ' +
        'or set a default country code in Settings → Localization.'
    )
  }

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
