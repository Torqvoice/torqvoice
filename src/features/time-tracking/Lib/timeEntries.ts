import { db } from '@/lib/db'
import { notificationBus } from '@/lib/notification-bus'

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

/**
 * What the web is told when a clock changes.
 *
 * Goes out on the work board channel, which already fans out to every
 * signed-in browser in the workshop, so the desk sees a clock start the
 * moment the bay taps it. Only ids travel: the listener refetches what it
 * needs, which keeps a stale frame from ever overwriting a fresher read.
 */
export type ClockEvent = {
  type: 'clock_started' | 'clock_stopped'
  organizationId: string
  technicianId: string
  serviceRecordId: string
  entryId: string
}

function announce(event: ClockEvent) {
  notificationBus.emit('workboard', event)
}

/**
 * Every technician row the signed-in account owns in this workshop.
 *
 * The web has no bearer token carrying these the way the app does, so the
 * clock buttons resolve them per request. Inactive rows are left out: a
 * deactivated technician keeps their history but cannot clock.
 */
export async function technicianIdsForUser(
  organizationId: string,
  userId: string
): Promise<string[]> {
  const rows = await db.technician.findMany({
    where: { organizationId, userId, isActive: true },
    orderBy: { sortOrder: 'asc' },
    select: { id: true },
  })
  return rows.map((r) => r.id)
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
      serviceRecord: { select: { id: true, title: true, status: true, vehicleId: true } },
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

  return db
    .$transaction(async (tx) => {
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
    .then((result) => {
      // After the commit, never inside it: a listener that refetches on the
      // event must find the rows already there.
      if (result.closed && open) {
        announce({
          type: 'clock_stopped',
          organizationId,
          technicianId: open.technicianId,
          serviceRecordId: result.closed.serviceRecordId,
          entryId: result.closed.id,
        })
      }
      announce({
        type: 'clock_started',
        organizationId,
        technicianId,
        serviceRecordId,
        entryId: result.entry.id,
      })
      return result
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
  const entry = await db.timeEntry.update({
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
  announce({
    type: 'clock_stopped',
    organizationId: args.organizationId,
    technicianId: open.technicianId,
    serviceRecordId: entry.serviceRecordId,
    entryId: entry.id,
  })
  return entry
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

// ─── What the desk sees ─────────────────────────────────────────────────────

/** The shape the timesheet and the work order panel both read. */
export const entrySelect = {
  id: true,
  startedAt: true,
  endedAt: true,
  durationMinutes: true,
  note: true,
  source: true,
  editedAt: true,
  editedByUserId: true,
  technicianId: true,
  technician: { select: { id: true, name: true, color: true } },
  serviceRecord: {
    select: {
      id: true,
      title: true,
      status: true,
      vehicleId: true,
      vehicle: { select: { make: true, model: true, licensePlate: true } },
    },
  },
} as const

/**
 * Every entry in the workshop that touches a window, including one that
 * started before it and is still running: a night shift that crossed
 * midnight belongs on both days' sheets, and a clock nobody stopped belongs
 * on today's until somebody does.
 */
export async function listOrgEntries(args: {
  organizationId: string
  from: Date
  to: Date
  technicianId?: string | null
}) {
  return db.timeEntry.findMany({
    where: {
      organizationId: args.organizationId,
      ...(args.technicianId ? { technicianId: args.technicianId } : {}),
      startedAt: { lt: args.to },
      OR: [{ endedAt: null }, { endedAt: { gte: args.from } }],
    },
    orderBy: { startedAt: 'asc' },
    select: entrySelect,
  })
}

/** Everyone clocked in right now, newest start first. */
export async function listRunningEntries(organizationId: string) {
  return db.timeEntry.findMany({
    where: { organizationId, endedAt: null },
    orderBy: { startedAt: 'desc' },
    select: entrySelect,
  })
}

/** Every stretch anyone has clocked on one job, oldest first. */
export async function listJobEntries(organizationId: string, serviceRecordId: string) {
  return db.timeEntry.findMany({
    where: { organizationId, serviceRecordId },
    orderBy: { startedAt: 'asc' },
    select: entrySelect,
  })
}

// ─── Corrections ────────────────────────────────────────────────────────────

/**
 * A stretch typed in by hand: a technician who forgot to clock in, or a
 * day the phone was flat. Marked `manual` so the sheet never passes it off
 * as something a clock measured.
 */
export async function createManualEntry(args: {
  organizationId: string
  technicianId: string
  serviceRecordId: string
  startedAt: Date
  endedAt: Date
  note?: string | null
  editedByUserId: string
}) {
  if (args.endedAt.getTime() <= args.startedAt.getTime()) {
    throw new TimeEntryError('invalid_range', 'The clock cannot stop before it starts.')
  }
  const [technician, job] = await Promise.all([
    db.technician.findFirst({
      where: { id: args.technicianId, organizationId: args.organizationId },
      select: { id: true },
    }),
    db.serviceRecord.findFirst({
      where: { id: args.serviceRecordId, organizationId: args.organizationId },
      select: { id: true },
    }),
  ])
  if (!technician || !job) {
    throw new TimeEntryError('job_not_found', 'That job or technician is not in this workshop.')
  }
  return db.timeEntry.create({
    data: {
      organizationId: args.organizationId,
      technicianId: args.technicianId,
      serviceRecordId: args.serviceRecordId,
      startedAt: args.startedAt,
      endedAt: args.endedAt,
      durationMinutes: durationMinutes(args.startedAt, args.endedAt),
      note: args.note?.trim() || null,
      source: 'manual',
      editedAt: new Date(),
      editedByUserId: args.editedByUserId,
    },
    select: entrySelect,
  })
}

/**
 * Correct a recorded stretch after the fact.
 *
 * Keeps the source the clock gave it and stamps who changed it, so the
 * sheet can show "recorded by the app, adjusted by Kari" rather than
 * quietly presenting an edited figure as measured. Giving a running entry
 * an end is how a manager stops a clock somebody left on.
 */
export async function updateEntry(args: {
  organizationId: string
  id: string
  startedAt: Date
  endedAt: Date | null
  note?: string | null
  editedByUserId: string
}) {
  const existing = await db.timeEntry.findFirst({
    where: { id: args.id, organizationId: args.organizationId },
    select: { id: true, technicianId: true, serviceRecordId: true, endedAt: true },
  })
  if (!existing) {
    throw new TimeEntryError('job_not_found', 'That entry no longer exists.')
  }
  if (args.endedAt && args.endedAt.getTime() <= args.startedAt.getTime()) {
    throw new TimeEntryError('invalid_range', 'The clock cannot stop before it starts.')
  }
  if (!args.endedAt && args.startedAt.getTime() > Date.now()) {
    throw new TimeEntryError('invalid_range', 'A running clock cannot start in the future.')
  }
  // Re-opening an entry would leave two clocks running for one person if
  // they have since started another, so a closed stretch stays closed.
  if (existing.endedAt && !args.endedAt) {
    throw new TimeEntryError('invalid_range', 'A stopped entry cannot be restarted.')
  }
  const entry = await db.timeEntry.update({
    where: { id: existing.id },
    data: {
      startedAt: args.startedAt,
      endedAt: args.endedAt,
      durationMinutes: args.endedAt ? durationMinutes(args.startedAt, args.endedAt) : null,
      note: args.note?.trim() || null,
      editedAt: new Date(),
      editedByUserId: args.editedByUserId,
    },
    select: entrySelect,
  })
  if (!existing.endedAt && args.endedAt) {
    announce({
      type: 'clock_stopped',
      organizationId: args.organizationId,
      technicianId: existing.technicianId,
      serviceRecordId: existing.serviceRecordId,
      entryId: existing.id,
    })
  }
  return entry
}

export async function deleteEntry(organizationId: string, id: string) {
  const existing = await db.timeEntry.findFirst({
    where: { id, organizationId },
    select: { id: true, technicianId: true, serviceRecordId: true, endedAt: true },
  })
  if (!existing) {
    throw new TimeEntryError('job_not_found', 'That entry no longer exists.')
  }
  await db.timeEntry.delete({ where: { id: existing.id } })
  if (!existing.endedAt) {
    announce({
      type: 'clock_stopped',
      organizationId,
      technicianId: existing.technicianId,
      serviceRecordId: existing.serviceRecordId,
      entryId: existing.id,
    })
  }
  return existing
}
