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
 * every write that changes a job's technician goes through `settleHelpers`
 * to hold them:
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
