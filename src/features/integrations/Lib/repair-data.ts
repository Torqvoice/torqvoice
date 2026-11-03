import { createHash } from 'node:crypto'
import { getTranslations } from 'next-intl/server'
import { connectorName } from '@/features/integrations/Lib/display-name'
import { getManifest } from '@/integrations/registry'
import { db } from '@/lib/db'
import { loadConnection } from './connections'
import { CHECK_PLAN_JOB } from './repair-data-contract'
import { type RepairDataPrefs, readPrefs } from './repair-prefs'
import {
  type ConnectorContext,
  type ConnectorManifest,
  type FluidSpec,
  type JobHandler,
  type LaborTime,
  type RepairDataAnswer,
  RepairDataKeyRejected,
  type RepairDataQuery,
  type RepairDataReply,
  type RepairDataVariant,
  type RepairDataVariantRef,
} from './types'

/**
 * Labor times and fluid capacities from whichever repair data source the
 * workshop has connected. Actions ask here rather than knowing about
 * connectors, so a second source is a new folder under src/integrations.
 *
 * Answers are kept at two levels:
 * - in memory for ten minutes, for every key, so reopening a work order or
 *   switching engine in the dialog never asks again;
 * - in the database for as long as the key's plan lets it keep what it
 *   fetched (Open Labor Project's paid plans), so a vehicle looked up once
 *   is not paid for again. Those rows are deleted as soon as a reply or the
 *   daily check says the plan is free again, when the key is refused, and
 *   with the connection when the workshop disconnects.
 *
 * Whose key fetched an answer decides who it serves. A workshop's own key
 * serves that workshop only. The key the server holds, for a service
 * Torqvoice pays for (CredentialField.serverKeyEnv), serves every workshop
 * that uses it, which is what keeps one shared key affordable.
 */

export { CHECK_PLAN_JOB }

export type RepairDataKind = 'labor' | 'fluids'

export const REPAIR_CAPABILITY: Record<RepairDataKind, string> = {
  labor: 'repair.labor',
  fluids: 'repair.fluids',
}

export type RepairDataItem<K extends RepairDataKind> = K extends 'labor' ? LaborTime : FluidSpec

/** Owner of the answers fetched with the key the server holds. */
export const PLATFORM_OWNER = 'platform'
/** Bumped when the stored shape or a mapping rule changes; older rows are fetched again. */
export const REPAIR_DATA_VERSION = 1
/**
 * A stored answer older than this is fetched again the next time the guide
 * opens on it, so values the source has since verified replace estimates.
 * When that fetch fails the stored answer is shown instead.
 */
export const REFRESH_AFTER_DAYS = 30
/** Lookups a day one workshop may make on the server's key, unless the environment says otherwise. */
const SERVER_KEY_DAILY_LOOKUPS = 40

/** The newest active connection that answers this kind of question. */
export async function findRepairDataConnection(
  organizationId: string,
  kind: RepairDataKind
): Promise<{ id: string; connectorId: string; settings: Record<string, unknown> } | null> {
  const rows = await db.integrationConnection.findMany({
    where: { organizationId, status: 'active' },
    select: { id: true, connectorId: true, settings: true },
    orderBy: { createdAt: 'desc' },
  })
  const pick = rows.find((r) =>
    getManifest(r.connectorId)?.capabilities.includes(REPAIR_CAPABILITY[kind])
  )
  if (!pick) return null
  return { ...pick, settings: (pick.settings as Record<string, unknown>) ?? {} }
}

/**
 * Whether a connection uses the key the server holds: its own key field is
 * empty and the server has one under the field's variable.
 */
export function usesServerKey(
  manifest: ConnectorManifest,
  credentials: Record<string, unknown>,
  env: Record<string, string | undefined> = process.env
): boolean {
  if (manifest.auth.type !== 'api-key') return false
  return manifest.auth.fields.some(
    (f) =>
      Boolean(f.serverKeyEnv && env[f.serverKeyEnv]?.trim()) &&
      !String(credentials[f.key] ?? '').trim()
  )
}

interface Account {
  /** The connection id, or PLATFORM_OWNER for the server's key. */
  owner: string
  /** Set for a workshop's own key, so its stored rows go with the connection. */
  connectionId: string | null
}

function accountOf(ctx: ConnectorContext, manifest: ConnectorManifest): Account {
  return usesServerKey(manifest, ctx.credentials)
    ? { owner: PLATFORM_OWNER, connectionId: null }
    : { owner: ctx.connection.id, connectionId: ctx.connection.id }
}

