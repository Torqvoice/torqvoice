'use server'

import crypto from 'crypto'
import { db } from '@/lib/db'
import { withAuth } from '@/lib/with-auth'
import { revalidatePath } from 'next/cache'
import { demoGuard } from '@/lib/demo'
import { requireFeature } from '@/lib/features'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { armFeatureHints } from '@/features/settings/Lib/armFeatureHints'
import {
  ALL_ORG_WHATSAPP_KEYS,
  ORG_WHATSAPP_KEYS,
  WHATSAPP_WEBHOOK_TOKEN_FIELD,
  whatsappCredentialKey,
  whatsappTemplateKey,
} from '../Schema/whatsappSettingsSchema'
import { getWhatsappAdapter, listWhatsappProviderOptions } from '@/lib/whatsapp/registry'
import { sendOrgWhatsapp, WHATSAPP_MEDIA_PATH } from '@/lib/whatsapp'
import { TEMPLATE_TOKENS, unknownTemplateTokens } from '../Schema/templateTokens'

/** Stands in for a stored secret, so the real one never reaches the browser. */
const SECRET_MASK = '••••••••••••••••'

export interface TemplateFields {
  name: string
  language: string
  variables: string
}

export interface WhatsappSettingsView {
  enabled: boolean
  provider: string | null
  from: string
  /** Per provider, then per kind: the identifiers are provider-shaped. */
  templates: Record<string, { text: TemplateFields; media: TemplateFields }>
  /** Per provider, field name to value, with secrets masked. */
  credentials: Record<string, Record<string, string>>
  /**
   * Where each provider should post, ready to paste into its console.
   *
   * One per provider rather than one for the saved provider: the form shows
   * the URL for whichever is selected, and a workshop switching provider needs
   * the new address before it has saved anything.
   */
  webhookUrls: Record<string, string>
  /**
   * What a media template's URL field needs, with the variable left for the
   * workshop to place, e.g. https://app.example.com/api/public/whatsapp-media/
   */
  mediaUrlPrefix: string
  /** When the provider first reached the webhook, ISO, or null if never. */
  webhookSeenAt: string | null
  /** Whether anything has actually been sent or received yet. */
  hasMessages: boolean
  providers: ReturnType<typeof listWhatsappProviderOptions>
}

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || ''
}

/**
 * The webhook URL for one provider, including the shared token when the
 * provider has no signature of its own to prove the call came from it.
 */
function webhookUrlFor(organizationId: string, providerId: string, token?: string): string {
  const base = `${appUrl()}/api/webhooks/whatsapp/${providerId}/${organizationId}`
  return token ? `${base}?token=${token}` : base
}

/**
 * One template's fields for one provider, falling back to the flat keys used
 * before templates were namespaced.
 */
function readTemplateFields(
  settings: Map<string, string>,
  provider: string,
  kind: 'text' | 'media'
): TemplateFields {
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
  const wasThisProvider = settings.get(ORG_WHATSAPP_KEYS.WHATSAPP_PROVIDER) === provider

  const read = (field: 'name' | 'language' | 'variables') =>
    settings.get(whatsappTemplateKey(provider, kind, field)) ??
    (wasThisProvider ? (settings.get(legacy[kind][field]) ?? '') : '')

  return { name: read('name'), language: read('language'), variables: read('variables') }
}

