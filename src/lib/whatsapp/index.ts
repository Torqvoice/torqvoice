import 'server-only'
import { db } from '@/lib/db'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { getPhoneLookupVariants, normalizePortalPhone } from '@/lib/portal-phone'
import {
  ORG_WHATSAPP_KEYS,
  WHATSAPP_WEBHOOK_TOKEN_FIELD,
  whatsappCredentialKey,
  whatsappTemplateKey,
} from '@/features/whatsapp/Schema/whatsappSettingsSchema'
import { getWhatsappAdapter } from './registry'
import { signWhatsappMediaToken } from './media-link'
import { resolveTemplateVariables } from './templateVariables'
import { parseTemplateTokens, type TemplateToken } from '@/features/whatsapp/Schema/templateTokens'
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
  constructor(needs: 'text' | 'photo' = 'text') {
    super(
      needs === 'photo'
        ? 'WhatsApp only allows free messages for 24 hours after the customer writes to you, and that window has closed. Sending a photo now needs an approved photo template, which is a separate one from the text template. Ask the customer to send you a message, or set one up in Settings.'
        : 'WhatsApp only allows free messages for 24 hours after the customer writes to you, and that window has closed. Ask them to send you a message, or set up an approved text template in Settings to reach them any time.'
    )
    this.name = 'WhatsappWindowClosedError'
  }
}

export interface WhatsappTemplateSetup {
  name: string
  language: string
  tokens: TemplateToken[]
}

export interface WhatsappConfig {
  organizationId: string
  adapter: WhatsappAdapter
  context: WhatsappContext
  /** Reopens a closed conversation with text only. */
  template: WhatsappTemplateSetup | null
  /**
   * Reopens it with a photo. A separate template because WhatsApp fixes the
   * media type when a template is approved: one that was approved with an
   * image can never carry plain text, and vice versa.
   */
  mediaTemplate: WhatsappTemplateSetup | null
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

  return {
    organizationId,
    adapter,
    context: { organizationId, from, credentials },
    template: templateSetup(
      readTemplate(settings, adapter.id, 'text', 'name'),
      readTemplate(settings, adapter.id, 'text', 'language'),
      readTemplate(settings, adapter.id, 'text', 'variables')
    ),
    mediaTemplate: templateSetup(
      readTemplate(settings, adapter.id, 'media', 'name'),
      readTemplate(settings, adapter.id, 'media', 'language'),
      readTemplate(settings, adapter.id, 'media', 'variables')
    ),
  }
}

/**
 * A template field for one provider, falling back to the flat keys used before
 * templates were namespaced, so an existing setup keeps working.
 */
function readTemplate(
  settings: Map<string, string>,
  provider: string,
  kind: 'text' | 'media',
  field: 'name' | 'language' | 'variables'
): string | undefined {
  const namespaced = settings.get(whatsappTemplateKey(provider, kind, field))
  if (namespaced !== undefined) return namespaced

  const legacy = {
    text: {
      name: ORG_WHATSAPP_KEYS.WHATSAPP_TEMPLATE_NAME,
      language: ORG_WHATSAPP_KEYS.WHATSAPP_TEMPLATE_LANGUAGE,
      variables: ORG_WHATSAPP_KEYS.WHATSAPP_TEMPLATE_VARIABLES,
    },
    media: {
      name: ORG_WHATSAPP_KEYS.WHATSAPP_MEDIA_TEMPLATE_NAME,
      language: ORG_WHATSAPP_KEYS.WHATSAPP_MEDIA_TEMPLATE_LANGUAGE,
      variables: ORG_WHATSAPP_KEYS.WHATSAPP_MEDIA_TEMPLATE_VARIABLES,
    },
  } as const

  // Only for the provider the workshop was using when those keys were written.
  if (settings.get(ORG_WHATSAPP_KEYS.WHATSAPP_PROVIDER) !== provider) return undefined
  return settings.get(legacy[kind][field])
}

function templateSetup(
  name: string | undefined,
  language: string | undefined,
  variables: string | undefined
): WhatsappTemplateSetup | null {
  if (!name) return null
  return { name, language: language || 'en', tokens: parseTemplateTokens(variables) }
}

/**
 * Enough to answer a provider's webhook, which is less than it takes to send.
 *
 * A provider verifies the callback URL before a workshop has the rest of its
 * credentials: Meta only issues a phone number ID once the webhook is live. So
 * this asks for neither completeness nor the enabled flag, and reads whatever
 * is stored for the provider named in the URL.
 */
export async function getWhatsappWebhookContext(
  organizationId: string,
  providerId: string
): Promise<{ adapter: WhatsappAdapter; context: WhatsappContext } | null> {
  const adapter = getWhatsappAdapter(providerId)
  if (!adapter) return null

  const rows = await db.appSetting.findMany({
    where: { organizationId },
    select: { key: true, value: true },
  })
  const settings = new Map(rows.map((row) => [row.key, row.value]))

  // Only for the provider in the URL, so a stored Twilio token can never
  // authorise a call that claims to be from Meta.
  if (settings.get(ORG_WHATSAPP_KEYS.WHATSAPP_PROVIDER) !== adapter.id) return null

  const credentials: Record<string, string> = {}
  for (const field of adapter.credentials) {
    const value = settings.get(whatsappCredentialKey(adapter.id, field.key))
    if (value) credentials[field.key] = value
  }
  const webhookToken = settings.get(whatsappCredentialKey(adapter.id, WHATSAPP_WEBHOOK_TOKEN_FIELD))
  if (webhookToken) credentials[WHATSAPP_WEBHOOK_TOKEN_FIELD] = webhookToken

  return {
    adapter,
    context: {
      organizationId,
      from: settings.get(ORG_WHATSAPP_KEYS.WHATSAPP_FROM) ?? '',
      credentials,
    },
  }
}