/** "ford|f-150|2018", as the workshop wrote them, so spacing and case never split a model. */
function modelKeyOf(q: Pick<RepairDataQuery, 'make' | 'model' | 'year'>): string {
  const squeeze = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase()
  return `${squeeze(q.make)}|${squeeze(q.model)}|${q.year}`
}

/** The VIN as a digest: a stored row says which vehicle it was for without holding the VIN. */
function vinKeyOf(vin: string | undefined): string | null {
  const v = vin?.trim().toUpperCase()
  if (!v) return null
  return `vin:${createHash('sha256').update(v).digest('hex')}`
}

// ---- memory, ten minutes, every key ----------------------------------------

const MEMORY_TTL_MS = 10 * 60_000
/**
 * A vehicle the source has nothing for is remembered longer: asking again
 * costs a call, and an unknown vehicle can take it half a minute to say no.
 */
const MEMORY_NONE_TTL_MS = 6 * 60 * 60_000
const MEMORY_MAX = 200
const memory = new Map<string, { answer: RepairDataAnswer<unknown> | null; expiresAt: number }>()

function memoryKey(owner: string, kind: RepairDataKind, q: RepairDataQuery): string {
  return [owner, kind, modelKeyOf(q), vinKeyOf(q.vin) ?? ''].join('|')
}

function fromMemory<K extends RepairDataKind>(key: string) {
  const hit = memory.get(key)
  if (!hit) return undefined
  if (hit.expiresAt <= Date.now()) {
    memory.delete(key)
    return undefined
  }
  return hit.answer as RepairDataAnswer<RepairDataItem<K>> | null
}

function remember(key: string, answer: RepairDataAnswer<unknown> | null) {
  if (memory.size >= MEMORY_MAX) {
    const oldest = memory.keys().next().value
    if (oldest !== undefined) memory.delete(oldest)
  }
  memory.set(key, {
    answer,
    expiresAt: Date.now() + (answer ? MEMORY_TTL_MS : MEMORY_NONE_TTL_MS),
  })
}

function forgetMemory(owner: string) {
  for (const key of memory.keys()) if (key.startsWith(`${owner}|`)) memory.delete(key)
}

/** For tests: start each case with nothing remembered. */
export function clearRepairDataCache() {
  memory.clear()
}

// ---- the database, while the plan allows it --------------------------------

interface Stored<T> {
  id: string
  answer: RepairDataAnswer<T>
  fetchedAt: Date
}

function isAnswer(value: unknown): value is RepairDataAnswer<unknown> {
  return (
    !!value &&
    typeof value === 'object' &&
    Array.isArray((value as RepairDataAnswer<unknown>).variants)
  )
}

async function readStored<K extends RepairDataKind>(
  source: string,
  owner: string,
  kind: K,
  q: RepairDataQuery
): Promise<Stored<RepairDataItem<K>> | null> {
  const modelKey = modelKeyOf(q)
  const vinKey = vinKeyOf(q.vin)
  const rows = await db.repairDataCache.findMany({
    where: {
      source,
      owner,
      kind,
      version: REPAIR_DATA_VERSION,
      lookupKey: { in: vinKey ? [modelKey, vinKey] : [modelKey] },
    },
    select: { id: true, lookupKey: true, data: true, fetchedAt: true },
  })
  // The model's answer serves every vehicle of it, so it wins over a VIN's.
  const row = rows.find((r) => r.lookupKey === modelKey) ?? rows[0]
  if (!row || !isAnswer(row.data)) return null
  return {
    id: row.id,
    answer: row.data as unknown as RepairDataAnswer<RepairDataItem<K>>,
    fetchedAt: row.fetchedAt,
  }
}

function isFresh(fetchedAt: Date, now = Date.now()): boolean {
  return now - fetchedAt.getTime() < REFRESH_AFTER_DAYS * 86_400_000
}

/**
 * What the reply means for stored answers: kept under the model, or under
 * the VIN when only the VIN found it, while the plan allows it; every one of
 * the owner's rows deleted once it does not.
 */
async function settleStored(
  source: string,
  account: Account,
  kind: RepairDataKind,
  q: RepairDataQuery,
  reply: RepairDataReply<unknown>
) {
  if (!reply.keep) {
    await forgetStored(source, account.owner)
    return
  }
  if (!reply.answer) return
  const vinKey = vinKeyOf(q.vin)
  const lookupKey = reply.answer.matchedBy === 'vin' && vinKey ? vinKey : modelKeyOf(q)
  const data = reply.answer as unknown as object
  await db.repairDataCache.upsert({
    where: { source_owner_kind_lookupKey: { source, owner: account.owner, kind, lookupKey } },
    create: {
      source,
      owner: account.owner,
      connectionId: account.connectionId,
      kind,
      lookupKey,
      version: REPAIR_DATA_VERSION,
      data,
    },
    update: { version: REPAIR_DATA_VERSION, data, fetchedAt: new Date() },
  })
}

