import 'server-only'
import { db } from '@/lib/db'
import type { AuthContext } from '@/lib/with-auth'
import { PermissionSubject } from '@/lib/permissions'
import { accessFor } from '@/lib/viewer-access'

/**
 * The appointment a calendar link asks for, or null. Only the viewer's own
 * workshop's, and only for somebody who may read the calendar (seeing it is
 * reading jobs): any other id, one since deleted, or a viewer without that
 * read gets the calendar as if the link named no appointment at all, so a
 * link never tells anyone whether an id exists or which day it is on.
 */
export async function findLinkedAppointment(
  ctx: Pick<AuthContext, 'userId' | 'isAdmin' | 'organizationId'> | null,
  id: unknown
): Promise<{ id: string; startAt: Date } | null> {
  if (!ctx || typeof id !== 'string' || !id) return null
  if (!(await accessFor(ctx)).reads(PermissionSubject.SERVICES)) return null
  return db.appointment.findFirst({
    where: { id, organizationId: ctx.organizationId },
    select: { id: true, startAt: true },
  })
}
