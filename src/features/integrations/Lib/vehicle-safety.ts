import { db } from '@/lib/db'
import { getManifest } from '@/integrations/registry'
import { loadConnection } from './connections'
import type { ConnectorContext, JobOutcome, VehicleSafetyReport } from './types'

/**
 * Recalls, owner complaints and crash ratings for the vehicles a workshop
 * looks after, from whichever safety authority it has connected.
 *
 * The data is about a model year, not a car: every 2003 Accord in every
 * workshop shares one report. So reports are cached by model, refreshed
 * weekly, and a vehicle page reads the cache rather than the authority.
 * Connectors declare the capability and answer `vehicleSafety`; nothing in
 * a connector touches the cache.
 */

import {
  SAFETY_CAPABILITY,
  SAFETY_JOB,
  SAFETY_MANIFEST,
  SAFETY_SETTING,
} from './vehicle-safety-contract'

export { SAFETY_CAPABILITY, SAFETY_JOB, SAFETY_MANIFEST, SAFETY_SETTING }

/** A report older than this is fetched again when a page asks for it. */
export const REPORT_TTL_DAYS = 7
/** How many models the weekly pass refreshes per run before rescheduling. */
const FLEET_BATCH = 40

/** Keys as the cache stores them: what the workshop typed, upper-cased and squeezed. */
export function modelKey(input: { make: string; model: string; year: number }) {
  const squeeze = (s: string) => s.trim().replace(/\s+/g, ' ').toUpperCase()
  return { make: squeeze(input.make), model: squeeze(input.model), year: input.year }
}

export async function findSafetyConnection(
  organizationId: string
): Promise<{ id: string; connectorId: string } | null> {
  const rows = await db.integrationConnection.findMany({
    where: { organizationId, status: 'active' },
    select: { id: true, connectorId: true },
  })
  return (
    rows.find((r) => getManifest(r.connectorId)?.capabilities.includes(SAFETY_CAPABILITY)) ?? null
  )
}

export interface CachedSafetyReport {
  report: VehicleSafetyReport
  found: boolean
  fetchedAt: Date
  stale: boolean
}

function isStale(fetchedAt: Date, now = new Date()): boolean {
  return now.getTime() - fetchedAt.getTime() > REPORT_TTL_DAYS * 86_400_000
}

async function readCache(
  source: string,
  key: ReturnType<typeof modelKey>
): Promise<CachedSafetyReport | null> {
  const row = await db.vehicleSafetyReport.findUnique({
    where: { source_make_model_year: { source, ...key } },
  })
  if (!row) return null
  return {
    report: row.data as unknown as VehicleSafetyReport,
    found: row.found,
    fetchedAt: row.fetchedAt,
    stale: isStale(row.fetchedAt),
  }
}

async function writeCache(
  source: string,
  key: ReturnType<typeof modelKey>,
  report: VehicleSafetyReport
): Promise<CachedSafetyReport> {
  const data = JSON.parse(JSON.stringify(report)) as object
  const shared = {
    found: report.matched !== null,
    data,
    recallCount: report.recalls.length,
    complaintCount: report.complaints.total,
    fetchedAt: new Date(),
  }
  const row = await db.vehicleSafetyReport.upsert({
    where: { source_make_model_year: { source, ...key } },
    create: { source, ...key, ...shared },
    update: shared,
  })
  return { report, found: row.found, fetchedAt: row.fetchedAt, stale: false }
}

/**
 * Ask the connector and remember the answer. A failure with a report already
 * cached returns the old one marked stale, so a page keeps showing what it
 * had while the authority is down.
 */
async function fetchAndCache(
  connectionId: string,
  key: ReturnType<typeof modelKey>,
  query: { make: string; model: string; year: number; vin?: string }
): Promise<CachedSafetyReport> {
  const { ctx, server } = await loadConnection(connectionId)
  if (!server.vehicleSafety) throw new Error('This integration has no safety data')
  const source = server.manifest.id
  try {
    const report = await server.vehicleSafety(ctx, query)
    return await writeCache(source, key, report)
  } catch (err) {
    const cached = await readCache(source, key)
    if (cached) {
      await ctx.log(
        'warn',
        `Safety refresh failed, kept the report from ${cached.fetchedAt.toISOString().slice(0, 10)}: ${err instanceof Error ? err.message : String(err)}`
      )
      return { ...cached, stale: true }
    }
    throw err
  }
}

/**
 * The report for one of the workshop's vehicles: from the cache when fresh,
 * from the authority otherwise. Null when no safety connection is active.
 */