/**
 * Every answer the owner's key stored. Memory stays: showing an answer for
 * ten minutes is allowed on every plan. Returns how many rows went.
 */
export async function forgetStored(source: string, owner: string): Promise<number> {
  const { count } = await db.repairDataCache.deleteMany({ where: { source, owner } })
  return count
}

/** A refused key: nothing it fetched is shown again, stored or remembered. */
async function forgetEverything(source: string, owner: string): Promise<number> {
  forgetMemory(owner)
  return forgetStored(source, owner)
}

/**
 * What a connector's connection test learned about the key, applied to the
 * answers it fetched: a refused key loses all of them, a key back on a free
 * plan loses the stored ones. The test runs when the workshop connects or
 * presses Test, which also covers a connection the daily check no longer
 * reaches because a refused key put it in error.
 */
export async function settleKeyCheck(
  ctx: ConnectorContext,
  manifest: ConnectorManifest,
  outcome: 'rejected' | 'free' | 'paid'
): Promise<void> {
  if (outcome === 'paid') return
  const { owner } = accountOf(ctx, manifest)
  if (outcome === 'rejected') await forgetEverything(manifest.id, owner)
  else await forgetStored(manifest.id, owner)
}

/**
 * The name the source already found this vehicle under, from the other
 * kind of data or from the same kind's list, so the next question uses it
 * instead of guessing again and does not fall back to the VIN.
 */
async function knownModelId(
  source: string,
  owner: string,
  kinds: RepairDataKind[],
  q: RepairDataQuery
): Promise<string | undefined> {
  for (const kind of kinds) {
    const remembered = fromMemory(memoryKey(owner, kind, q))
    if (remembered?.modelId) return remembered.modelId
  }
  for (const kind of kinds) {
    const stored = await readStored(source, owner, kind, q)
    if (stored?.answer.modelId) return stored.answer.modelId
  }
  return undefined
}

// ---- the server's key: a daily allowance per workshop ----------------------

function serverKeyAllowance(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.REPAIR_DATA_SERVER_KEY_DAILY_LOOKUPS)
  return Number.isInteger(n) && n > 0 ? n : SERVER_KEY_DAILY_LOOKUPS
}

/**
 * One lookup off the workshop's allowance on the server's key, counted in
 * the connection's state per UTC day. Only lookups that reach the source
 * count; an answer from memory or the database is free.
 */
async function spendServerKeyLookup(ctx: ConnectorContext) {
  const day = new Date().toISOString().slice(0, 10)
  const used = ctx.connection.state.serverKeyLookups as { day?: string; count?: number } | undefined
  const count = used?.day === day ? (used.count ?? 0) : 0
  if (count >= serverKeyAllowance()) {
    throw new Error("Today's labor guide lookups are used up. More are available tomorrow.")
  }
  await ctx.saveState({ serverKeyLookups: { day, count: count + 1 } })
}

// ---- asking ----------------------------------------------------------------

export interface RepairDataResult<K extends RepairDataKind> {
  answer: RepairDataAnswer<RepairDataItem<K>> | null
  /** The connector that answered, such as "openlaborproject", for the link to its settings. */
  connector: string
  /** Source name for the attribution line, such as "Open Labor Project". */
  source: string
  /** The source's logo under /public, for the dialog's header. */
  logo: string | null
  prefs: RepairDataPrefs
}

async function sourceName(connectorId: string): Promise<string> {
  const manifest = getManifest(connectorId)
  if (!manifest) return connectorId
  const ti = await getTranslations('integrations')
  return connectorName(ti, manifest)
}

function askerFor<K extends RepairDataKind>(
  server: { laborTimes?: unknown; fluidSpecs?: unknown },
  kind: K
) {
  const ask = (kind === 'labor' ? server.laborTimes : server.fluidSpecs) as
    | ((ctx: ConnectorContext, q: RepairDataQuery) => Promise<RepairDataReply<RepairDataItem<K>>>)
    | undefined
  if (!ask) throw new Error('This integration cannot look this up')
  return ask
}

/**
 * Everything the source lists for one model year: from memory, else from
 * the database while it is fresh, else from the source. A stale stored
 * answer is shown when the source cannot be reached to refresh it.
 */
