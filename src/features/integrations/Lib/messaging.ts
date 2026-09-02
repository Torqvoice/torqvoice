/**
 * Which connection a channel sends through.
 *
 * SMS, WhatsApp, Telegram and email moved into the integrations catalog, so
 * their keys now live sealed on an `IntegrationConnection` like every other
 * vendor's. What must not change is that a workshop which set Twilio up years
 * ago keeps sending: the first time a channel is used after the move, an
 * existing setup in `AppSetting` is adopted into a connection, sealed, and
 * used from then on. Nothing is asked of the workshop and nothing is deleted,
 * so a rollback still finds the old rows where it left them.
 *
 * Callers get their values back under the old setting keys. That keeps the
 * change at the edge of the send paths rather than through them.
 */

import { createHash, randomBytes } from 'node:crypto'
import {
  type MessagingChannel,
  type MessagingProvider,
  legacyKeysForChannel,
  messagingProvider,
  providerForLegacyId,
  providersForChannel,
} from '@/integrations/messaging/catalog'
import { db } from '@/lib/db'
import { openCredentials, sealCredentials } from './vault'

export type { MessagingChannel }

/** Row that names the vendor a channel was pointed at before the move. */
const LEGACY_PROVIDER_KEY: Record<MessagingChannel, string | null> = {
  sms: 'sms.provider',
  whatsapp: 'whatsapp.provider',
  email: 'email.provider',
  telegram: null,
}

export interface ChannelSetup {
  connectionId: string
  connectorId: string
  provider: MessagingProvider
  credentials: Record<string, string>
  settings: Record<string, unknown>
}

function stringify(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return String(value)
}

/**
 * The channel's values under the keys the send paths already read, whichever
 * side of the move they came from.
 */
export function asLegacyMap(setup: ChannelSetup): Map<string, string> {
  const map = new Map<string, string>()
  for (const field of setup.provider.credentials) {
    if (!field.legacy) continue
    const value = setup.credentials[field.key]
    if (value) map.set(field.legacy, value)
  }
  for (const field of setup.provider.settings) {
    if (!field.legacy) continue
    const value = stringify(setup.settings[field.key])
    if (value) map.set(field.legacy, value)
  }
  const providerKey = LEGACY_PROVIDER_KEY[setup.provider.channel]
  if (providerKey && setup.provider.legacyProvider) {
    map.set(providerKey, setup.provider.legacyProvider)
  }
  return map
}

async function readLegacy(
  organizationId: string,
  channel: MessagingChannel
): Promise<{ values: Map<string, string>; userId: string | null }> {
  const keys = legacyKeysForChannel(channel)
  const providerKey = LEGACY_PROVIDER_KEY[channel]
  if (providerKey) keys.push(providerKey)

  const rows = await db.appSetting.findMany({
    where: { organizationId, key: { in: keys } },
    select: { key: true, value: true, userId: true },
  })
  return {
    values: new Map(rows.map((r) => [r.key, r.value])),
    userId: rows.find((r) => r.userId)?.userId ?? null,
  }
}

/**
 * The vendor an old setup was using.
 *
 * The `<channel>.provider` row decides it where there is one. Where the row
 * is missing or names something unknown, a vendor whose own evidence key is
 * filled in counts: a workshop that pasted a bot token never chose a Telegram
 * "provider", and an SMS setup abandoned halfway is better left alone than
 * adopted into a connection that cannot send.
 */
function legacyProviderFor(
  channel: MessagingChannel,
  values: Map<string, string>
): MessagingProvider | null {
  const providerKey = LEGACY_PROVIDER_KEY[channel]
  const named = providerKey ? values.get(providerKey) : null
  const chosen = providerForLegacyId(channel, named ?? null)
  if (chosen && values.get(chosen.legacyEvidence)?.trim()) return chosen
  if (named) return null
  return providersForChannel(channel).find((p) => values.get(p.legacyEvidence)?.trim()) ?? null
}

function splitLegacy(
  provider: MessagingProvider,
  values: Map<string, string>
): { credentials: Record<string, string>; settings: Record<string, unknown> } {
  const credentials: Record<string, string> = {}
  for (const field of provider.credentials) {
    const value = field.legacy ? values.get(field.legacy) : undefined
    if (value?.trim()) credentials[field.key] = value
  }
  const settings: Record<string, unknown> = {}
  for (const field of provider.settings) {
    const raw = field.legacy ? values.get(field.legacy) : undefined
    if (raw === undefined) continue
    settings[field.key] = field.type === 'boolean' ? raw === 'true' : raw
  }
  return { credentials, settings }
}

/**
 * Fingerprint of a webhook secret, kept unsealed alongside the connection.
 *
 * Vonage's inbound URL identifies the workshop by the secret in its query
 * string, which means looking an organization up from the secret alone.
 * Sealed credentials cannot be searched — every row has its own nonce — so
 * the lookup goes through this hash instead, and the secret itself stays
 * sealed.
 */
export const WEBHOOK_SECRET_HASH = 'webhookSecretHash'

export function webhookSecretHash(secret: string): string {
  return createHash('sha256').update(secret).digest('hex')
}

/** Secrets the workshop never types, minted once and kept for good. */
function withGeneratedSecrets(
  provider: MessagingProvider,
  credentials: Record<string, string>
): { credentials: Record<string, string>; added: boolean } {
  let added = false
  const next = { ...credentials }
  for (const field of provider.credentials) {
    if (!field.generated || next[field.key]?.trim()) continue
    next[field.key] = randomBytes(24).toString('hex')
    added = true
  }
  return { credentials: next, added }
}

