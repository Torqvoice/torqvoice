import type { ServiceRecordWhereInput } from '@/generated/prisma/models'
import type { TxClient } from '@/lib/db'

/**
 * Who is on a job.
 *
 * A job has one technician (`ServiceRecord.technicianId`) and any number of
 * helpers (`ServiceRecordHelper`): an apprentice beside whoever is teaching
 * them, a second pair of hands on a truck. The technician is the single
 * answer everything that needs one keeps reading, the name on the invoice and
 * the lane the card sits in. The helpers are on the job as much as the
 * technician is: it is in their day and on their phone.
 *
 * Two rules keep "who is on this job" one list with nobody in it twice, and
 * every write that changes a job's technician takes `lockJobTeam` and then
 * goes through `settleHelpers` to hold them:
 *
 * - The technician is never also a helper.
 * - A job with no technician has no helpers.
 */

/**
 * The helpers a screen shows and a booking counts: the ones still working
 * here. Somebody who has left is deactivated rather than deleted, so their
 * rows stay as the record of who was on the job (the reports and the printed
 * sheet read those), but they are in nobody's day any more and must not hold
 * a slot or sit on a card as a name nobody can see.
 */
export const ACTIVE_HELPERS = {
  where: { technician: { isActive: true } },
  select: { technicianId: true },
  // In the order they were put on the job, so they list the same way every time.
  orderBy: { createdAt: 'asc' },
} as const

/**
 * The jobs a person is on: as the technician, or helping.
 *
 * Takes every technician row the person owns, as the rest of the app does. A
 * condition of its own under `OR`, so spread it only into a filter that has
 * no `OR` of its own, or put it in an `AND`.
 */
export function onJobWhere(technicianIds: string[]): ServiceRecordWhereInput {
  return {
    OR: [
      { technicianId: { in: technicianIds } },
      { helpers: { some: { technicianId: { in: technicianIds } } } },
    ],
  }
}

/**
 * The same, for a request from the technician app: an owner or an admin may
 * open any job in the workshop, everybody else the ones they are on.
 */
export function jobScopeFor(ctx: {
  isAdmin: boolean
  technicianIds: string[]
}): ServiceRecordWhereInput {
  return ctx.isAdmin ? {} : onJobWhere(ctx.technicianIds)
}

/**
 * Hold the job's team still for the rest of the transaction, and say who
 * leads it now.
 *
 * Every write that changes a job's technician or its helpers starts here.
 * Two desks changing the same team at once then take turns: the second waits
 * on the row lock until the first commits, and reads the technician the
 * first one left, not the one its page showed. Without it a helper could be
 * added to a job the other desk had just emptied, or the old technician
 * kept on as a helper of themselves, and a helper row is what opens the job
 * in the technician app.
 *
 * Scoped by workshop in the statement itself, so another workshop's job is
 * neither locked nor read. Null when the job is not this workshop's.
 */
export async function lockJobTeam(
  tx: TxClient,
  args: { organizationId: string; serviceRecordId: string }
): Promise<{ technicianId: string | null } | null> {
  const rows = await tx.$queryRaw<{ technicianId: string | null }[]>`
    SELECT "technicianId" FROM "public"."service_records"
    WHERE id = ${args.serviceRecordId} AND "organizationId" = ${args.organizationId}
    FOR UPDATE`
  return rows[0] ? { technicianId: rows[0].technicianId } : null
}

/**
 * Put the helpers right when a job's technician changes, inside the
 * transaction that writes the change.
 *
 * - Nobody takes over (the job is unassigned): the helpers go with the
 *   technician. A job nobody's name is on is not half-staffed.
 * - A helper takes over: the two swap, so the same people are still on the
 *   job and only who leads it changed. Dropping the old technician instead
 *   would quietly take somebody off a job they are standing at.
 * - Somebody new takes over: the old technician leaves, the helpers stay.
 */
export async function settleHelpers(
  tx: TxClient,
  args: {
    organizationId: string
    serviceRecordId: string
    /** The technician before this write. */
    previousId: string | null
    /** The technician after it. */
    nextId: string | null
  }
): Promise<void> {
  const { organizationId, serviceRecordId, previousId, nextId } = args
  if (nextId === previousId) return

  if (!nextId) {
    await tx.serviceRecordHelper.deleteMany({ where: { serviceRecordId, organizationId } })
    return
  }

  const promoted = await tx.serviceRecordHelper.deleteMany({
    where: { serviceRecordId, organizationId, technicianId: nextId },
  })
  if (promoted.count > 0 && previousId) {
    await tx.serviceRecordHelper.createMany({
      data: [{ organizationId, serviceRecordId, technicianId: previousId }],
      skipDuplicates: true,
    })
  }
}