export async function askRepairData<K extends RepairDataKind>(
  connectionId: string,
  kind: K,
  query: RepairDataQuery
): Promise<RepairDataResult<K>> {
  const { ctx, server } = await loadConnection(connectionId)
  const manifest = server.manifest
  const account = accountOf(ctx, manifest)
  const base = {
    connector: manifest.id,
    source: await sourceName(manifest.id),
    logo: getManifest(manifest.id)?.logo ?? null,
    prefs: readPrefs(ctx.connection.settings),
  }
  const memKey = memoryKey(account.owner, kind, query)
  const hit = fromMemory<K>(memKey)
  if (hit !== undefined) return { ...base, answer: hit }

  const stored = await readStored(manifest.id, account.owner, kind, query)
  if (stored && isFresh(stored.fetchedAt)) {
    remember(memKey, stored.answer)
    return { ...base, answer: stored.answer }
  }

  const ask = askerFor(server, kind)
  const other: RepairDataKind = kind === 'labor' ? 'fluids' : 'labor'
  const modelId =
    stored?.answer.modelId ?? (await knownModelId(manifest.id, account.owner, [other], query))
  try {
    if (account.owner === PLATFORM_OWNER) await spendServerKeyLookup(ctx)
    const reply = await ask(ctx, { ...query, modelId, variant: undefined, item: undefined })
    await settleStored(manifest.id, account, kind, query, reply)
    remember(memKey, reply.answer)
    return { ...base, answer: reply.answer }
  } catch (err) {
    if (err instanceof RepairDataKeyRejected) {
      await forgetEverything(manifest.id, account.owner)
      throw err
    }
    if (stored) {
      await ctx.log('warn', 'Showing a stored answer: the refresh failed', {
        kind,
        error: err instanceof Error ? err.message : String(err),
      })
      remember(memKey, stored.answer)
      return { ...base, answer: stored.answer }
    }
    throw err
  }
}

export function sameVariant(a: RepairDataVariantRef, b: RepairDataVariantRef): boolean {
  if (a.vehicleId && b.vehicleId) return a.vehicleId === b.vehicleId
  return a.engineId === b.engineId && (a.drivetrain ?? null) === (b.drivetrain ?? null)
}

function withItem<T extends { id: string }>(
  answer: RepairDataAnswer<T>,
  variant: RepairDataVariantRef,
  item: T
): boolean {
  const v = answer.variants.find((x) => sameVariant(x, variant))
  if (!v) return false
  v.items = v.items.map((i) => (i.id === item.id ? item : i))
  return true
}

/**
 * One job or fluid system on its own, for a key that lists everything but
 * unlocks values one at a time. The value is written into the remembered
 * answer, and into the stored one while the plan allows keeping it, so it is
 * still there when the dialog opens again.
 */
export async function askRepairDataItem<K extends RepairDataKind>(
  connectionId: string,
  kind: K,
  query: RepairDataQuery & { variant: RepairDataVariantRef; item: string }
): Promise<RepairDataItem<K> | null> {
  const { ctx, server } = await loadConnection(connectionId)
  const manifest = server.manifest
  const account = accountOf(ctx, manifest)
  const ask = askerFor(server, kind)
  const other: RepairDataKind = kind === 'labor' ? 'fluids' : 'labor'
  const modelId = await knownModelId(manifest.id, account.owner, [kind, other], query)
  let reply: RepairDataReply<RepairDataItem<K>>
  try {
    if (account.owner === PLATFORM_OWNER) await spendServerKeyLookup(ctx)
    reply = await ask(ctx, { ...query, modelId })
  } catch (err) {
    if (err instanceof RepairDataKeyRejected) await forgetEverything(manifest.id, account.owner)
    throw err
  }
  if (!reply.keep) await forgetStored(manifest.id, account.owner)
  const found =
    reply.answer?.variants.flatMap((v) => v.items).find((i) => i.id === query.item && !i.locked) ??
    null
  if (!found) return null

  const remembered = fromMemory<K>(memoryKey(account.owner, kind, query))
  if (remembered) withItem(remembered, query.variant, found)
  if (reply.keep) {
    const stored = await readStored(manifest.id, account.owner, kind, query)
    if (stored && withItem(stored.answer, query.variant, found)) {
      await db.repairDataCache.update({
        where: { id: stored.id },
        data: { data: stored.answer as unknown as object },
      })
    }
  }
  return found
}

// ---- the daily check -------------------------------------------------------

/**
 * The job each repair data connector schedules daily: while the workshop's
 * own key has answers stored, ask the source whether its plan still allows
 * keeping them, and delete them when it does not or the key is refused. A
 * connection with nothing stored, or on the server's key, spends no call:
 * Torqvoice's own subscription is checked by every lookup made with it.
 */
