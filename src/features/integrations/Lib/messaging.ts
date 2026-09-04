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
import type { PaymentWebhook } from './payments'
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
): Promise<{ values: Map<string, string>; userId: string | null; adopted: boolean }> {
  const keys = legacyKeysForChannel(channel)
  const providerKey = LEGACY_PROVIDER_KEY[channel]
  if (providerKey) keys.push(providerKey)
  keys.push(adoptedMarkerKey(channel))

  const rows = await db.appSetting.findMany({
    where: { organizationId, key: { in: keys } },
    select: { key: true, value: true, userId: true },
  })
  const values = new Map(rows.map((r) => [r.key, r.value]))
  return {
    values,
    userId: rows.find((r) => r.userId)?.userId ?? null,
    adopted: values.has(adoptedMarkerKey(channel)),
  }
}

/**
 * The vendor an old setup was using.
 *
 * The `<channel>.provider` row decides it, exactly as the old send paths did:
 * a workshop that pasted a Resend key and then switched back to the platform
 * default cleared that row, and it must not start sending through Resend now.
 * Telegram never had a provider row, so the bot token being set is the whole
 * signal there. Either way the vendor's own evidence key has to be filled in,
 * so an SMS setup abandoned halfway is left alone rather than adopted into a
 * connection that cannot send.
 */
function legacyProviderFor(
  channel: MessagingChannel,
  values: Map<string, string>
): MessagingProvider | null {
  const providerKey = LEGACY_PROVIDER_KEY[channel]
  const named = providerKey ? (values.get(providerKey) ?? null) : null
  if (providerKey && !named) return null
  const chosen = providerForLegacyId(channel, named)
  if (chosen && values.get(chosen.legacyEvidence)?.trim()) return chosen
  return null
}

/** Manifest defaults under what the workshop saved, the way the settings form shows them. */
function withDefaults(
  provider: MessagingProvider,
  saved: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const field of provider.settings) {
    if (field.default !== undefined) out[field.key] = field.default
  }
  return { ...out, ...saved }
}

/** What a channel sends as: a from address, a number or a bot name. */
function sendingIdentity(settings: Record<string, unknown>): string | undefined {
  for (const key of ['fromEmail', 'phoneNumber', 'botUsername']) {
    const value = settings[key]
    if (typeof value === 'string' && value.trim()) {
      return key === 'botUsername' ? `@${value.trim()}` : value.trim()
    }
  }
  return undefined
}

/**
 * Row that records a channel having been adopted, so it happens once.
 *
 * Without it, disconnecting an adopted vendor would be undone by the next
 * send, which would read the old rows and adopt them all over again. The row
 * is one more setting the old code never reads, so a rollback ignores it.
 */
export function adoptedMarkerKey(channel: MessagingChannel): string {
  return `integrations.${channel}.adoptedAt`
}

/**
 * Record that the channel's truth is the connections table from now on.
 *
 * Written when an old setup is adopted, and also when a workshop connects a
 * vendor through the catalog: either way, a later disconnect must stick
 * rather than be undone by the old rows on the next send.
 */
export async function markChannelAdopted(
  organizationId: string,
  channel: MessagingChannel,
  userId: string
): Promise<void> {
  const key = adoptedMarkerKey(channel)
  await db.appSetting.upsert({
    where: { organizationId_key: { organizationId, key } },
    create: { organizationId, userId, key, value: new Date().toISOString() },
    update: {},
  })
}

