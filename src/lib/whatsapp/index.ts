import 'server-only'
import { db } from '@/lib/db'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { getPhoneLookupVariants, normalizePortalPhone } from '@/lib/portal-phone'
import {
  ORG_WHATSAPP_KEYS,
  WHATSAPP_WEBHOOK_TOKEN_FIELD,
  whatsappCredentialKey,
} from '@/features/whatsapp/Schema/whatsappSettingsSchema'
import { getWhatsappAdapter } from './registry'
import { signWhatsappMediaToken } from './media-link'
import type {
  WhatsappAdapter,
  WhatsappContext,
  WhatsappInbound,
  WhatsappMediaType,
  WhatsappStatusEvent,
  WhatsappTemplate,
} from './types'

export * from './types'
export { listWhatsappAdapters, listWhatsappProviderOptions, getWhatsappAdapter } from './registry'

/**
 * WhatsApp only lets a business write freely for 24 hours after the customer's
 * last message. Outside that, an approved template is the only way through.
 */
export const SERVICE_WINDOW_HOURS = 24

/** Raised instead of a provider error, so callers can explain the rule. */
export class WhatsappWindowClosedError extends Error {
  constructor() {
    super(
      'WhatsApp only allows free messages for 24 hours after the customer writes to you, and that window has closed. Ask them to send you a message, or set up an approved template in Settings to reach them any time.'
    )
    this.name = 'WhatsappWindowClosedError'
  }
}

export interface WhatsappConfig {
  organizationId: string
  adapter: WhatsappAdapter
  context: WhatsappContext
  /** Template used to reopen a closed conversation, when the shop set one up. */
  template: { name: string; language: string } | null
}

/**
 * Loads a workshop's WhatsApp setup, or null when it cannot send.
 *
 * Everything the adapter needs is resolved here, so no caller has to know
 * which provider is in play or where its credentials are stored.
 */
export async function getWhatsappConfig(organizationId: string): Promise<WhatsappConfig | null> {
  const rows = await db.appSetting.findMany({
    where: { organizationId },
    select: { key: true, value: true },
  })
  const settings = new Map(rows.map((row) => [row.key, row.value]))

  if (settings.get(ORG_WHATSAPP_KEYS.WHATSAPP_ENABLED) !== 'true') return null

  const adapter = getWhatsappAdapter(settings.get(ORG_WHATSAPP_KEYS.WHATSAPP_PROVIDER))
  if (!adapter) return null

  const from = settings.get(ORG_WHATSAPP_KEYS.WHATSAPP_FROM)
  if (!from) return null

  const credentials: Record<string, string> = {}
  for (const field of adapter.credentials) {
    const value = settings.get(whatsappCredentialKey(adapter.id, field.key))
    if (value) credentials[field.key] = value
  }
  // Managed fields are not declared by the adapter but still belong to it.
  const webhookToken = settings.get(whatsappCredentialKey(adapter.id, WHATSAPP_WEBHOOK_TOKEN_FIELD))
  if (webhookToken) credentials[WHATSAPP_WEBHOOK_TOKEN_FIELD] = webhookToken

  const missing = adapter.credentials.filter((field) => field.required && !credentials[field.key])
  if (missing.length > 0) return null

  const templateName = settings.get(ORG_WHATSAPP_KEYS.WHATSAPP_TEMPLATE_NAME)
  const templateLanguage = settings.get(ORG_WHATSAPP_KEYS.WHATSAPP_TEMPLATE_LANGUAGE)

  return {
    organizationId,
    adapter,
    context: { organizationId, from, credentials },
    template: templateName ? { name: templateName, language: templateLanguage || 'en' } : null,
  }
}

/** Cheap check for the settings UI and channel pickers. */
export async function isWhatsappConfigured(organizationId: string): Promise<boolean> {
  return (await getWhatsappConfig(organizationId)) !== null
}

async function defaultCountryCode(organizationId: string): Promise<string | null> {
  const setting = await db.appSetting.findUnique({
    where: {
      organizationId_key: {
        organizationId,
        key: SETTING_KEYS.WORKSHOP_DEFAULT_COUNTRY_CODE,
      },
    },
    select: { value: true },
  })
  return setting?.value ?? null
}

/**
 * When the customer last wrote, which is what opens the free-text window.
 * Null means they never have.
 */
export async function lastInboundAt(organizationId: string, phone: string): Promise<Date | null> {
  const message = await db.whatsappMessage.findFirst({
    where: { organizationId, direction: 'inbound', fromNumber: phone },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  })
  return message?.createdAt ?? null
}

export async function isWithinServiceWindow(
  organizationId: string,
  phone: string
): Promise<boolean> {
  const last = await lastInboundAt(organizationId, phone)
  if (!last) return false
  return Date.now() - last.getTime() < SERVICE_WINDOW_HOURS * 60 * 60 * 1000
}

/**
 * Turns an internal file URL into something the provider can actually fetch.
 *
 * Providers download media from their own servers, with no session of ours, so
 * an `/api/protected/files/...` link would arrive as a 401 and the customer
 * would receive an empty message. Anything already absolute is left alone.
 */
