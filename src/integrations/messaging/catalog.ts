/**
 * Every messaging vendor a workshop can send through, declared once.
 *
 * SMS, WhatsApp, Telegram and email each used to have their own settings page
 * writing their own `AppSetting` rows. They are integrations like any other,
 * so they live in the catalog now — but a workshop that configured Twilio two
 * years ago must not be asked to do it again. That is what the `legacy` field
 * on every credential and setting is for: it names the row the value used to
 * live in, so the platform can adopt an existing setup into a connection
 * without anyone touching a form.
 *
 * Credential field lists are written out here rather than imported from the
 * WhatsApp adapters, because manifests are serialized to the browser for the
 * catalog and must stay free of server code. A test keeps the two in step.
 */

import { ORG_EMAIL_KEYS } from '@/features/email/Schema/emailSettingsSchema'
import { ORG_SMS_KEYS } from '@/features/sms/Schema/smsSettingsSchema'
import { ORG_TELEGRAM_KEYS } from '@/features/telegram/Schema/telegramSettingsSchema'
import {
  ORG_WHATSAPP_KEYS,
  WHATSAPP_WEBHOOK_TOKEN_FIELD,
  whatsappCredentialKey,
  whatsappTemplateKey,
} from '@/features/whatsapp/Schema/whatsappSettingsSchema'
import type { CredentialField, SettingField } from '@/features/integrations/Lib/types'

export type MessagingChannel = 'sms' | 'whatsapp' | 'telegram' | 'email'

/** A credential field plus the settings row it used to be stored in. */
export interface MessagingCredential extends CredentialField {
  /** Key under `AppSetting` before the move. Absent for values we generate. */
  legacy?: string
  /**
   * Generated rather than typed: a webhook secret the workshop never sees.
   * Adoption carries the old value over so the vendor's existing webhook URL
   * keeps validating.
   */
  generated?: boolean
}

export interface MessagingSetting extends SettingField {
  legacy?: string
}

export interface MessagingProvider {
  /** Connector id, which is also the folder name under src/integrations. */
  id: string
  /** Vendor name as the vendor writes it. */
  name: string
  channel: MessagingChannel
  /**
   * The value this vendor had in `sms.provider`, `whatsapp.provider` or
   * `email.provider`. Telegram had no provider row: the bot token being set
   * was the whole signal.
   */
  legacyProvider: string | null
  /**
   * Row that had to be set for the channel to count as configured. Adoption
   * looks here first, so an org that half-filled a form is not adopted.
   */
  legacyEvidence: string
  countries: string[] | 'global'
  capabilities: string[]
  credentials: MessagingCredential[]
  settings: MessagingSetting[]
}

function secret(
  key: string,
  legacy: string,
  extra: Partial<MessagingCredential> = {}
): MessagingCredential {
  return { key, label: key, type: 'password', required: true, legacy, ...extra }
}

function text(
  key: string,
  legacy: string,
  extra: Partial<MessagingCredential> = {}
): MessagingCredential {
  return { key, label: key, type: 'text', required: true, legacy, ...extra }
}

/** The number or address the channel sends from, which every vendor needs. */
function fromNumber(legacy: string): MessagingSetting {
  return { key: 'phoneNumber', type: 'text', label: 'phoneNumber', required: true, legacy }
}

function fromAddress(emailLegacy: string, nameLegacy: string): MessagingSetting[] {
  return [
    { key: 'fromEmail', type: 'text', label: 'fromEmail', required: true, legacy: emailLegacy },
    { key: 'fromName', type: 'text', label: 'fromName', legacy: nameLegacy },
  ]
}

