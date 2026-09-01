import { db } from '@/lib/db'
import { notificationBus } from '@/lib/notification-bus'

/**
 * Whether this person works jobs, kept in one place.
 *
 * The technician row is what the work board draws and what the app checks on
 * every request, and it is separate from the account on purpose: a workshop can
 * schedule somebody who has no login at all. So it cannot simply be a column on
 * the membership, and something has to keep the two in step. This is it.
 *
 * Deactivated, never deleted. Past jobs, inspections, status reports and
 * clocked hours all point at the row, and removing it would rewrite history to
 * say nobody did the work.
 */
export async function setTechnicianStanding(
  organizationId: string,
  userId: string | null,
  active: boolean,
  nameFallbackUserId?: string | null
): Promise<string | null> {
  if (!userId) return null

  const existing = await db.technician.findFirst({
    where: { userId, organizationId },
    select: { id: true },
  })

  if (existing) {
    const technician = await db.technician.update({
      where: { id: existing.id },
      data: { isActive: active },
    })
    notificationBus.emit('workboard', {
      type: 'technician_updated',
      organizationId,
      technician,
    })
    return technician.id
  }

  if (!active) return null

  const user = await db.user.findUnique({
    where: { id: nameFallbackUserId ?? userId },
    select: { name: true, email: true },
  })
  const maxOrder = await db.technician.aggregate({
    where: { organizationId },
    _max: { sortOrder: true },
  })

  const technician = await db.technician.create({
    data: {
      // Named from the account, colour left at the default. Both are worth
      // setting properly on the work board; neither is worth asking about on a
      // screen where the question is what somebody's job is.
      name: user?.name || user?.email || 'Technician',
      userId,
      organizationId,
      sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
    },
  })

  notificationBus.emit('workboard', {
    type: 'technician_created',
    organizationId,
    technician,
  })
  return technician.id
}