export async function getWhatsappSettings() {
  return withAuth(
    async ({ organizationId }): Promise<WhatsappSettingsView> => {
      const rows = await db.appSetting.findMany({
        where: { organizationId },
        select: { key: true, value: true },
      })
      const settings = new Map(rows.map((row) => [row.key, row.value]))
      const providers = listWhatsappProviderOptions()

      const credentials: Record<string, Record<string, string>> = {}
      for (const provider of providers) {
        const fields: Record<string, string> = {}
        for (const field of provider.credentials) {
          const value = settings.get(whatsappCredentialKey(provider.id, field.key))
          if (!value) continue
          fields[field.key] = field.secret ? SECRET_MASK : value
        }
        credentials[provider.id] = fields
      }

      const templates: WhatsappSettingsView['templates'] = {}
      for (const provider of providers) {
        templates[provider.id] = {
          text: readTemplateFields(settings, provider.id, 'text'),
          media: readTemplateFields(settings, provider.id, 'media'),
        }
      }

      const providerId = settings.get(ORG_WHATSAPP_KEYS.WHATSAPP_PROVIDER) ?? null

      const webhookUrls: Record<string, string> = {}
      for (const provider of providers) {
        const token = provider.usesWebhookToken
          ? settings.get(whatsappCredentialKey(provider.id, WHATSAPP_WEBHOOK_TOKEN_FIELD))
          : undefined
        webhookUrls[provider.id] = webhookUrlFor(organizationId, provider.id, token)
      }

      return {
        enabled: settings.get(ORG_WHATSAPP_KEYS.WHATSAPP_ENABLED) === 'true',
        provider: providerId,
        from: settings.get(ORG_WHATSAPP_KEYS.WHATSAPP_FROM) ?? '',
        templates,
        credentials,
        webhookUrls,
        mediaUrlPrefix: `${appUrl().replace(/\/$/, '')}${WHATSAPP_MEDIA_PATH}/`,
        webhookSeenAt: settings.get(ORG_WHATSAPP_KEYS.WHATSAPP_WEBHOOK_SEEN_AT) ?? null,
        hasMessages: (await db.whatsappMessage.count({ where: { organizationId } })) > 0,
        providers,
      }
    },
    {
      requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.SETTINGS }],
    }
  )
}

export interface SaveWhatsappSettingsInput {
  enabled: boolean
  provider: string
  from: string
  templateName?: string
  templateLanguage?: string
  /** Comma-separated tokens filling the template's placeholders, in order. */
  templateVariables?: string
  mediaTemplateName?: string
  mediaTemplateLanguage?: string
  mediaTemplateVariables?: string
  /** Only the fields the workshop actually typed; masked ones are ignored. */
  credentials: Record<string, string>
}