/**
 * Records that the provider reached us, once.
 *
 * Written on the first verification or delivery and never again: it answers
 * "did this ever work", not "when was the last message".
 */
export async function markWhatsappWebhookSeen(organizationId: string): Promise<void> {
  const key = ORG_WHATSAPP_KEYS.WHATSAPP_WEBHOOK_SEEN_AT
  const existing = await db.appSetting.findUnique({
    where: { organizationId_key: { organizationId, key } },
    select: { value: true },
  })
  if (existing?.value) return

  const owner = await db.appSetting.findFirst({
    where: { organizationId, key: ORG_WHATSAPP_KEYS.WHATSAPP_PROVIDER },
    select: { userId: true },
  })
  if (!owner) return

  await db.appSetting.upsert({
    where: { organizationId_key: { organizationId, key } },
    update: { value: new Date().toISOString() },
    create: {
      organizationId,
      key,
      value: new Date().toISOString(),
      userId: owner.userId,
    },
  })
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
/** Where a signed photo is served from, minus the token itself. */
export const WHATSAPP_MEDIA_PATH = '/api/public/whatsapp-media'

function appBaseUrl(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL
  if (!base) {
    throw new Error('NEXT_PUBLIC_APP_URL must be set before WhatsApp can send attachments.')
  }
  return base.replace(/\/$/, '')
}

/**
 * The token naming one photo, or undefined when there is nothing to sign.
 *
 * A media template cannot take a bare variable where its URL goes: providers
 * validate that field as a real URL, so the workshop pastes our prefix and the
 * variable supplies only the last segment.
 */
function mediaTokenFor(organizationId: string, mediaUrl: string | undefined): string | undefined {
  if (!mediaUrl || /^https?:\/\//i.test(mediaUrl)) return undefined
  return signWhatsappMediaToken({ fileUrl: mediaUrl, organizationId })
}

function toProviderMediaUrl(
  organizationId: string,
  mediaUrl: string | undefined
): string | undefined {
  if (!mediaUrl) return undefined
  if (/^https?:\/\//i.test(mediaUrl)) return mediaUrl

  const token = mediaTokenFor(organizationId, mediaUrl)
  return token ? `${appBaseUrl()}${WHATSAPP_MEDIA_PATH}/${token}` : undefined
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
  const template = open ? undefined : (options.template ?? (await templateFor(config, options)))
  if (!open && !template) throw new WhatsappWindowClosedError(options.mediaUrl ? 'photo' : 'text')

  // Callers that know the customer say so. The rest, a test send or anything
  // addressed by number alone, are matched here the same way inbound messages
  // are, so one person is one conversation rather than two.
  const customerId = options.customerId ?? (await customerForNumber(organizationId, to))

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
      customerId,
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
async function templateFor(
  config: WhatsappConfig,
  options: SendWhatsappOptions
): Promise<WhatsappTemplate | undefined> {
  // A template approved with an image can only ever send an image, so the
  // choice is made by what is actually being sent, not by preference.
  const setup = options.mediaUrl ? config.mediaTemplate : config.template
  if (!setup) return undefined

  const providerMediaUrl = toProviderMediaUrl(config.organizationId, options.mediaUrl)

  const variables = await resolveTemplateVariables(setup.tokens, {
    organizationId: config.organizationId,
    customerId: options.customerId,
    body: options.body,
    // Only the token: the template already carries the rest of the URL.
    mediaToken: mediaTokenFor(config.organizationId, options.mediaUrl),
    relatedEntityType: options.relatedEntityType,
    relatedEntityId: options.relatedEntityId,
  })

  return {
    name: setup.name,
    language: setup.language,
    variables: variables.length > 0 ? variables : undefined,
    headerMediaUrl: providerMediaUrl,
    headerMediaType: options.mediaType,
  }
}

/**
 * The customer a number belongs to, if any.
 *
 * A workshop rarely stores numbers the way WhatsApp reports them, so every
 * shape the same number can take is tried.
 */
async function customerForNumber(organizationId: string, phone: string) {
  const countryCode = await defaultCountryCode(organizationId)
  const normalized = normalizePortalPhone(phone, countryCode) ?? phone
  const customer = await db.customer.findFirst({
    where: {
      organizationId,
      phone: { in: getPhoneLookupVariants(normalized, countryCode) },
    },
    select: { id: true },
  })
  return customer?.id
}

/**
 * Files messages already stored under a bare number against a customer.
 *
 * The app tells someone to add an unknown caller as a customer in order to
 * reply, so the history that prompted it has to follow them across rather than
 * being stranded in a second thread.
 */
export async function claimWhatsappMessagesForCustomer(
  organizationId: string,
  customerId: string,
  phone: string | null | undefined
) {
  if (!phone?.trim()) return { claimed: 0 }

  const countryCode = await defaultCountryCode(organizationId)
  const normalized = normalizePortalPhone(phone, countryCode) ?? phone
  const variants = getPhoneLookupVariants(normalized, countryCode)

  const { count } = await db.whatsappMessage.updateMany({
    where: {
      organizationId,
      customerId: null,
      OR: [{ fromNumber: { in: variants } }, { toNumber: { in: variants } }],
    },
    data: { customerId },
  })
  return { claimed: count }
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
