import type { Prisma } from '@/generated/prisma/client'

/**
 * The vehicle's current reading (mileage, or engine hours on a boat) and the
 * readings its jobs carry.
 *
 * THE RULE, for every writer of a job's reading (the work order page, a new
 * job, the technician app's check-in, a job raised from an inspection, an
 * imported history row):
 *
 *   A job's reading becomes the vehicle's current reading when
 *     1. this save gave the job a reading it did not already have,
 *     2. the reading is higher than the vehicle's current one, and
 *     3. no later-dated job on the vehicle carries a reading of its own.
 *   The vehicle then remembers that job (`readingJobId`) and what it read
 *   before (`readingBeforeJob`).
 *
 *   When the job the vehicle remembers is saved with a lower reading, or with
 *   none, the vehicle follows the correction: it reads what it would have
 *   read had the job been typed right the first time. That is the highest of
 *   the job's new reading, every other job's reading on the vehicle, and what
 *   the vehicle read before the job set it. The vehicle keeps remembering the
 *   job only while the job's own reading is the one it shows.
 *
 * So the newest reading moves the vehicle forward, a slip on the job that
 * moved it can be corrected on that job, and nothing else winds the vehicle
 * back: a lower reading on any other job never does, an old job being edited
 * cannot push today's reading about, and saving a job again without touching
 * its reading leaves a vehicle that was corrected by hand alone. A job is
 * dated by when it starts, else by its service date. A booked job without a
 * reading is not in the way of today's. History written in bulk (the
 * importer) asks once per vehicle, for its newest imported job, after every
 * row is in: asked row by row, the answer would follow the order of the file.
 *
 * Anything that writes the vehicle's reading itself (the vehicle form, an
 * imported vehicle row, a restore of an older backup) forgets the job
 * (`READING_SET_BY_HAND`): from then on the reading is nobody's job's. So does
 * moving the job to another vehicle (`forgetJobReading`), and deleting it (the
 * column is set to null by the database). In both cases the vehicle keeps the
 * reading it has.
 */

/** What the rule reads and writes on the vehicle. */
const VEHICLE_READING = { mileage: true, readingJobId: true, readingBeforeJob: true } as const

interface VehicleReadingRow {
  mileage: number
  readingJobId: string | null
  readingBeforeJob: number | null
}

/**
 * The queries the rule makes, so the app's client and a transaction both fit
 * without the rule importing the database itself.
 */
export interface ReadingClient {
  serviceRecord: {
    findFirst(args: {
      where: Prisma.ServiceRecordWhereInput
      select: { id: true }
    }): PromiseLike<{ id: string } | null>
    aggregate(args: {
      where: Prisma.ServiceRecordWhereInput
      _max: { mileage: true }
    }): PromiseLike<{ _max: { mileage: number | null } }>
  }
  vehicle: {
    findFirst(args: {
      where: Prisma.VehicleWhereInput
      select: typeof VEHICLE_READING
    }): PromiseLike<VehicleReadingRow | null>
    updateMany(args: {
      where: Prisma.VehicleWhereInput
      data: { mileage?: number; readingJobId?: string | null; readingBeforeJob?: number | null }
    }): PromiseLike<{ count: number }>
  }
}

/**
 * For the data of a write that sets the vehicle's reading itself: after it,
 * the reading is no longer the job's that set it.
 */
export const READING_SET_BY_HAND = { readingJobId: null, readingBeforeJob: null } as const

export interface JobReading {
  organizationId: string
  vehicleId: string
  /** The job the reading was written to. */
  jobId: string
  /** When the job starts, else its service date: see `jobReadingDate`. */
  jobDate: Date
  /** The reading as saved on the job. */
  reading: number | null | undefined
  /**
   * What the job said before this save, when it had a say on this vehicle.
   * Left out for a new job, or one that just moved to this vehicle.
   */
  previousReading?: number | null
}

/** The day a job's reading was taken, as far as the job knows. */
export function jobReadingDate(job: { startDateTime?: Date | null; serviceDate: Date }): Date {
  return job.startDateTime ?? job.serviceDate
}

/** A reading that says something: a number above zero. */
function readingOf(value: number | null | undefined): number | null {
  return value != null && Number.isFinite(value) && value > 0 ? value : null
}

