/**
 * Which connection the AI features run on.
 *
 * The provider, key and model used to live in four `AppSetting` rows written
 * by a settings page of their own. They are an integration like any other, so
 * they moved into the catalog: the key is sealed on an `IntegrationConnection`
 * and the model is one of its settings. What must not change is that a
 * workshop which pasted a key months ago keeps generating descriptions
 * without touching anything. The first time AI is used, or the catalog is
 * opened, an old setup is adopted into a connection, sealed, and used from
 * then on. Nothing is asked of the workshop and nothing is deleted, so a
 * rollback still finds the old rows where it left them.
 */

import { db } from '@/lib/db'
import { AI_KEYS } from '@/features/ai/Schema/aiSettingsSchema'
import { openCredentials, sealCredentials } from './vault'

/** Connector ids that can answer a chat completion, most recently used first. */
export const AI_CONNECTOR_IDS = ['openai', 'anthropic'] as const
export type AiConnectorId = (typeof AI_CONNECTOR_IDS)[number]

export const AI_CHAT_CAPABILITY = 'ai.chat'

/**
 * Row that records the move having happened, so it happens once.
 *
 * Without it, disconnecting an adopted connection would be undone by the next
 * completion, which would read the old rows and adopt them all over again.
 * The row is one more setting the old code never read, so a rollback ignores
 * it.
 */
export const AI_ADOPTED_KEY = 'integrations.ai.adoptedAt'

export interface AiSetup {
  connectionId: string
  /** The connector id, which is also the provider name the client is built for. */
  provider: AiConnectorId
  apiKey: string
  model: string
}

function isAiConnector(id: string): id is AiConnectorId {
  return (AI_CONNECTOR_IDS as readonly string[]).includes(id)
}

function modelOf(settings: unknown): string {
  const model = (settings as Record<string, unknown> | null)?.model
  return typeof model === 'string' ? model.trim() : ''
}

/**
 * One AI vendor at a time, the way the old provider dropdown worked.
 * Connecting Anthropic stands OpenAI down rather than leaving the app to
 * guess which key a completion should go out through.
 */
export async function retireOtherAiProviders(
  organizationId: string,
  connectorId: string
): Promise<void> {
  if (!isAiConnector(connectorId)) return
  const siblings = AI_CONNECTOR_IDS.filter((id) => id !== connectorId)
  await db.integrationConnection.updateMany({
    where: { organizationId, connectorId: { in: [...siblings] }, status: 'active' },
    data: { status: 'disconnected', lastError: null },
  })
}

/** Record that the connections table decides AI from now on. */
export async function markAiAdopted(organizationId: string, userId: string): Promise<void> {
  await db.appSetting.upsert({
    where: { organizationId_key: { organizationId, key: AI_ADOPTED_KEY } },
    create: { organizationId, userId, key: AI_ADOPTED_KEY, value: new Date().toISOString() },
    update: {},
  })
}

export interface LegacyAiSetup {
  provider: AiConnectorId
  apiKey: string
  model: string
  userId: string | null
}

/**
 * The setup an organization had before the move, read without writing
 * anything.
 *
 * All four rows have to agree: switched on, a provider this app can talk to,
 * a key and a model. A setup abandoned half way is left alone rather than
 * adopted into a connection that cannot answer.
 */
export async function legacyAiSetup(
  organizationId: string
): Promise<{ setup: LegacyAiSetup | null; adopted: boolean }> {
  const rows = await db.appSetting.findMany({
    where: {
      organizationId,
      key: { in: [...Object.values(AI_KEYS), AI_ADOPTED_KEY] },
    },
    select: { key: true, value: true, userId: true },
  })
  const values = new Map(rows.map((r) => [r.key, r.value]))
  const adopted = values.has(AI_ADOPTED_KEY)

  if (values.get(AI_KEYS.AI_ENABLED) !== 'true') return { setup: null, adopted }
  const provider = values.get(AI_KEYS.AI_PROVIDER)?.trim() ?? ''
  const apiKey = values.get(AI_KEYS.AI_API_KEY)?.trim() ?? ''
  const model = values.get(AI_KEYS.AI_MODEL)?.trim() ?? ''
  if (!isAiConnector(provider) || !apiKey || !model) return { setup: null, adopted }

  return {
    setup: { provider, apiKey, model, userId: rows.find((r) => r.userId)?.userId ?? null },
    adopted,
  }
}

/** Prisma's code for a unique constraint the row already satisfies. */
function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002'
}

/**
 * Turn an old setup into a live connection. Runs once per organization: the
 * marker is written whether or not the row survives, and a vendor row the
 * workshop put there themselves is never written over.
 */