export async function saveWhatsappSettings(input: SaveWhatsappSettingsInput) {
  return withAuth(
    async ({ userId, organizationId }) => {
      demoGuard()
      await requireFeature(organizationId, 'whatsapp')

      const adapter = getWhatsappAdapter(input.provider)
      if (!adapter) throw new Error(`Unknown WhatsApp provider "${input.provider}".`)

      const entries: Record<string, string> = {
        [ORG_WHATSAPP_KEYS.WHATSAPP_ENABLED]: input.enabled ? 'true' : 'false',
        [ORG_WHATSAPP_KEYS.WHATSAPP_PROVIDER]: adapter.id,
        [ORG_WHATSAPP_KEYS.WHATSAPP_FROM]: input.from.trim(),
        [whatsappTemplateKey(adapter.id, 'text', 'name')]: input.templateName?.trim() ?? '',
        [whatsappTemplateKey(adapter.id, 'text', 'language')]: input.templateLanguage?.trim() ?? '',
        [whatsappTemplateKey(adapter.id, 'text', 'variables')]:
          input.templateVariables?.trim() ?? '',
        [whatsappTemplateKey(adapter.id, 'media', 'name')]: input.mediaTemplateName?.trim() ?? '',
        [whatsappTemplateKey(adapter.id, 'media', 'language')]:
          input.mediaTemplateLanguage?.trim() ?? '',
        [whatsappTemplateKey(adapter.id, 'media', 'variables')]:
          input.mediaTemplateVariables?.trim() ?? '',
      }

      // What is already stored, so an untouched field still counts as filled in.
      const storedRows = await db.appSetting.findMany({
        where: {
          organizationId,
          key: {
            in: adapter.credentials.map((field) => whatsappCredentialKey(adapter.id, field.key)),
          },
        },
        select: { key: true, value: true },
      })
      const stored = new Map(storedRows.map((row) => [row.key, row.value]))

      const effective: Record<string, string> = {}
      for (const field of adapter.credentials) {
        const key = whatsappCredentialKey(adapter.id, field.key)
        const typed = input.credentials[field.key]
        // An untouched secret comes back as its mask, which must never be
        // written over the real one.
        if (typed === undefined || typed === SECRET_MASK) {
          effective[field.key] = stored.get(key) ?? ''
          continue
        }
        entries[key] = typed.trim()
        effective[field.key] = typed.trim()
      }

      // Providers that sign nothing rely on the URL being unguessable, so the
      // token is ours to mint and it must survive a settings re-save.
      if (adapter.usesWebhookToken) {
        const key = whatsappCredentialKey(adapter.id, WHATSAPP_WEBHOOK_TOKEN_FIELD)
        const existing = await db.appSetting.findUnique({
          where: { organizationId_key: { organizationId, key } },
          select: { value: true },
        })
        if (!existing?.value) entries[key] = crypto.randomUUID().replace(/-/g, '')
      }

      // Catch a template that cannot possibly work before it fails mid-send,
      // where the provider's own wording is rarely more than "Invalid Parameter".
      for (const name of [input.templateName?.trim(), input.mediaTemplateName?.trim()]) {
        if (!name) continue
        const problem = adapter.template.validate?.(name)
        if (problem) throw new Error(problem)
      }

      // A token that fills nothing would reach WhatsApp as a literal word.
      const unknown = [
        ...unknownTemplateTokens(input.templateVariables),
        ...unknownTemplateTokens(input.mediaTemplateVariables),
      ]
      if (unknown.length > 0) {
        throw new Error(
          `Unknown template values: ${[...new Set(unknown)].join(', ')}. Use ${TEMPLATE_TOKENS.join(', ')}.`
        )
      }

      // Saved either way, and reported rather than refused. Meta hands out the
      // phone number ID only after the webhook has been verified, so a
      // workshop has to be able to store a verify token before it has the
      // rest. Sending stays unavailable until the setup is complete, which
      // getWhatsappConfig decides on its own.
      const missing = adapter.credentials
        .filter((field) => field.required)
        .filter((field) => !effective[field.key])
        .map((field) => field.label)
      if (!entries[ORG_WHATSAPP_KEYS.WHATSAPP_FROM]) missing.push('WhatsApp number')

      await armFeatureHints(db, organizationId, userId, entries)

      await db.$transaction(
        Object.entries(entries).map(([key, value]) =>
          db.appSetting.upsert({
            where: { organizationId_key: { organizationId, key } },
            update: { value },
            create: { userId, organizationId, key, value },
          })
        )
      )

      revalidatePath('/settings/whatsapp')
      revalidatePath('/whatsapp')

      const token = adapter.usesWebhookToken
        ? (entries[whatsappCredentialKey(adapter.id, WHATSAPP_WEBHOOK_TOKEN_FIELD)] ??
          (
            await db.appSetting.findUnique({
              where: {
                organizationId_key: {
                  organizationId,
                  key: whatsappCredentialKey(adapter.id, WHATSAPP_WEBHOOK_TOKEN_FIELD),
                },
              },
              select: { value: true },
            })
          )?.value)
        : undefined

      return {
        webhookUrl: webhookUrlFor(organizationId, adapter.id, token),
        /** Still needed before anything can be sent. */
        missing,
      }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.SETTINGS },
      ],
      audit: { action: 'settings.whatsappUpdated', message: 'Updated WhatsApp settings' },
    }
  )
}

/**
 * Forgets the whole setup, credentials included.
 *
 * Turning the toggle off would leave an access token in the database of a
 * workshop that has decided it no longer wants us holding one.
 */
export async function disconnectWhatsapp() {
  return withAuth(
    async ({ organizationId }) => {
      demoGuard()

      await db.appSetting.deleteMany({
        where: {
          organizationId,
          OR: [{ key: { in: ALL_ORG_WHATSAPP_KEYS } }, { key: { startsWith: 'whatsapp.cred.' } }],
        },
      })

      revalidatePath('/settings/whatsapp')
      revalidatePath('/whatsapp')
      return { disconnected: true }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.SETTINGS },
      ],
      audit: { action: 'settings.whatsappDisconnected', message: 'Disconnected WhatsApp' },
    }
  )
}

/**
 * Sends a message to the workshop's own number, which is the only way to find
 * out whether the credentials work before a customer is on the other end.
 */
export async function sendWhatsappTestMessage(to: string) {
  return withAuth(
    async ({ organizationId }) => {
      demoGuard()
      await requireFeature(organizationId, 'whatsapp')

      await sendOrgWhatsapp(organizationId, {
        to,
        body: 'Test message from your workshop. WhatsApp is connected.',
        relatedEntityType: 'settings',
        relatedEntityId: 'whatsapp-test',
      })
      return { sent: true }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.SETTINGS },
      ],
    }
  )
}