const SMS: MessagingProvider[] = [
  {
    id: 'twilio-sms',
    name: 'Twilio',
    channel: 'sms',
    legacyProvider: 'twilio',
    legacyEvidence: ORG_SMS_KEYS.SMS_TWILIO_ACCOUNT_SID,
    countries: 'global',
    capabilities: ['sms.send', 'sms.receive'],
    credentials: [
      text('accountSid', ORG_SMS_KEYS.SMS_TWILIO_ACCOUNT_SID, { placeholder: 'ACxxxxxxxx' }),
      secret('authToken', ORG_SMS_KEYS.SMS_TWILIO_AUTH_TOKEN),
      secret('webhookSecret', ORG_SMS_KEYS.SMS_WEBHOOK_SECRET, {
        required: false,
        generated: true,
      }),
    ],
    settings: [fromNumber(ORG_SMS_KEYS.SMS_PHONE_NUMBER)],
  },
  {
    id: 'vonage-sms',
    name: 'Vonage',
    channel: 'sms',
    legacyProvider: 'vonage',
    legacyEvidence: ORG_SMS_KEYS.SMS_VONAGE_API_KEY,
    countries: 'global',
    capabilities: ['sms.send', 'sms.receive'],
    credentials: [
      text('apiKey', ORG_SMS_KEYS.SMS_VONAGE_API_KEY),
      secret('apiSecret', ORG_SMS_KEYS.SMS_VONAGE_API_SECRET),
      secret('webhookSecret', ORG_SMS_KEYS.SMS_WEBHOOK_SECRET, {
        required: false,
        generated: true,
      }),
    ],
    settings: [fromNumber(ORG_SMS_KEYS.SMS_PHONE_NUMBER)],
  },
  {
    id: 'telnyx-sms',
    name: 'Telnyx',
    channel: 'sms',
    legacyProvider: 'telnyx',
    legacyEvidence: ORG_SMS_KEYS.SMS_TELNYX_API_KEY,
    countries: 'global',
    capabilities: ['sms.send', 'sms.receive'],
    credentials: [
      secret('apiKey', ORG_SMS_KEYS.SMS_TELNYX_API_KEY),
      secret('webhookSecret', ORG_SMS_KEYS.SMS_WEBHOOK_SECRET, {
        required: false,
        generated: true,
      }),
    ],
    settings: [fromNumber(ORG_SMS_KEYS.SMS_PHONE_NUMBER)],
  },
]

/**
 * The switch the old WhatsApp page had. A connection being active is not the
 * same thing: a workshop can keep its credentials in place while turning
 * outbound WhatsApp off for a while.
 */
function whatsappEnabled(): MessagingSetting {
  return {
    key: 'enabled',
    type: 'boolean',
    label: 'enabled',
    legacy: ORG_WHATSAPP_KEYS.WHATSAPP_ENABLED,
    default: true,
  }
}

/** Template settings, which WhatsApp needs and no other channel has. */
function whatsappTemplateSettings(provider: string): MessagingSetting[] {
  return [
    {
      key: 'templateName',
      type: 'text',
      label: 'templateName',
      legacy: whatsappTemplateKey(provider, 'text', 'name'),
    },
    {
      key: 'templateLanguage',
      type: 'text',
      label: 'templateLanguage',
      legacy: whatsappTemplateKey(provider, 'text', 'language'),
    },
    {
      key: 'templateVariables',
      type: 'text',
      label: 'templateVariables',
      legacy: whatsappTemplateKey(provider, 'text', 'variables'),
    },
    {
      key: 'mediaTemplateName',
      type: 'text',
      label: 'mediaTemplateName',
      legacy: whatsappTemplateKey(provider, 'media', 'name'),
    },
    {
      key: 'mediaTemplateLanguage',
      type: 'text',
      label: 'mediaTemplateLanguage',
      legacy: whatsappTemplateKey(provider, 'media', 'language'),
    },
    {
      key: 'mediaTemplateVariables',
      type: 'text',
      label: 'mediaTemplateVariables',
      legacy: whatsappTemplateKey(provider, 'media', 'variables'),
    },
  ]
}

const WHATSAPP: MessagingProvider[] = [
  {
    id: 'whatsapp-meta',
    name: 'WhatsApp Business (Meta)',
    channel: 'whatsapp',
    legacyProvider: 'meta',
    legacyEvidence: whatsappCredentialKey('meta', 'phoneNumberId'),
    countries: 'global',
    capabilities: ['whatsapp.send', 'whatsapp.receive'],
    credentials: [
      text('phoneNumberId', whatsappCredentialKey('meta', 'phoneNumberId'), {
        placeholder: '123456789012345',
      }),
      secret('accessToken', whatsappCredentialKey('meta', 'accessToken')),
      text('verifyToken', whatsappCredentialKey('meta', 'verifyToken')),
      secret('appSecret', whatsappCredentialKey('meta', 'appSecret'), { required: false }),
      text('apiVersion', whatsappCredentialKey('meta', 'apiVersion'), { required: false }),
    ],
    settings: [
      whatsappEnabled(),
      fromNumber(ORG_WHATSAPP_KEYS.WHATSAPP_FROM),
      ...whatsappTemplateSettings('meta'),
    ],
  },
  {
    id: 'whatsapp-twilio',
    name: 'WhatsApp via Twilio',
    channel: 'whatsapp',
    legacyProvider: 'twilio',
    legacyEvidence: whatsappCredentialKey('twilio', 'accountSid'),
    countries: 'global',
    capabilities: ['whatsapp.send', 'whatsapp.receive'],
    credentials: [
      text('accountSid', whatsappCredentialKey('twilio', 'accountSid'), {
        placeholder: 'ACxxxxxxxx',
      }),
      secret('authToken', whatsappCredentialKey('twilio', 'authToken')),
      text('messagingServiceSid', whatsappCredentialKey('twilio', 'messagingServiceSid'), {
        required: false,
        placeholder: 'MGxxxxxxxx',
      }),
      secret(
        WHATSAPP_WEBHOOK_TOKEN_FIELD,
        whatsappCredentialKey('twilio', WHATSAPP_WEBHOOK_TOKEN_FIELD),
        { required: false, generated: true }
      ),
    ],
    settings: [
      whatsappEnabled(),
      fromNumber(ORG_WHATSAPP_KEYS.WHATSAPP_FROM),
      ...whatsappTemplateSettings('twilio'),
    ],
  },
]