export async function adoptLegacyAi(organizationId: string): Promise<AiSetup | null> {
  const { setup, adopted } = await legacyAiSetup(organizationId)
  // Adopted once already: whatever happened to that connection since, such as
  // the workshop disconnecting it, is the current truth.
  if (adopted || !setup) return null

  // A row for this vendor that the workshop created themselves stays theirs,
  // even in error: the old rows are neither copied over it nor marked as
  // adopted.
  const existing = await db.integrationConnection.findUnique({
    where: {
      organizationId_connectorId: { organizationId, connectorId: setup.provider },
    },
    select: { id: true },
  })
  if (existing) return null

  let connection: { id: string; status: string }
  try {
    connection = await db.integrationConnection.create({
      data: {
        organizationId,
        connectorId: setup.provider,
        status: 'active',
        credentials: sealCredentials({ apiKey: setup.apiKey }),
        settings: { model: setup.model } as object,
        createdById: setup.userId ?? 'migration',
        label: 'Adopted from settings',
        // An adopted setup never went through a vendor's identify call; the
        // model it was pointed at is the nearest thing to an account name.
        externalAccountName: setup.model,
      },
      select: { id: true, status: true },
    })
  } catch (err) {
    // Two AI calls can land here at once on the first use after a deploy. The
    // loser of that race uses the winner's row.
    if (!isUniqueViolation(err)) throw err
    const winner = await db.integrationConnection.findUnique({
      where: {
        organizationId_connectorId: { organizationId, connectorId: setup.provider },
      },
      select: { id: true, status: true },
    })
    if (!winner) throw err
    connection = winner
  }

  if (setup.userId) await markAiAdopted(organizationId, setup.userId)
  if (connection.status !== 'active') return null

  await retireOtherAiProviders(organizationId, setup.provider)
  return {
    connectionId: connection.id,
    provider: setup.provider,
    apiKey: setup.apiKey,
    model: setup.model,
  }
}

/**
 * Last resort when a connection's credentials cannot be opened: the old rows
 * are still there, so AI keeps working from them while someone sorts the key
 * out. Logged every time, because it should never be quiet.
 */
async function unsealedFallback(
  organizationId: string,
  connectionId: string,
  err: unknown
): Promise<AiSetup | null> {
  console.error(
    `[integrations] cannot open credentials for AI connection ${connectionId} of organization ${organizationId}; ` +
      'check INTEGRATIONS_ENCRYPTION_KEY / BETTER_AUTH_SECRET (see scripts/rekey-integrations.ts). ' +
      'Falling back to the settings rows from before the move.',
    err
  )
  const { setup } = await legacyAiSetup(organizationId)
  if (!setup) return null
  return {
    connectionId,
    provider: setup.provider,
    apiKey: setup.apiKey,
    model: setup.model,
  }
}

/**
 * The connection AI runs on, adopting an old setup on first use.
 *
 * Returns null when the workshop has never set AI up, which is the caller's
 * cue to raise its own "not configured" message.
 */
export async function aiSetup(organizationId: string): Promise<AiSetup | null> {
  const rows = await db.integrationConnection.findMany({
    where: {
      organizationId,
      connectorId: { in: [...AI_CONNECTOR_IDS] },
      status: 'active',
    },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, connectorId: true, credentials: true, settings: true },
  })

  const row = rows[0]
  if (!row || !isAiConnector(row.connectorId)) return adoptLegacyAi(organizationId)

  let apiKey: string
  try {
    const credentials = openCredentials(row.credentials)
    apiKey = typeof credentials.apiKey === 'string' ? credentials.apiKey : ''
  } catch (err) {
    return unsealedFallback(organizationId, row.id, err)
  }

  const model = modelOf(row.settings)
  if (!apiKey || !model) return null

  return { connectionId: row.id, provider: row.connectorId, apiKey, model }
}

/**
 * Whether a completion would find a vendor, without adopting anything.
 *
 * Pages call this to decide whether to offer an AI button, and a page render
 * is no place to create a connection; the adoption happens on the first real
 * use, or when the catalog is opened.
 */
export async function isAiConfigured(organizationId: string): Promise<boolean> {
  const rows = await db.integrationConnection.findMany({
    where: {
      organizationId,
      connectorId: { in: [...AI_CONNECTOR_IDS] },
      status: 'active',
    },
    select: { settings: true },
  })
  if (rows.some((row) => modelOf(row.settings))) return true
  const { setup } = await legacyAiSetup(organizationId)
  return setup !== null
}
