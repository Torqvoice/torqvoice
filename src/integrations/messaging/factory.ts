/**
 * Turns a messaging catalog entry into a connector.
 *
 * Every messaging vendor has the same shape: keys pasted into a form, a
 * from-address or number, and a cheap call that proves the keys work. Only
 * that last call differs, so it is the only thing a vendor's folder writes.
 *
 * Generated credentials, such as the webhook secret behind an inbound SMS
 * URL, are deliberately left out of the form: the workshop never types them,
 * and dropping them from the manifest keeps them out of the browser.
 */

import type {
  ConnectorContext,
  ConnectorManifest,
  ConnectorServer,
  CredentialField,
  SettingField,
} from '@/features/integrations/Lib/types'
import { type MessagingProvider, messagingProvider } from './catalog'

export type MessagingVerify = (input: {
  credentials: Record<string, string>
  settings: Record<string, unknown>
}) => Promise<{ ok: boolean; message?: string }>

export type MessagingIdentify = (input: {
  credentials: Record<string, string>
  settings: Record<string, unknown>
}) => Promise<{ id: string; name: string }>

function credentialField(field: MessagingProvider['credentials'][number]): CredentialField {
  const { legacy: _legacy, generated: _generated, ...rest } = field
  return rest
}

function settingField(field: MessagingProvider['settings'][number]): SettingField {
  const { legacy: _legacy, ...rest } = field
  return rest
}

/** The plan feature each channel was gated on before it became a connector. */
const CHANNEL_PLAN: Record<MessagingProvider['channel'], NonNullable<ConnectorManifest['plan']>> = {
  sms: 'sms',
  whatsapp: 'whatsapp',
  telegram: 'telegram',
  email: 'smtp',
}

export function messagingManifest(provider: MessagingProvider): ConnectorManifest {
  return {
    id: provider.id,
    name: provider.name,
    category: 'messaging',
    plan: CHANNEL_PLAN[provider.channel],
    countries: provider.countries,
    logo: `/images/integrations/${provider.id}.svg`,
    docs: `/docs/integrations/${provider.id}`,
    auth: {
      type: 'api-key',
      fields: provider.credentials.filter((c) => !c.generated).map(credentialField),
    },
    capabilities: provider.capabilities,
    settings: provider.settings.map(settingField),
  }
}

/** Manifest for one catalog id. Missing means the id and the table disagree. */
export function messagingManifestFor(id: string): ConnectorManifest {
  const provider = messagingProvider(id)
  if (!provider) throw new Error(`No messaging provider named ${id}`)
  return messagingManifest(provider)
}

export type MessagingSendTest = (
  input: {
    connectorId: string
    organizationId: string
    credentials: Record<string, string>
    settings: Record<string, unknown>
  },
  to: { email: string }
) => Promise<void>

export interface MessagingHooks {
  /** Who the account is, shown as "Connected account" on the connection page. */
  identify?: MessagingIdentify
  /** A real message to the signed-in user, where a key check proves too little. */
  sendTest?: MessagingSendTest
}

export function messagingConnector(
  manifest: ConnectorManifest,
  verify: MessagingVerify,
  hooks: MessagingHooks = {}
): ConnectorServer {
  function input(ctx: ConnectorContext) {
    return {
      credentials: ctx.credentials as Record<string, string>,
      settings: ctx.connection.settings,
    }
  }
  const { identify, sendTest } = hooks

  return {
    manifest,
    // Messaging is driven by the app sending a message, not by a timer or a
    // subscription, so a messaging connector has no jobs of its own.
    jobs: {},
    test: (ctx) => verify(input(ctx)),
    ...(identify ? { identify: (ctx: ConnectorContext) => identify(input(ctx)) } : {}),
    ...(sendTest
      ? {
          sendTest: (ctx: ConnectorContext, to: { email: string }) =>
            sendTest(
              {
                connectorId: ctx.connection.connectorId,
                organizationId: ctx.connection.organizationId,
                ...input(ctx),
              },
              to
            ),
        }
      : {}),
  }
}

/** Shared by the vendors that answer a plain authenticated GET. */
export async function verifyByGet(
  url: string,
  headers: Record<string, string>,
  vendor: string
): Promise<{ ok: boolean; message?: string }> {
  try {
    const res = await fetch(url, { headers })
    if (res.ok) return { ok: true }
    const body = await res.text()
    return {
      ok: false,
      message: `${vendor} rejected the credentials (${res.status}): ${body.slice(0, 200)}`,
    }
  } catch (err) {
    return { ok: false, message: `Could not reach ${vendor}: ${(err as Error).message}` }
  }
}

/** Every field the vendor cannot work without is present. */
export function requireFields(
  credentials: Record<string, string>,
  keys: string[],
  vendor: string
): { ok: boolean; message?: string } | null {
  const missing = keys.filter((k) => !credentials[k]?.trim())
  if (missing.length === 0) return null
  return { ok: false, message: `${vendor} needs ${missing.join(', ')}.` }
}