export function repairDataJobs(
  manifest: ConnectorManifest,
  plan: (ctx: ConnectorContext) => Promise<{ keep: boolean | null }>
): Record<string, JobHandler> {
  return {
    [CHECK_PLAN_JOB]: async (ctx) => {
      const account = accountOf(ctx, manifest)
      if (account.owner === PLATFORM_OWNER) return { summary: 'Uses the server key' }
      const count = await db.repairDataCache.count({
        where: { source: manifest.id, owner: account.owner },
      })
      if (count === 0) return { summary: 'Nothing stored' }
      let keep: boolean | null
      try {
        keep = (await plan(ctx)).keep
      } catch (err) {
        if (!(err instanceof RepairDataKeyRejected)) throw err
        const gone = await forgetEverything(manifest.id, account.owner)
        await ctx.log('warn', 'The key was refused, so the stored lookups were deleted', { gone })
        return { summary: `Key refused: ${gone} stored lookups deleted` }
      }
      if (keep === false) {
        const gone = await forgetStored(manifest.id, account.owner)
        await ctx.log('info', 'The plan no longer allows keeping lookups; deleted them', { gone })
        return { summary: `Plan is free now: ${gone} stored lookups deleted` }
      }
      return {
        summary: keep
          ? `${count} stored lookups kept`
          : 'The source did not say; checked again tomorrow',
      }
    },
  }
}

// ---- matching the vehicle --------------------------------------------------

/** Litres from what the vehicle form holds: "5.0 L", "2.7", "1998 cc". */
export function litresOf(engineSize: string | null | undefined): number | null {
  if (!engineSize) return null
  const m = /(\d+(?:[.,]\d+)?)/.exec(engineSize)
  if (!m) return null
  const n = Number(m[1].replace(',', '.'))
  if (!Number.isFinite(n) || n <= 0) return null
  return n >= 100 ? n / 1000 : n
}

/**
 * How well the engine the guide opens on fits the vehicle on file:
 * - engine: same displacement;
 * - fuel: same fuel, and the vehicle has no displacement to compare;
 * - none: the vehicle has an engine size or fuel on file and no listed
 *   engine has it, so the times may be for a different engine;
 * - unknown: the vehicle has neither on file.
 */
export type VariantMatch = 'engine' | 'fuel' | 'none' | 'unknown'

function fuelOf(engine: string): 'diesel' | 'electric' | 'hybrid' | 'gasoline' {
  const label = engine.toLowerCase()
  if (/diesel|tdi|power ?stroke|duramax|cummins|ecodiesel|crdi|hdi|dci/.test(label)) return 'diesel'
  if (/hybrid|phev/.test(label)) return 'hybrid'
  if (/electric|\bev\b|kwh/.test(label)) return 'electric'
  return 'gasoline'
}

/**
 * The variant most like the vehicle on file, and how well it fits: same
 * displacement first, then the same fuel. A tie keeps the source's order.
 */
export function matchVariant<T>(
  variants: RepairDataVariant<T>[],
  vehicle: { engineSize?: string | null; fuelType?: string | null }
): { index: number; match: VariantMatch } {
  const litres = litresOf(vehicle.engineSize)
  const raw = vehicle.fuelType?.trim().toLowerCase() ?? ''
  const fuel =
    raw === 'diesel' || raw === 'electric' || raw === 'hybrid' || raw === 'gasoline' ? raw : null
  let best = 0
  let bestScore = -1
  let bestSize = false
  let bestFuel = false
  variants.forEach((v, i) => {
    const own = litresOf(/(\d+(?:\.\d+)?)\s*l\b/i.exec(v.engine)?.[1] ?? null)
    const size = litres !== null && own !== null && Math.abs(own - litres) < 0.05
    const sameFuel = fuel !== null && fuelOf(v.engine) === fuel
    // Without a fuel on file a gasoline engine is the likelier one.
    const score =
      (size ? 4 : 0) + (sameFuel ? 2 : 0) + (!fuel && fuelOf(v.engine) === 'gasoline' ? 1 : 0)
    if (score > bestScore) {
      best = i
      bestScore = score
      bestSize = size
      bestFuel = sameFuel
    }
  })
  let match: VariantMatch
  if (litres === null && fuel === null) match = 'unknown'
  else if (bestSize && (fuel === null || bestFuel)) match = 'engine'
  else if (litres === null && bestFuel) match = 'fuel'
  else match = 'none'
  return { index: best, match }
}

/** The index alone, for callers that only need the pick. */
export function pickVariant<T>(
  variants: RepairDataVariant<T>[],
  vehicle: { engineSize?: string | null; fuelType?: string | null }
): number {
  return matchVariant(variants, vehicle).index
}