function toProviderMediaUrl(
  organizationId: string,
  mediaUrl: string | undefined
): string | undefined {
  if (!mediaUrl) return undefined
  if (/^https?:\/\//i.test(mediaUrl)) return mediaUrl

  const base = process.env.NEXT_PUBLIC_APP_URL
  if (!base) {
    throw new Error('NEXT_PUBLIC_APP_URL must be set before WhatsApp can send attachments.')
  }

  const token = signWhatsappMediaToken({ fileUrl: mediaUrl, organizationId })
  return `${base.replace(/\/$/, '')}/api/public/whatsapp-media/${token}`
}

export interface SendWhatsappOptions {
  to: string
  body?: string
  /** Must be reachable without our auth: the provider fetches it itself. */
  mediaUrl?: string
  mediaType?: WhatsappMediaType
  mediaFilename?: string
  customerId?: string
  relatedEntityType?: string
  relatedEntityId?: string
  /**
   * Overrides the workshop's default template when the window has closed.
   * Ignored while the conversation is still open.
   */
  template?: WhatsappTemplate
}

export interface SendWhatsappResult {
  messageId: string
  providerMessageId?: string
  /** True when it had to go out as a template rather than free text. */
  usedTemplate: boolean
}

/**
 * Sends one message and records it either way.
 *
 * A failure is stored as a failed row before it is rethrown: a workshop that
 * cannot see what it tried to send has no way to work out why a customer never
 * replied.
 */
export async function sendOrgWhatsapp(
  organizationId: string,
  options: SendWhatsappOptions
): Promise<SendWhatsappResult> {
  const config = await getWhatsappConfig(organizationId)
  if (!config) {
    throw new Error('WhatsApp is not configured. Set it up in Settings → WhatsApp.')
  }

  const to = normalizePortalPhone(options.to, await defaultCountryCode(organizationId))
  if (!to) {
    throw new Error(`"${options.to}" is not a valid phone number.`)
  }

  const open = await isWithinServiceWindow(organizationId, to)
  const template = open ? undefined : (options.template ?? templateFor(config, options))
  if (!open && !template) throw new WhatsappWindowClosedError()

  const record = await db.whatsappMessage.create({
    data: {
      direction: 'outbound',
      provider: config.adapter.id,
      fromNumber: config.context.from,
      toNumber: to,
      body: options.body,
      mediaUrl: options.mediaUrl,
      mediaType: options.mediaType,
      mediaFilename: options.mediaFilename,
      templateName: template?.name,
      status: 'queued',
      organizationId,
      customerId: options.customerId,
      relatedEntityType: options.relatedEntityType,
      relatedEntityId: options.relatedEntityId,
    },
  })

  try {
    const result = await config.adapter.send(config.context, {
      to,
      body: options.body,
      // The row keeps the internal URL so the conversation view can render it;
      // the provider gets a signed public one that expires within the hour.
      mediaUrl: toProviderMediaUrl(organizationId, options.mediaUrl),
      mediaType: options.mediaType,
      mediaFilename: options.mediaFilename,
      template,
    })

    await db.whatsappMessage.update({
      where: { id: record.id },
      data: { status: result.status, providerMessageId: result.providerMessageId },
    })

    return {
      messageId: record.id,
      providerMessageId: result.providerMessageId,
      usedTemplate: Boolean(template),
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    await db.whatsappMessage.update({
      where: { id: record.id },
      data: { status: 'failed', errorMessage: message.slice(0, 500) },
    })
    throw error
  }
}

/**
 * Builds the reopening template from the workshop's default.
 *
 * The message the shop typed becomes the template's first variable, which is
 * the shape almost every "your vehicle is ready" template takes.
 */
function templateFor(
  config: WhatsappConfig,
  options: SendWhatsappOptions
): WhatsappTemplate | undefined {
  if (!config.template) return undefined
  return {
    name: config.template.name,
    language: config.template.language,
    variables: options.body ? [options.body] : undefined,
    headerMediaUrl: toProviderMediaUrl(config.organizationId, options.mediaUrl),
    headerMediaType: options.mediaType,
  }
}

/** Stores one received message and links it to a customer when we can. */
export async function recordInboundWhatsapp(
  organizationId: string,
  provider: string,
  event: WhatsappInbound
) {
  const countryCode = await defaultCountryCode(organizationId)
  const normalized = normalizePortalPhone(event.from, countryCode) ?? event.from

  // A workshop rarely stores numbers the way WhatsApp reports them, so match
  // on every shape the same number can take.
  const variants = getPhoneLookupVariants(normalized, countryCode)
  const customer = await db.customer.findFirst({
    where: { organizationId, phone: { in: variants } },
    select: { id: true, name: true },
  })

  const message = await db.whatsappMessage.create({
    data: {
      direction: 'inbound',
      provider,
      fromNumber: normalized,
      toNumber: event.to,
      body: event.body,
      mediaUrl: event.media?.reference,
      mediaType: event.media?.type,
      mediaFilename: event.media?.filename,
      status: 'received',
      providerMessageId: event.providerMessageId,
      organizationId,
      customerId: customer?.id,
      ...(event.sentAt ? { createdAt: event.sentAt } : {}),
    },
  })

  return { message, customer }
}

/** Applies a delivery receipt to the message it belongs to. */
export async function applyWhatsappStatus(
  organizationId: string,
  event: WhatsappStatusEvent
): Promise<void> {
  await db.whatsappMessage.updateMany({
    where: { organizationId, providerMessageId: event.providerMessageId },
    data: {
      status: event.status,
      errorMessage: event.errorMessage?.slice(0, 500),
    },
  })
}