/** Other jobs on the vehicle, dated after this one, that carry a reading. */
function laterJobsWithReading(
  job: Pick<JobReading, 'organizationId' | 'vehicleId' | 'jobId' | 'jobDate'>
): Prisma.ServiceRecordWhereInput {
  return {
    organizationId: job.organizationId,
    vehicleId: job.vehicleId,
    id: { not: job.jobId },
    // Zero counts: after a new odometer a later job may well read 0.
    mileage: { not: null },
    OR: [
      { startDateTime: { gt: job.jobDate } },
      { startDateTime: null, serviceDate: { gt: job.jobDate } },
    ],
  }
}

/**
 * Applies the rule above after a job's reading was written. Answers whether
 * the vehicle's reading changed. Takes the transaction when the writer has one.
 */
export async function applyJobReading(client: ReadingClient, job: JobReading): Promise<boolean> {
  const reading = readingOf(job.reading)
  if (job.previousReading !== undefined && (job.previousReading ?? null) === (job.reading ?? null))
    return false

  // The job had a reading on this vehicle and now reads lower, or nothing:
  // a correction, if the vehicle's reading is this job's.
  if (readingOf(job.previousReading) != null) {
    const vehicle = await client.vehicle.findFirst({
      where: { id: job.vehicleId, organizationId: job.organizationId, readingJobId: job.jobId },
      select: VEHICLE_READING,
    })
    if (vehicle && (reading == null || reading < vehicle.mileage)) {
      return correctJobReading(client, job, reading, vehicle)
    }
  }
  if (reading == null) return false

  const later = await client.serviceRecord.findFirst({
    where: laterJobsWithReading(job),
    select: { id: true },
  })
  if (later) return false

  // Compare and set, so two saves at once cannot leave the lower of two
  // readings behind, nor remember the wrong job: the update only lands on
  // the vehicle as it was read, and is asked again otherwise.
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await client.vehicle.findFirst({
      where: { id: job.vehicleId, organizationId: job.organizationId },
      select: VEHICLE_READING,
    })
    if (!current || current.mileage >= reading) return false
    const moved = await client.vehicle.updateMany({
      where: {
        id: job.vehicleId,
        organizationId: job.organizationId,
        mileage: current.mileage,
        readingJobId: current.readingJobId,
      },
      data: {
        mileage: reading,
        readingJobId: job.jobId,
        // Raised again by the same job, the reading before it stays the one
        // from before its first.
        readingBeforeJob:
          current.readingJobId === job.jobId ? current.readingBeforeJob : current.mileage,
      },
    })
    if (moved.count > 0) return true
  }
  return false
}

/**
 * The job that set the vehicle's reading now reads lower, or nothing: the
 * vehicle reads what it would have, had the job been typed right.
 */
async function correctJobReading(
  client: ReadingClient,
  job: JobReading,
  reading: number | null,
  vehicle: VehicleReadingRow
): Promise<boolean> {
  const others = await client.serviceRecord.aggregate({
    where: {
      organizationId: job.organizationId,
      vehicleId: job.vehicleId,
      id: { not: job.jobId },
      mileage: { gt: 0 },
    },
    _max: { mileage: true },
  })
  const floor = Math.max(vehicle.readingBeforeJob ?? 0, others._max.mileage ?? 0)
  const stillTheJobs = reading != null && reading > floor
  const target = stillTheJobs ? reading : floor
  // Only on the vehicle as it was read: another job that moved it meanwhile
  // has the newer word. Two saves of this job take turns on its row lock
  // (lockJobReading), so the later one corrects after the earlier.
  const moved = await client.vehicle.updateMany({
    where: {
      id: job.vehicleId,
      organizationId: job.organizationId,
      readingJobId: job.jobId,
      mileage: vehicle.mileage,
    },
    data: stillTheJobs ? { mileage: target } : { mileage: target, ...READING_SET_BY_HAND },
  })
  if (moved.count === 0) return false

  // Another job's reading saved while this one was corrected never ends up
  // above the vehicle's: up to it, and the reading is no longer this job's.
  const since = await client.serviceRecord.aggregate({
    where: {
      organizationId: job.organizationId,
      vehicleId: job.vehicleId,
      id: { not: job.jobId },
      mileage: { gt: target },
    },
    _max: { mileage: true },
  })
  const above = since._max.mileage
  if (above != null) {
    await client.vehicle.updateMany({
      where: { id: job.vehicleId, organizationId: job.organizationId, mileage: { lt: above } },
      data: { mileage: above, ...READING_SET_BY_HAND },
    })
  }
  return true
}

/**
 * Locks the job's row until the writer's transaction ends, and reads the
 * reading it carries before this save. Every writer that changes the reading
 * of an existing job calls it first in its transaction, then applies the rule
 * in the same transaction: two saves of one job at once then take turns, and
 * the vehicle ends on the reading the job ends on.
 */
