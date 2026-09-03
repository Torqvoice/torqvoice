import { db } from '@/lib/db'
import type {
  ConnectorContext,
  JobHandler,
  JobOutcome,
  VehicleLookupQuery,
  VehicleLookupResult,
} from './types'

/**
 * Keeping every vehicle's next periodic inspection date fresh from a registry.
 *
 * A connector that can answer "when is this car due" declares the
 * `vehicle.inspection` capability and a `syncInspections` setting, and wires
 * its `inspection.refresh` job to `refreshInspections` below. The job runs
 * inside one connection's context, and a connection belongs to exactly one
 * organisation, so the vehicles it can see are that organisation's and no
 * other's, by construction rather than by filter.
 *
 * Dates change only when an inspection happens, so this is not a daily sweep
 * of everything. A vehicle is rechecked monthly, weekly once its deadline is
 * within two months, and at once when it has never been checked. A 500-car
 * shop makes a few dozen calls a day against a quota of tens of thousands.
 */

export const INSPECTION_CAPABILITY = 'vehicle.inspection'
export const INSPECTION_SETTING = 'syncInspections'
export const INSPECTION_JOB = 'inspection.refresh'

/**
 * What a registry connector puts in its manifest to take part: the
 * capability, the opt-in setting and the hourly tick. Spread these into
 * the manifest so every registry, Norwegian or German, offers the same
 * switch with the same wording and the same cadence.
 */
export const INSPECTION_MANIFEST = {
  capability: INSPECTION_CAPABILITY,
  setting: {
    key: INSPECTION_SETTING,
    type: 'boolean' as const,
    label: INSPECTION_SETTING,
    help: `${INSPECTION_SETTING}Help`,
    default: false,
  },
  // The job decides what actually needs a lookup; the tick itself is cheap.
  schedule: { job: INSPECTION_JOB, everyMinutes: 60 },
}

/**
 * The job map entry for a connector's server module: pass the connector's
 * own lookup and the refresh runs against it. A registry never needs to
 * know how batches, rechecks or the status table work.
 */
export function inspectionJobs(lookup: VehicleLookup): Record<string, JobHandler> {
  return { [INSPECTION_JOB]: (ctx) => refreshInspections(ctx, lookup) }
}

/** Deadlines closer than this are "soon" and rechecked more often. */
export const SOON_DAYS = 60
export const RECHECK_SOON_DAYS = 7
export const RECHECK_DAYS = 30
/** Lookups per job run; the job reschedules itself while more remain. */
export const BATCH_SIZE = 25
const BATCH_PAUSE_SECONDS = 5
const DAY_MS = 86_400_000

export type VehicleLookup = (
  ctx: ConnectorContext,
  query: VehicleLookupQuery
) => Promise<VehicleLookupResult | null>