const TELEGRAM: MessagingProvider[] = [
  {
    id: 'telegram',
    name: 'Telegram',
    channel: 'telegram',
    legacyProvider: null,
    legacyEvidence: ORG_TELEGRAM_KEYS.TELEGRAM_BOT_TOKEN,
    countries: 'global',
    capabilities: ['telegram.send', 'telegram.receive'],
    credentials: [
      secret('botToken', ORG_TELEGRAM_KEYS.TELEGRAM_BOT_TOKEN),
      secret('webhookSecret', ORG_TELEGRAM_KEYS.TELEGRAM_WEBHOOK_SECRET, {
        required: false,
        generated: true,
      }),
    ],
    settings: [
      {
        key: 'enabled',
        type: 'boolean',
        label: 'enabled',
        legacy: ORG_TELEGRAM_KEYS.TELEGRAM_ENABLED,
        default: true,
      },
      {
        key: 'botUsername',
        type: 'text',
        label: 'botUsername',
        legacy: ORG_TELEGRAM_KEYS.TELEGRAM_BOT_USERNAME,
      },
    ],
  },
]

const EMAIL: MessagingProvider[] = [
  {
    id: 'smtp',
    name: 'SMTP',
    channel: 'email',
    legacyProvider: 'smtp',
    legacyEvidence: ORG_EMAIL_KEYS.EMAIL_SMTP_HOST,
    countries: 'global',
    capabilities: ['email.send'],
    credentials: [
      text('host', ORG_EMAIL_KEYS.EMAIL_SMTP_HOST, { placeholder: 'smtp.example.com' }),
      text('port', ORG_EMAIL_KEYS.EMAIL_SMTP_PORT, { placeholder: '587' }),
      text('user', ORG_EMAIL_KEYS.EMAIL_SMTP_USER, { required: false }),
      secret('pass', ORG_EMAIL_KEYS.EMAIL_SMTP_PASS, { required: false }),
    ],
    settings: [
      ...fromAddress(ORG_EMAIL_KEYS.EMAIL_SMTP_FROM_EMAIL, ORG_EMAIL_KEYS.EMAIL_SMTP_FROM_NAME),
      {
        key: 'secure',
        type: 'boolean',
        label: 'secure',
        legacy: ORG_EMAIL_KEYS.EMAIL_SMTP_SECURE,
        default: false,
      },
      {
        key: 'requireTls',
        type: 'boolean',
        label: 'requireTls',
        legacy: ORG_EMAIL_KEYS.EMAIL_SMTP_REQUIRE_TLS,
        default: false,
      },
      {
        key: 'rejectUnauthorized',
        type: 'boolean',
        label: 'rejectUnauthorized',
        legacy: ORG_EMAIL_KEYS.EMAIL_SMTP_REJECT_UNAUTHORIZED,
        default: true,
      },
    ],
  },
  {
    id: 'resend',
    name: 'Resend',
    channel: 'email',
    legacyProvider: 'resend',
    legacyEvidence: ORG_EMAIL_KEYS.EMAIL_RESEND_API_KEY,
    countries: 'global',
    capabilities: ['email.send'],
    credentials: [secret('apiKey', ORG_EMAIL_KEYS.EMAIL_RESEND_API_KEY, { placeholder: 're_...' })],
    settings: fromAddress(
      ORG_EMAIL_KEYS.EMAIL_RESEND_FROM_EMAIL,
      ORG_EMAIL_KEYS.EMAIL_RESEND_FROM_NAME
    ),
  },
  {
    id: 'postmark',
    name: 'Postmark',
    channel: 'email',
    legacyProvider: 'postmark',
    legacyEvidence: ORG_EMAIL_KEYS.EMAIL_POSTMARK_API_KEY,
    countries: 'global',
    capabilities: ['email.send'],
    credentials: [secret('apiKey', ORG_EMAIL_KEYS.EMAIL_POSTMARK_API_KEY)],
    settings: fromAddress(
      ORG_EMAIL_KEYS.EMAIL_POSTMARK_FROM_EMAIL,
      ORG_EMAIL_KEYS.EMAIL_POSTMARK_FROM_NAME
    ),
  },
  {
    id: 'mailgun',
    name: 'Mailgun',
    channel: 'email',
    legacyProvider: 'mailgun',
    legacyEvidence: ORG_EMAIL_KEYS.EMAIL_MAILGUN_API_KEY,
    countries: 'global',
    capabilities: ['email.send'],
    credentials: [
      secret('apiKey', ORG_EMAIL_KEYS.EMAIL_MAILGUN_API_KEY),
      text('domain', ORG_EMAIL_KEYS.EMAIL_MAILGUN_DOMAIN, { placeholder: 'mg.example.com' }),
    ],
    settings: [
      ...fromAddress(
        ORG_EMAIL_KEYS.EMAIL_MAILGUN_FROM_EMAIL,
        ORG_EMAIL_KEYS.EMAIL_MAILGUN_FROM_NAME
      ),
      {
        key: 'region',
        type: 'select',
        label: 'region',
        legacy: ORG_EMAIL_KEYS.EMAIL_MAILGUN_REGION,
        default: 'us',
        options: [
          { value: 'us', label: 'US' },
          { value: 'eu', label: 'EU' },
        ],
      },
    ],
  },
  {
    id: 'sendgrid',
    name: 'SendGrid',
    channel: 'email',
    legacyProvider: 'sendgrid',
    legacyEvidence: ORG_EMAIL_KEYS.EMAIL_SENDGRID_API_KEY,
    countries: 'global',
    capabilities: ['email.send'],
    credentials: [
      secret('apiKey', ORG_EMAIL_KEYS.EMAIL_SENDGRID_API_KEY, { placeholder: 'SG...' }),
    ],
    settings: fromAddress(
      ORG_EMAIL_KEYS.EMAIL_SENDGRID_FROM_EMAIL,
      ORG_EMAIL_KEYS.EMAIL_SENDGRID_FROM_NAME
    ),
  },
  {
    id: 'amazon-ses',
    name: 'Amazon SES',
    channel: 'email',
    legacyProvider: 'ses',
    legacyEvidence: ORG_EMAIL_KEYS.EMAIL_SES_ACCESS_KEY_ID,
    countries: 'global',
    capabilities: ['email.send'],
    credentials: [
      text('accessKeyId', ORG_EMAIL_KEYS.EMAIL_SES_ACCESS_KEY_ID),
      secret('secretAccessKey', ORG_EMAIL_KEYS.EMAIL_SES_SECRET_ACCESS_KEY),
      text('region', ORG_EMAIL_KEYS.EMAIL_SES_REGION, { placeholder: 'eu-west-1' }),
    ],
    settings: fromAddress(ORG_EMAIL_KEYS.EMAIL_SES_FROM_EMAIL, ORG_EMAIL_KEYS.EMAIL_SES_FROM_NAME),
  },
]

