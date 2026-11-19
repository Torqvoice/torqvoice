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
 *
 * So the newest reading moves the vehicle forward, and nothing else does: a
 * lower reading never winds the vehicle back (a typo on a job must not), an
 * old job being edited cannot push today's reading about, and saving a job
 * again without touching its reading leaves a vehicle that was corrected by
 * hand alone. A job is dated by when it starts, else by its service date. A
 * booked job without a reading is not in the way of today's.
 *
 * The vehicle's reading is lowered in one place only, the vehicle form, where
 * the person sees a notice and saves anyway (odometers are replaced).
 */

/**
 * The three queries the rule makes, so the app's client, a transaction and a
 * test double all fit without the rule importing the database itself.
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
    updateMany(args: {
      where: Prisma.VehicleWhereInput
      data: { mileage: number }
    }): PromiseLike<{ count: number }>
  }
}

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

/** Other jobs on the vehicle, dated after this one, that carry a reading. */
function laterJobsWithReading(
  job: Pick<JobReading, 'organizationId' | 'vehicleId' | 'jobId' | 'jobDate'>
): Prisma.ServiceRecordWhereInput {
  return {
    organizationId: job.organizationId,
    vehicleId: job.vehicleId,
    id: { not: job.jobId },
    mileage: { gt: 0 },
    OR: [
      { startDateTime: { gt: job.jobDate } },
      { startDateTime: null, serviceDate: { gt: job.jobDate } },
    ],
  }
}

/**
 * Applies the rule above after a job's reading was written. Answers whether
 * the vehicle moved. Takes the transaction when the writer has one.
 */
export async function applyJobReading(client: ReadingClient, job: JobReading): Promise<boolean> {
  const { reading } = job
  if (reading == null || !Number.isFinite(reading) || reading <= 0) return false
  if (job.previousReading != null && job.previousReading === reading) return false

  const later = await client.serviceRecord.findFirst({
    where: laterJobsWithReading(job),
    select: { id: true },
  })
  if (later) return false

  // The comparison is the database's, so two saves at once cannot leave the
  // lower of two readings behind.
  const moved = await client.vehicle.updateMany({
    where: { id: job.vehicleId, organizationId: job.organizationId, mileage: { lt: reading } },
    data: { mileage: reading },
  })
  return moved.count > 0
}

/**
 * The reading a person typing this job's reading should not be below: the
 * highest on an earlier job, and the vehicle's own unless a later job has
 * already moved it on. Null when nothing is known, so nothing is said.
 */
export async function lastReadingBeforeJob(
  client: ReadingClient,
  job: Pick<JobReading, 'organizationId' | 'vehicleId' | 'jobId' | 'jobDate'> & {
    /** The vehicle's current reading, which the caller has already loaded. */
    vehicleReading: number
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
  const last = Math.max(later ? 0 : job.vehicleReading, earlier._max.mileage ?? 0)
  return last > 0 ? last : null
}

/**
 * Whether what is typed in a reading field is below the last known reading.
 * An empty or unreadable field is not a reading, and neither is "nothing is
 * known yet".
 */
export function isLowerReading(entered: string, last: number | null | undefined): boolean {
  if (last == null || last <= 0) return false
  const text = entered.trim()
  if (text === '') return false
  const value = Number(text)
  return Number.isFinite(value) && value >= 0 && value < last
}