function toDate(iso: string | undefined): Date | null {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

/** The parts of a lookup the status table keeps outside its own columns. */
export function extrasOf(result: VehicleLookupResult): Record<string, unknown> | undefined {
  const extras: Record<string, unknown> = {}
  if (result.tyres) extras.tyres = result.tyres
  if (result.weights) extras.weights = result.weights
  if (result.vehicleClass) extras.vehicleClass = result.vehicleClass
  if (result.firstRegistered) extras.firstRegistered = result.firstRegistered
  return Object.keys(extras).length > 0 ? extras : undefined
}

/**
 * Write what a registry said about one vehicle. `result` null means the
 * registry answered and had no such vehicle; the row keeps any dates it had.
 */
export async function recordRegistryAnswer(input: {
  organizationId: string
  vehicleId: string
  source: string
  result: VehicleLookupResult | null
  now?: Date
}): Promise<void> {
  const now = input.now ?? new Date()
  const { organizationId, vehicleId, source, result } = input
  if (!result) {
    await db.vehicleInspectionStatus.upsert({
      where: { vehicleId },
      create: { organizationId, vehicleId, source, checkedAt: now, found: false },
      update: { source, checkedAt: now, found: false, lastError: null },
    })
    return
  }
  const dueAt = toDate(result.inspectionDue)
  const lastAt = toDate(result.lastInspected)
  const extras = extrasOf(result)
  const shared = {
    source,
    checkedAt: now,
    found: true,
    lastError: null,
    registered: result.registered ?? null,
    ...(extras && { extras: extras as object }),
  }
  await db.vehicleInspectionStatus.upsert({
    where: { vehicleId },
    create: { organizationId, vehicleId, dueAt, lastAt, ...shared },
    // A registry that stopped sending a date has not cancelled the inspection;
    // keep what we had unless it says something new.
    update: {
      ...shared,
      ...(dueAt && { dueAt }),
      ...(lastAt && { lastAt }),
    },
  })
}

/** A lookup that failed: note it, stamp the time so the batch moves on, keep the dates. */
async function recordFailure(input: {
  organizationId: string
  vehicleId: string
  source: string
  error: string
  now: Date
}): Promise<void> {
  const { organizationId, vehicleId, source, error, now } = input
  await db.vehicleInspectionStatus.upsert({
    where: { vehicleId },
    create: { organizationId, vehicleId, source, checkedAt: now, lastError: error.slice(0, 500) },
    update: { checkedAt: now, lastError: error.slice(0, 500) },
  })
}

/** Prisma filter for the vehicles a registry can be asked about: this organisation's, live, with a plate. */
function askableVehicles(organizationId: string) {
  return { organizationId, isArchived: false, licensePlate: { not: null } }
}

/** The subset of those whose last check is old enough to repeat, or that were never checked. */
function dueForCheckWhere(organizationId: string, now: Date) {
  const soonCutoff = new Date(now.getTime() + SOON_DAYS * DAY_MS)
  const staleSoon = new Date(now.getTime() - RECHECK_SOON_DAYS * DAY_MS)
  const stale = new Date(now.getTime() - RECHECK_DAYS * DAY_MS)
  return {
    ...askableVehicles(organizationId),
    OR: [
      { inspectionStatus: null },
      { inspectionStatus: { checkedAt: null } },
      { inspectionStatus: { checkedAt: { lt: stale } } },
      { inspectionStatus: { dueAt: { lt: soonCutoff }, checkedAt: { lt: staleSoon } } },
    ],
  }
}

/**
 * The vehicles of one organisation that are due a registry check, oldest
 * check first, one batch at a time. Only vehicles with a plate: a registry
 * cannot be asked about anything else.
 */
export async function vehiclesDueForCheck(
  organizationId: string,
  now: Date,
  take = BATCH_SIZE
): Promise<{ id: string; licensePlate: string }[]> {
  const rows = await db.vehicle.findMany({
    where: dueForCheckWhere(organizationId, now),
    select: { id: true, licensePlate: true },
    orderBy: { updatedAt: 'asc' },
    take,
  })
  return rows.flatMap((r) => (r.licensePlate ? [{ id: r.id, licensePlate: r.licensePlate }] : []))
}

export interface InspectionSyncOverview {
  /** Vehicles in this organisation a registry can be asked about. */
  vehiclesWithPlate: number
  /** Of those, how many the next run would look up. */
  dueForCheck: number
  /** Vehicles that already carry an inspection date. */
  withDate: number
  /** ISO time the last complete pass finished, if one has. */
  lastPassAt: string | null
  /** True while a pass is part-way through its batches. */
  inProgress: boolean
}

/** What the settings page shows beside the toggle: how much a pass covers and when it last ran. */
export async function inspectionSyncOverview(
  organizationId: string,
  state: Record<string, unknown>,
  now = new Date()
): Promise<InspectionSyncOverview> {
  const [vehiclesWithPlate, dueForCheck, withDate] = await Promise.all([
    db.vehicle.count({ where: askableVehicles(organizationId) }),
    db.vehicle.count({ where: dueForCheckWhere(organizationId, now) }),
    db.vehicleInspectionStatus.count({
      where: { organizationId, dueAt: { not: null }, vehicle: { isArchived: false } },
    }),
  ])
  return {
    vehiclesWithPlate,
    dueForCheck,
    withDate,
    lastPassAt: typeof state.inspectionLastPassAt === 'string' ? state.inspectionLastPassAt : null,
    inProgress: Boolean(state.inspectionRun),
  }
}

interface RunTally {
  checked: number
  found: number
  notFound: number
  failed: number
}

/**
 * The `inspection.refresh` job. Off unless the workshop turned the setting
 * on; otherwise one batch of lookups, then a reschedule while more remain,
 * and a one-line summary in the log when the pass is complete. Counts only:
 * plates are personal data and stay out of the log.
 */
export async function refreshInspections(
  ctx: ConnectorContext,
  lookup: VehicleLookup
): Promise<JobOutcome | void> {
  if (ctx.connection.settings[INSPECTION_SETTING] !== true) {
    return { summary: 'Inspection sync is off' }
  }
  const now = new Date()
  const organizationId = ctx.connection.organizationId
  const source = ctx.connection.connectorId
  const tally: RunTally = (ctx.connection.state.inspectionRun as RunTally | undefined) ?? {
    checked: 0,
    found: 0,
    notFound: 0,
    failed: 0,
  }

  const batch = await vehiclesDueForCheck(organizationId, now)
  for (const vehicle of batch) {
    tally.checked += 1
    try {
      const result = await lookup(ctx, { plate: vehicle.licensePlate })
      await recordRegistryAnswer({ organizationId, vehicleId: vehicle.id, source, result, now })
      if (result) tally.found += 1
      else tally.notFound += 1
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      // A rejected key or a spent quota will fail every vehicle in turn, so
      // stop here and let the job's own retry pick the pass up later.
      if (/rejected the API key|quota/i.test(message)) {
        await ctx.saveState({ inspectionRun: tally })
        throw err
      }
      tally.failed += 1
      await recordFailure({ organizationId, vehicleId: vehicle.id, source, error: message, now })
    }
  }

  if (batch.length === BATCH_SIZE) {
    await ctx.saveState({ inspectionRun: tally })
    return {
      summary: `${tally.checked} vehicles checked so far`,
      rescheduleInSeconds: BATCH_PAUSE_SECONDS,
    }
  }

  const dueSoon = await db.vehicleInspectionStatus.count({
    where: {
      organizationId,
      dueAt: { lte: new Date(now.getTime() + 90 * DAY_MS) },
      vehicle: { isArchived: false },
    },
  })
  await ctx.saveState({ inspectionRun: null, inspectionLastPassAt: now.toISOString() })
  if (tally.checked > 0) {
    await ctx.log('info', 'Inspection refresh complete', {
      checked: tally.checked,
      found: tally.found,
      notFound: tally.notFound,
      failed: tally.failed,
      dueWithin90Days: dueSoon,
    })
  }
  return {
    summary:
      tally.checked === 0
        ? 'Every vehicle was checked recently'
        : `${tally.checked} checked, ${tally.notFound} not in the register, ${dueSoon} due within 90 days`,
  }
}
