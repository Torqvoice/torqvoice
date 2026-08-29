import { db } from '@/lib/db'

/**
 * Clocking a technician on and off a job.
 *
 * Kept out of the route handlers because the web app needs exactly the same
 * rules the moment it grows start/stop buttons, and two implementations of
 * "what counts as an open entry" would drift within a release.
 */

/** A stop that lands before its start is a clock error, not a negative shift. */
export class TimeEntryError extends Error {
  constructor(
    public code: 'already_running' | 'not_running' | 'job_not_found' | 'invalid_range',
    message: string
  ) {
    super(message)
    this.name = 'TimeEntryError'
  }
}

export function durationMinutes(startedAt: Date, endedAt: Date): number {
  // Rounded, not truncated: a 59-second job is a minute of someone's day, and
  // truncating would make a shift of short jobs quietly bill as less than it
  // took. Never below zero, so a clock skew cannot produce negative labour.
  return Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 60_000))
}

/**
 * The technician's currently running entry, if any.
 *
 * Takes every technician row the user owns, because the person is the one
 * holding the phone even when the shop has given them several board lanes.
 */
export async function getOpenEntry(organizationId: string, technicianIds: string[]) {
  if (technicianIds.length === 0) return null
  return db.timeEntry.findFirst({
    where: { organizationId, technicianId: { in: technicianIds }, endedAt: null },
    orderBy: { startedAt: 'desc' },
    select: {
      id: true,
      startedAt: true,
      technicianId: true,
      serviceRecordId: true,
      serviceRecord: { select: { id: true, title: true, status: true } },
    },
  })
}

/**
 * Minutes already banked on a job, not counting a stretch still running.
 *
 * The clock has to continue from this rather than restart at zero: a
 * technician who stops for a part and starts again has not un-worked the first
 * twenty minutes, and a display that says otherwise reads as having lost them.
 */
export async function loggedMinutes(serviceRecordId: string): Promise<number> {
  const result = await db.timeEntry.aggregate({
    where: { serviceRecordId },
    _sum: { durationMinutes: true },
  })
  return result._sum.durationMinutes ?? 0
}

/**
 * Start the clock on a job.
 *
 * One open entry per person, enforced here rather than in the schema: a
 * partial unique index on "endedAt is null" is not portable, and the rule is
 * really a product rule. A technician who taps start on a second job has
 * moved on from the first, so the open one is closed rather than refused.
 * Refusing would leave them staring at an error in a bay with oily gloves.
 */
export async function startEntry(args: {
  organizationId: string
  technicianId: string
  technicianIds: string[]
  serviceRecordId: string
  source?: string
}) {
  const { organizationId, technicianId, technicianIds, serviceRecordId } = args

  const job = await db.serviceRecord.findFirst({
    where: { id: serviceRecordId, organizationId },
    select: { id: true },
  })
  if (!job) {
    throw new TimeEntryError('job_not_found', 'That job does not exist in this workshop.')
  }

  const open = await getOpenEntry(organizationId, technicianIds)

  // Tapping start on the job already running is a no-op, not a restart. The
  // alternative loses the elapsed time to a double tap on a cold morning.
  if (open?.serviceRecordId === serviceRecordId) {
    return { entry: open, closed: null }
  }

  const now = new Date()

  return db.$transaction(async (tx) => {
    let closed = null
    if (open) {
      closed = await tx.timeEntry.update({
        where: { id: open.id },
        data: { endedAt: now, durationMinutes: durationMinutes(open.startedAt, now) },
        select: { id: true, serviceRecordId: true, durationMinutes: true },
      })
    }

    const entry = await tx.timeEntry.create({
      data: {
        organizationId,
        technicianId,
        serviceRecordId,
        startedAt: now,
        source: args.source ?? 'app',
      },
      select: {
        id: true,
        startedAt: true,
        technicianId: true,
        serviceRecordId: true,
        serviceRecord: { select: { id: true, title: true, status: true } },
      },
    })

    return { entry, closed }
  })
}

/** Stop whatever is running. Idempotent: stopping nothing is not an error the app should have to handle twice. */
export async function stopEntry(args: {
  organizationId: string
  technicianIds: string[]
  note?: string
}) {
  const open = await getOpenEntry(args.organizationId, args.technicianIds)
  if (!open) {
    throw new TimeEntryError('not_running', 'No clock is running.')
  }

  const now = new Date()
  return db.timeEntry.update({
    where: { id: open.id },
    data: {
      endedAt: now,
      durationMinutes: durationMinutes(open.startedAt, now),
      note: args.note?.trim() || null,
    },
    select: {
      id: true,
      startedAt: true,
      endedAt: true,
      durationMinutes: true,
      serviceRecordId: true,
      note: true,
    },
  })
}

/**
 * Everything the technician clocked between two instants.
 *
 * The caller passes the range rather than the server assuming "today",
 * because the phone knows the technician's timezone and the server does not.
 * A shift that starts at 22:00 belongs to the day the technician says it does.
 */
export async function listEntries(args: {
  organizationId: string
  technicianIds: string[]
  from: Date
  to: Date
}) {
  if (args.technicianIds.length === 0) return []
  return db.timeEntry.findMany({
    where: {
      organizationId: args.organizationId,
      technicianId: { in: args.technicianIds },
      startedAt: { gte: args.from, lt: args.to },
    },
    orderBy: { startedAt: 'desc' },
    select: {
      id: true,
      startedAt: true,
      endedAt: true,
      durationMinutes: true,
      note: true,
      source: true,
      serviceRecord: {
        select: {
          id: true,
          title: true,
          vehicle: { select: { make: true, model: true, licensePlate: true } },
        },
      },
    },
  })
}