function splitLegacy(
  provider: MessagingProvider,
  values: Map<string, string>
): { credentials: Record<string, string>; settings: Record<string, unknown> } {
  const credentials: Record<string, string> = {}
  for (const field of provider.credentials) {
    const value = field.legacy ? values.get(field.legacy) : undefined
    // A row the old form never wrote, such as an SMTP port, takes the value
    // the old send path assumed for it.
    if (value?.trim()) credentials[field.key] = value
    else if (field.default) credentials[field.key] = field.default
  }
  const settings: Record<string, unknown> = {}
  for (const field of provider.settings) {
    const raw = field.legacy ? values.get(field.legacy) : undefined
    if (raw === undefined) continue
    // An empty boolean row is no answer; the catalog default applies, the
    // way the old send path treated a missing row.
    if (field.type === 'boolean' && raw === '') continue
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

export interface LegacySetup {
  provider: MessagingProvider
  credentials: Record<string, string>
  settings: Record<string, unknown>
  userId: string | null
}

/**
 * The setup an organization had before the move, read without writing
 * anything: the vendor its provider row names, the keys under that vendor's
 * rows, and nothing if the setup was never finished.
 */
export async function legacySetupFor(
  organizationId: string,
  channel: MessagingChannel
): Promise<{ setup: LegacySetup | null; adopted: boolean }> {
  const { values, userId, adopted } = await readLegacy(organizationId, channel)
  const provider = legacyProviderFor(channel, values)
  if (!provider) return { setup: null, adopted }

  const split = splitLegacy(provider, values)
  const required = provider.credentials.filter((f) => f.required && !f.generated)
  if (required.some((f) => !split.credentials[f.key])) return { setup: null, adopted }

  return { setup: { provider, ...split, userId }, adopted }
}

/**
 * Whether the old rows name a vendor for the channel, adopted or not. Lets a
 * send path fail the way it used to ("Mailgun is not configured") instead of
 * quietly doing something else when a named vendor's setup is incomplete.
 */
export async function legacyProviderNamed(
  organizationId: string,
  channel: MessagingChannel
): Promise<string | null> {
  const key = LEGACY_PROVIDER_KEY[channel]
  if (!key) return null
  const row = await db.appSetting.findUnique({
    where: { organizationId_key: { organizationId, key } },
    select: { value: true },
  })
  const named = row?.value?.trim()
  return named && providerForLegacyId(channel, named) ? named : null
}

/** Prisma's code for a unique constraint the row already satisfies. */
function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002'
}

async function adoptLegacySetup(
  organizationId: string,
  channel: MessagingChannel
): Promise<ChannelSetup | null> {
  const { setup, adopted } = await legacySetupFor(organizationId, channel)
  // Adopted once already: whatever happened to that connection since, such as
  // the workshop disconnecting it, is the current truth.
  if (adopted || !setup) return null
  const { provider, userId } = setup

  // A row for this vendor that is not active was put there by the workshop,
  // for instance keys that failed their check. It stays theirs to fix; the
  // old rows are neither copied over it nor marked as adopted.
  const existing = await db.integrationConnection.findUnique({
    where: { organizationId_connectorId: { organizationId, connectorId: provider.id } },
    select: { id: true },
  })
  if (existing) return null

  const { credentials } = withGeneratedSecrets(provider, setup.credentials)
  const settings = { ...setup.settings }
  if (credentials.webhookSecret) {
    settings[WEBHOOK_SECRET_HASH] = webhookSecretHash(credentials.webhookSecret)
  }

  // Two sends can land here at once on the first message after a deploy. The
  // loser of that race finds the winner's row and uses it.
  let connection: { id: string; credentials: string | null; settings: unknown; status: string }
  try {
    connection = await db.integrationConnection.create({
      data: {
        organizationId,
        connectorId: provider.id,
        status: 'active',
        credentials: sealCredentials(credentials),
        settings: settings as object,
        createdById: userId ?? 'migration',
        label: 'Adopted from settings',
        // The connection page shows this as the connected account. An adopted
        // setup never went through the vendor's identify call, so the address
        // or number it sends from is the nearest thing to a name.
        externalAccountName: sendingIdentity(settings) ?? null,
      },
      select: { id: true, credentials: true, settings: true, status: true },
    })
  } catch (err) {
    if (!isUniqueViolation(err)) throw err
    const winner = await db.integrationConnection.findUnique({
      where: { organizationId_connectorId: { organizationId, connectorId: provider.id } },
      select: { id: true, credentials: true, settings: true, status: true },
    })
    if (!winner) throw err
    connection = winner
  }

  // Every old row carries the user who wrote it, so there is always one to
  // own the marker.
  if (userId) await markChannelAdopted(organizationId, channel, userId)

  if (connection.status !== 'active') return null

  return {
    connectionId: connection.id,
    connectorId: provider.id,
    provider,
    credentials: openCredentials(connection.credentials) as Record<string, string>,
    settings: withDefaults(provider, (connection.settings as Record<string, unknown>) ?? {}),
  }
}

/**
 * Last resort when a connection's credentials cannot be opened: the old rows
 * are still there, so the channel keeps working from them while someone
 * sorts the key out. Logged every time, because it should never be quiet.
 */
async function unsealedFallback(
  organizationId: string,
  channel: MessagingChannel,
  connectionId: string,
  err: unknown
): Promise<ChannelSetup | null> {
  console.error(
    `[integrations] cannot open credentials for ${channel} connection ${connectionId} of organization ${organizationId}; ` +
      'check INTEGRATIONS_ENCRYPTION_KEY / BETTER_AUTH_SECRET (see scripts/rekey-integrations.ts). ' +
      'Falling back to the settings rows from before the move.',
    err
  )
  const { setup } = await legacySetupFor(organizationId, channel)
  if (!setup) return null
  return {
    connectionId,
    connectorId: setup.provider.id,
    provider: setup.provider,
    credentials: setup.credentials,
    settings: withDefaults(setup.provider, setup.settings),
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

  let stored: Record<string, string>
  try {
    stored = openCredentials(row.credentials) as Record<string, string>
  } catch (err) {
    return unsealedFallback(organizationId, channel, row.id, err)
  }
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
    settings: withDefaults(provider, settings),
  }
}

/**
 * Whether a channel is switched on, for the screens that offer it.
 *
 * WhatsApp and Telegram keep the on/off switch their old pages had, so a
 * workshop can leave its keys in place and still take a channel off the
 * customer page for a while. A channel with no connection is off.
 */
export async function channelEnabled(
  organizationId: string,
  channel: MessagingChannel
): Promise<boolean> {
  const setup = await channelSetup(organizationId, channel)
  if (!setup) return false
  return setup.settings.enabled !== false
}

/**
 * Credentials the way a messaging connection stores them: the typed keys plus
 * the secrets the platform mints, and the fingerprint the inbound webhook
 * routes look a workshop up by. Called when keys are saved from the form, so
 * a vendor connected today gets the same shape as one adopted from old rows.
 */
export function completeMessagingCredentials(
  connectorId: string,
  credentials: Record<string, unknown>
): { credentials: Record<string, unknown>; settings: Record<string, unknown> } {
  const provider = messagingProvider(connectorId)
  if (!provider) return { credentials, settings: {} }
  const typed = credentials as Record<string, string>
  const next = withGeneratedSecrets(provider, typed).credentials
  const settings: Record<string, unknown> = {}
  if (next.webhookSecret) settings[WEBHOOK_SECRET_HASH] = webhookSecretHash(next.webhookSecret)
  return { credentials: { ...credentials, ...next }, settings }
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
  if (!row?.organizationId) return null

  // The old row only answers for a workshop that is still on the old side of
  // the move. Once the channel has been adopted or connected through the
  // catalog, the connections decide, and a vendor that was disconnected or
  // retired must not keep delivering through the URL it was given years ago.
  const [marker, any] = await Promise.all([
    db.appSetting.findUnique({
      where: {
        organizationId_key: {
          organizationId: row.organizationId,
          key: adoptedMarkerKey(channel),
        },
      },
      select: { id: true },
    }),
    db.integrationConnection.findFirst({
      where: { organizationId: row.organizationId, connectorId: { in: ids } },
      select: { id: true },
    }),
  ])
  if (marker || any) return null
  return row.organizationId
}

export interface InboundWebhook {
  url: string
  /** What the vendor also needs beside the URL, as an i18n key under connection. */
  note: 'inboundHintSecret' | 'inboundHintMeta' | PaymentWebhook['note']
}

/**
 * The URL a vendor must call for inbound messages on this connection.
 *
 * SMS vendors and WhatsApp via Twilio identify the workshop by the secret in
 * the URL, which is why it is built from the sealed credentials here rather
 * than typed anywhere. Meta signs its calls and verifies the URL with the
 * verify token the workshop chose. Telegram registers its own URL on connect,
 * so it has nothing to show.
 */
export function inboundWebhook(
  connectorId: string,
  organizationId: string,
  credentials: Record<string, unknown>,
  appUrl: string
): InboundWebhook | null {
  const provider = messagingProvider(connectorId)
  if (!provider || !appUrl) return null
  const base = appUrl.replace(/\/$/, '')
  const secret = typeof credentials.webhookSecret === 'string' ? credentials.webhookSecret : ''
  const token = typeof credentials.webhookToken === 'string' ? credentials.webhookToken : ''

  if (provider.channel === 'sms') {
    if (!secret || !provider.legacyProvider) return null
    return {
      url: `${base}/api/webhooks/sms/${provider.legacyProvider}?org_secret=${secret}`,
      note: 'inboundHintSecret',
    }
  }
  if (provider.id === 'whatsapp-twilio') {
    if (!token) return null
    return {
      url: `${base}/api/webhooks/whatsapp/twilio/${organizationId}?token=${token}`,
      note: 'inboundHintSecret',
    }
  }
  if (provider.id === 'whatsapp-meta') {
    return { url: `${base}/api/webhooks/whatsapp/meta/${organizationId}`, note: 'inboundHintMeta' }
  }
  return null
}
