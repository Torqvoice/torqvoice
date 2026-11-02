import { getTranslations } from 'next-intl/server'
import { connectorName } from '@/features/integrations/Lib/display-name'
import { getManifest } from '@/integrations/registry'
import { db } from '@/lib/db'
import { loadConnection } from './connections'
import type {
  FluidSpec,
  LaborTime,
  RepairDataAnswer,
  RepairDataQuery,
  RepairDataVariant,
  RepairDataVariantRef,
} from './types'

/**
 * Labor times and fluid capacities from whichever repair data source the
 * workshop has connected. Actions ask here rather than knowing about
 * connectors, so a second source is a new folder under src/integrations.
 */

export type RepairDataKind = 'labor' | 'fluids'

export const REPAIR_CAPABILITY: Record<RepairDataKind, string> = {
  labor: 'repair.labor',
  fluids: 'repair.fluids',
}

export type RepairDataItem<K extends RepairDataKind> = K extends 'labor' ? LaborTime : FluidSpec

/** The newest active connection that answers this kind of question. */
export async function findRepairDataConnection(
  organizationId: string,
  kind: RepairDataKind
): Promise<{ id: string; connectorId: string } | null> {
  const rows = await db.integrationConnection.findMany({
    where: { organizationId, status: 'active' },
    select: { id: true, connectorId: true },
    orderBy: { createdAt: 'desc' },
  })
  const pick = rows.find((r) =>
    getManifest(r.connectorId)?.capabilities.includes(REPAIR_CAPABILITY[kind])
  )
  return pick ?? null
}

/**
 * Whole-model answers, kept for a few minutes so that opening the same work
 * order again, or switching engine in the dialog, does not spend another of
 * the workshop's calls. In memory only: the source asks not to be stored,
 * and the key and its quota belong to that one workshop.
 */
const CACHE_TTL_MS = 10 * 60_000
const CACHE_MAX = 200
const cache = new Map<string, { answer: RepairDataAnswer<unknown> | null; expiresAt: number }>()

function cacheKey(connectionId: string, kind: RepairDataKind, q: RepairDataQuery): string {
  return [
    connectionId,
    kind,
    q.make.toLowerCase(),
    q.model.toLowerCase(),
    q.year,
    q.vin?.toUpperCase() ?? '',
  ].join('|')
}

function cached<K extends RepairDataKind>(key: string) {
  const hit = cache.get(key)
  if (!hit) return undefined
  if (hit.expiresAt <= Date.now()) {
    cache.delete(key)
    return undefined
  }
  return hit.answer as RepairDataAnswer<RepairDataItem<K>> | null
}

function remember(key: string, answer: RepairDataAnswer<unknown> | null) {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
  cache.set(key, { answer, expiresAt: Date.now() + CACHE_TTL_MS })
}

/** For tests: start each case with nothing remembered. */
export function clearRepairDataCache() {
  cache.clear()
}

export function sameVariant(a: RepairDataVariantRef, b: RepairDataVariantRef): boolean {
  if (a.vehicleId && b.vehicleId) return a.vehicleId === b.vehicleId
  return a.engineId === b.engineId && (a.drivetrain ?? null) === (b.drivetrain ?? null)
}

export interface RepairDataResult<K extends RepairDataKind> {
  answer: RepairDataAnswer<RepairDataItem<K>> | null
  /** Source name for the attribution line, such as "Open Labor Project". */
  source: string
}

async function sourceName(connectorId: string): Promise<string> {
  const manifest = getManifest(connectorId)
  if (!manifest) return connectorId
  const ti = await getTranslations('integrations')
  return connectorName(ti, manifest)
}

/** Everything the source lists for one model year, from the cache when it is fresh. */
export async function askRepairData<K extends RepairDataKind>(
  connectionId: string,
  kind: K,
  query: RepairDataQuery
): Promise<RepairDataResult<K>> {
  const key = cacheKey(connectionId, kind, query)
  const hit = cached<K>(key)
  const { ctx, server } = await loadConnection(connectionId)
  const source = await sourceName(server.manifest.id)
  if (hit !== undefined) return { answer: hit, source }
  const ask = kind === 'labor' ? server.laborTimes : server.fluidSpecs
  if (!ask) throw new Error('This integration cannot look this up')
  const answer = (await ask(ctx, {
    ...query,
    variant: undefined,
    item: undefined,
  })) as RepairDataAnswer<RepairDataItem<K>> | null
  remember(key, answer)
  return { answer, source }
}

/**
 * One job or fluid system on its own, for a key that lists everything but
 * unlocks values one at a time. The value is also written into the
 * remembered answer, so it is still there when the dialog opens again.
 */
export async function askRepairDataItem<K extends RepairDataKind>(
  connectionId: string,
  kind: K,
  query: RepairDataQuery & { variant: RepairDataVariantRef; item: string }
): Promise<RepairDataItem<K> | null> {
  const { ctx, server } = await loadConnection(connectionId)
  const ask = kind === 'labor' ? server.laborTimes : server.fluidSpecs
  if (!ask) throw new Error('This integration cannot look this up')
  const answer = (await ask(ctx, query)) as RepairDataAnswer<RepairDataItem<K>> | null
  const found =
    answer?.variants.flatMap((v) => v.items).find((i) => i.id === query.item && !i.locked) ?? null
  if (!found) return null

  const key = cacheKey(connectionId, kind, query)
  const whole = cached<K>(key)
  const variant = whole?.variants.find((v) => sameVariant(v, query.variant))
  if (whole && variant) {
    variant.items = variant.items.map((i) => (i.id === found.id ? found : i))
  }
  return found
}

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
 * The variant most like the vehicle on file: same displacement first, then
 * the same fuel. A tie keeps the source's own order. Pure, for the test.
 */
export function pickVariant<T>(
  variants: RepairDataVariant<T>[],
  vehicle: { engineSize?: string | null; fuelType?: string | null }
): number {
  const litres = litresOf(vehicle.engineSize)
  const fuel = vehicle.fuelType?.toLowerCase() ?? ''
  let best = 0
  let bestScore = -1
  variants.forEach((v, i) => {
    const label = v.engine.toLowerCase()
    let score = 0
    const own = litresOf(/(\d+(?:\.\d+)?)\s*l\b/i.exec(v.engine)?.[1] ?? null)
    if (litres !== null && own !== null && Math.abs(own - litres) < 0.05) score += 4
    const diesel = /diesel|tdi|power ?stroke|duramax|cummins/.test(label)
    const electric = /electric|\bev\b|kwh/.test(label)
    const hybrid = /hybrid/.test(label)
    if (fuel === 'diesel' && diesel) score += 2
    if (fuel === 'electric' && electric) score += 2
    if (fuel === 'hybrid' && hybrid) score += 2
    if ((fuel === 'gasoline' || fuel === '') && !diesel && !electric) score += 1
    if (score > bestScore) {
      best = i
      bestScore = score
    }
  })
  return best
}