export const MESSAGING_PROVIDERS: readonly MessagingProvider[] = [
  ...SMS,
  ...WHATSAPP,
  ...TELEGRAM,
  ...EMAIL,
]

const BY_ID = new Map(MESSAGING_PROVIDERS.map((p) => [p.id, p]))

export function messagingProvider(connectorId: string): MessagingProvider | null {
  return BY_ID.get(connectorId) ?? null
}

export function providersForChannel(channel: MessagingChannel): MessagingProvider[] {
  return MESSAGING_PROVIDERS.filter((p) => p.channel === channel)
}

/** The connector a legacy `<channel>.provider` value points at. */
export function providerForLegacyId(
  channel: MessagingChannel,
  legacyProvider: string | null
): MessagingProvider | null {
  const candidates = providersForChannel(channel)
  if (channel === 'telegram') return candidates[0] ?? null
  return candidates.find((p) => p.legacyProvider === legacyProvider) ?? null
}

/** Every legacy row the channel could have used, for a single settings read. */
export function legacyKeysForChannel(channel: MessagingChannel): string[] {
  const keys = new Set<string>()
  for (const provider of providersForChannel(channel)) {
    for (const c of provider.credentials) if (c.legacy) keys.add(c.legacy)
    for (const s of provider.settings) if (s.legacy) keys.add(s.legacy)
  }
  return [...keys]
}