export async function lockJobReading(
  tx: Pick<Prisma.TransactionClient, '$queryRaw'>,
  job: { organizationId: string; jobId: string }
): Promise<{ mileage: number | null; vehicleId: string | null } | null> {
  const rows = await tx.$queryRaw<{ mileage: number | null; vehicleId: string | null }[]>`
    SELECT "mileage", "vehicleId" FROM "service_records"
    WHERE "id" = ${job.jobId} AND "organizationId" = ${job.organizationId}
    FOR UPDATE`
  return rows[0] ?? null
}

/**
 * A job leaves its vehicle (moved to another one): the vehicle keeps its
 * reading, and it is no longer that job's to correct.
 */
export async function forgetJobReading(
  client: Pick<ReadingClient, 'vehicle'>,
  job: { organizationId: string; jobId: string }
): Promise<void> {
  await client.vehicle.updateMany({
    where: { organizationId: job.organizationId, readingJobId: job.jobId },
    data: READING_SET_BY_HAND,
  })
}

/**
 * The reading a person typing this job's reading should not be below: the
 * highest on an earlier job, and the vehicle's own unless a later job has
 * already moved it on. When the vehicle's reading is this job's own, it is
 * what the vehicle read before the job, so the job is not warned about
 * itself. Null when nothing is known, so nothing is said.
 */
export async function lastReadingBeforeJob(
  client: Pick<ReadingClient, 'serviceRecord'>,
  job: Pick<JobReading, 'organizationId' | 'vehicleId' | 'jobId' | 'jobDate'> & {
    /** The vehicle as the caller has already loaded it. */
    vehicle: VehicleReadingRow
  }
): Promise<number | null> {
  const [later, earlier] = await Promise.all([
    client.serviceRecord.findFirst({ where: laterJobsWithReading(job), select: { id: true } }),
    client.serviceRecord.aggregate({
      where: {
        organizationId: job.organizationId,
        vehicleId: job.vehicleId,
        id: { not: job.jobId },
        mileage: { gt: 0 },
        OR: [
          { startDateTime: { lt: job.jobDate } },
          { startDateTime: null, serviceDate: { lt: job.jobDate } },
        ],
      },
      _max: { mileage: true },
    }),
  ])
  const vehicleReading =
    job.vehicle.readingJobId === job.jobId
      ? (job.vehicle.readingBeforeJob ?? 0)
      : job.vehicle.mileage
  const last = Math.max(later ? 0 : vehicleReading, earlier._max.mileage ?? 0)
  return last > 0 ? last : null
}

/**
 * How far above the last known reading a new one may go before the screen
 * asks whether a digit slipped in. One extra digit on a six-figure odometer
 * is a jump of hundreds of thousands; a year of hard driving is well under
 * the distance limit, and a year of engine hours well under the hours one.
 * Kilometres and miles share the distance limit. Constants for now: a
 * workshop setting can take their place later.
 */
export const MUCH_HIGHER_READING = { distance: 100_000, hours: 5_000 } as const

export type ReadingKind = keyof typeof MUCH_HIGHER_READING

/** What is typed in a reading field, as a number, or null when it is not one. */
function enteredReading(entered: string): number | null {
  const text = entered.trim()
  if (text === '') return null
  const value = Number(text)
  return Number.isFinite(value) && value >= 0 ? value : null
}

/**
 * Whether what is typed in a reading field is below the last known reading.
 * An empty or unreadable field is not a reading, and neither is "nothing is
 * known yet".
 */
export function isLowerReading(entered: string, last: number | null | undefined): boolean {
  if (last == null || last <= 0) return false
  const value = enteredReading(entered)
  return value != null && value < last
}

/**
 * Whether what is typed is so far above the last known reading that it is
 * more likely a typo than driving: see MUCH_HIGHER_READING.
 */
export function isMuchHigherReading(
  entered: string,
  last: number | null | undefined,
  kind: ReadingKind
): boolean {
  if (last == null || last <= 0) return false
  const value = enteredReading(entered)
  return value != null && value - last > MUCH_HIGHER_READING[kind]
}

/** Which notice a reading field shows, if any: never two at once. */
export function readingNotice(
  entered: string,
  last: number | null | undefined,
  kind: ReadingKind
): 'lower' | 'higher' | null {
  if (isLowerReading(entered, last)) return 'lower'
  if (isMuchHigherReading(entered, last, kind)) return 'higher'
  return null
}