/**
 * One vendor per channel stays in charge, the way the old provider dropdown
 * worked. Connecting a second SMS vendor retires the first rather than
 * leaving the app to guess which one a message should go out through.
 */
export async function retireOtherProviders(
  organizationId: string,
  connectorId: string
): Promise<void> {
  const provider = messagingProvider(connectorId)
  if (!provider) return
  const siblings = providersForChannel(provider.channel)
    .map((p) => p.id)
    .filter((id) => id !== connectorId)
  if (siblings.length === 0) return

  await db.integrationConnection.updateMany({
    where: { organizationId, connectorId: { in: siblings }, status: 'active' },
    data: { status: 'disconnected', lastError: null },
  })
}

async function adoptLegacySetup(
  organizationId: string,
  channel: MessagingChannel
): Promise<ChannelSetup | null> {
  const { values, userId } = await readLegacy(organizationId, channel)
  const provider = legacyProviderFor(channel, values)
  if (!provider) return null

  const split = splitLegacy(provider, values)
  const required = provider.credentials.filter((f) => f.required && !f.generated)
  if (required.some((f) => !split.credentials[f.key])) return null

  const { credentials } = withGeneratedSecrets(provider, split.credentials)
  if (credentials.webhookSecret) {
    split.settings[WEBHOOK_SECRET_HASH] = webhookSecretHash(credentials.webhookSecret)
  }

  // Two sends can land here at once on the first message after a deploy, so
  // the write is an upsert and the read that follows is the one that counts.
  const connection = await db.integrationConnection.upsert({
    where: { organizationId_connectorId: { organizationId, connectorId: provider.id } },
    create: {
      organizationId,
      connectorId: provider.id,
      status: 'active',
      credentials: sealCredentials(credentials),
      settings: split.settings as object,
      createdById: userId ?? 'migration',
      label: 'Adopted from settings',
    },
    update: {},
    select: { id: true, credentials: true, settings: true, status: true },
  })

  return {
    connectionId: connection.id,
    connectorId: provider.id,
    provider,
    credentials: openCredentials(connection.credentials) as Record<string, string>,
    settings: (connection.settings as Record<string, unknown>) ?? {},
  }
}

/**
 * The connection a channel sends through, adopting an old setup on first use.
 *
 * Returns null when the workshop has never configured the channel, which is
 * the caller's cue to raise its own "not configured" message.
 */
export async function channelSetup(
  organizationId: string,
  channel: MessagingChannel
): Promise<ChannelSetup | null> {
  const ids = providersForChannel(channel).map((p) => p.id)
  const rows = await db.integrationConnection.findMany({
    where: { organizationId, connectorId: { in: ids }, status: 'active' },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, connectorId: true, credentials: true, settings: true },
  })

  const row = rows[0]
  if (!row) return adoptLegacySetup(organizationId, channel)

  const provider = messagingProvider(row.connectorId)
  if (!provider) return null

  const stored = openCredentials(row.credentials) as Record<string, string>
  const { credentials, added } = withGeneratedSecrets(provider, stored)
  const settings = (row.settings as Record<string, unknown>) ?? {}
  const hash = credentials.webhookSecret ? webhookSecretHash(credentials.webhookSecret) : null
  const staleHash = hash !== null && settings[WEBHOOK_SECRET_HASH] !== hash

  if (added || staleHash) {
    if (hash) settings[WEBHOOK_SECRET_HASH] = hash
    await db.integrationConnection.update({
      where: { id: row.id },
      data: {
        ...(added ? { credentials: sealCredentials(credentials) } : {}),
        ...(staleHash ? { settings: settings as object } : {}),
      },
    })
  }

  return {
    connectionId: row.id,
    connectorId: row.connectorId,
    provider,
    credentials,
    settings,
  }
}

/**
 * A channel's configuration under the old setting keys.
 *
 * Send paths were written against a map of `AppSetting` rows, and this keeps
 * that shape so the move did not have to reach into every provider call.
 */
export async function channelSettings(
  organizationId: string,
  channel: MessagingChannel
): Promise<Map<string, string>> {
  const setup = await channelSetup(organizationId, channel)
  return setup ? asLegacyMap(setup) : new Map()
}

/** The vendor a channel is pointed at, in the old `<channel>.provider` wording. */
export async function channelProvider(
  organizationId: string,
  channel: MessagingChannel
): Promise<string | null> {
  const setup = await channelSetup(organizationId, channel)
  return setup?.provider.legacyProvider ?? (setup ? setup.connectorId : null)
}

/**
 * The workshop an inbound webhook belongs to, from the secret in its URL.
 *
 * Checks the connections first and the row the secret used to live in second,
 * so a URL a vendor was given years ago keeps resolving whether or not the
 * setup has been adopted yet.
 */
export async function organizationForWebhookSecret(
  channel: MessagingChannel,
  secret: string,
  legacyKey: string
): Promise<string | null> {
  if (!secret.trim()) return null

  const ids = providersForChannel(channel).map((p) => p.id)
  const connection = await db.integrationConnection.findFirst({
    where: {
      connectorId: { in: ids },
      status: 'active',
      settings: { path: [WEBHOOK_SECRET_HASH], equals: webhookSecretHash(secret) },
    },
    select: { organizationId: true },
  })
  if (connection) return connection.organizationId

  const row = await db.appSetting.findFirst({
    where: { key: legacyKey, value: secret },
    select: { organizationId: true },
  })
  return row?.organizationId ?? null
}