export async function vehicleSafetyReport(
  organizationId: string,
  vehicleId: string,
  options: { refresh?: boolean } = {}
): Promise<CachedSafetyReport | null> {
  const connection = await findSafetyConnection(organizationId)
  if (!connection) return null
  const vehicle = await db.vehicle.findFirst({
    where: { id: vehicleId, organizationId },
    select: { make: true, model: true, year: true, vin: true },
  })
  if (!vehicle || !vehicle.make.trim() || !vehicle.model.trim() || !vehicle.year) return null
  const key = modelKey(vehicle)
  if (!options.refresh) {
    const cached = await readCache(connection.connectorId, key)
    if (cached && !cached.stale) return cached
  }
  return fetchAndCache(connection.id, key, {
    make: vehicle.make,
    model: vehicle.model,
    year: vehicle.year,
    vin: vehicle.vin ?? undefined,
  })
}

/**
 * The weekly pass: every model the workshop has a live vehicle of gets a
 * fresh report, so the vehicle page never waits on the authority and a new
 * recall shows up within a week of being filed. Batched, and rescheduled
 * until the whole fleet is covered.
 */
export async function refreshFleetReports(ctx: ConnectorContext): Promise<JobOutcome> {
  if (ctx.connection.settings[SAFETY_SETTING] === false) return { summary: 'fleet refresh off' }
  const server = (await loadConnection(ctx.connection.id)).server
  if (!server.vehicleSafety) return { summary: 'no safety data' }
  const source = server.manifest.id

  const vehicles = await db.vehicle.findMany({
    where: { organizationId: ctx.connection.organizationId, isArchived: false },
    select: { make: true, model: true, year: true, vin: true },
  })
  const byKey = new Map<string, { make: string; model: string; year: number; vin?: string }>()
  for (const v of vehicles) {
    if (!v.make.trim() || !v.model.trim() || !v.year) continue
    const key = modelKey(v)
    const id = `${key.make}|${key.model}|${key.year}`
    const entry = byKey.get(id)
    if (!entry)
      byKey.set(id, { make: v.make, model: v.model, year: v.year, vin: v.vin ?? undefined })
    else if (!entry.vin && v.vin) entry.vin = v.vin
  }
  const cutoff = new Date(Date.now() - REPORT_TTL_DAYS * 86_400_000)
  const fresh = await db.vehicleSafetyReport.findMany({
    where: { source, fetchedAt: { gte: cutoff } },
    select: { make: true, model: true, year: true },
  })
  const freshIds = new Set(fresh.map((r) => `${r.make}|${r.model}|${r.year}`))
  const due = [...byKey.entries()].filter(([id]) => !freshIds.has(id))

  let refreshed = 0
  let recalls = 0
  for (const [, query] of due.slice(0, FLEET_BATCH)) {
    const key = modelKey(query)
    try {
      const report = await server.vehicleSafety(ctx, query)
      await writeCache(source, key, report)
      refreshed++
      recalls += report.recalls.length
    } catch (err) {
      await ctx.log(
        'warn',
        `Could not refresh ${query.year} ${query.make} ${query.model}: ${err instanceof Error ? err.message : String(err)}`
      )
    }
  }
  const remaining = Math.max(0, due.length - FLEET_BATCH)
  await ctx.saveState({
    fleetModels: byKey.size,
    fleetLastPassAt:
      remaining === 0 ? new Date().toISOString() : ctx.connection.state.fleetLastPassAt,
  })
  return {
    summary: `${refreshed} of ${byKey.size} models refreshed, ${recalls} recalls seen${remaining ? `, ${remaining} to go` : ''}`,
    ...(remaining > 0 && { rescheduleInSeconds: 120 }),
  }
}

/** The job map entry for a safety connector's server module. */
export function safetyJobs(): Record<string, (ctx: ConnectorContext) => Promise<JobOutcome>> {
  return { [SAFETY_JOB]: refreshFleetReports }
}

/**
 * Open recalls per vehicle for a list, read from the cache only; a model
 * never fetched simply has no badge. One query for the page, not one per row.
 */
export async function recallCountsFor(
  organizationId: string,
  vehicles: { id: string; make: string; model: string; year: number }[]
): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  if (vehicles.length === 0) return out
  const connection = await findSafetyConnection(organizationId)
  if (!connection) return out
  const keys = vehicles.map((v) => modelKey(v))
  const rows = await db.vehicleSafetyReport.findMany({
    where: {
      source: connection.connectorId,
      OR: keys.map((k) => ({ make: k.make, model: k.model, year: k.year })),
    },
    select: { make: true, model: true, year: true, recallCount: true },
  })
  const counts = new Map(rows.map((r) => [`${r.make}|${r.model}|${r.year}`, r.recallCount]))
  for (const v of vehicles) {
    const k = modelKey(v)
    const n = counts.get(`${k.make}|${k.model}|${k.year}`)
    if (n) out.set(v.id, n)
  }
  return out
}
