'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db'
import { notificationBus } from '@/lib/notification-bus'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { withAuth } from '@/lib/with-auth'
import { revokeTechnicianCredentials } from '../Lib/revokeTechnicianCredentials'

/**
 * Cuts a technician off, and means it.
 *
 * Deactivating the technician row alone was already most of the way there,
 * because every request through the technician API re-reads it. But the
 * session outlives it: the token on the phone stays a real session, and
 * reactivating the person months later would bring it back to life. A setup
 * code sent to a mistyped number has the same shape.
 *
 * So all four go together, and it is worth being clear about why each one is
 * on the list:
 *
 *   - the technician row, which is what the app checks on every request
 *   - their sessions, so the token in someone's pocket stops being one
 *   - unredeemed codes, so nothing outstanding can still be used
 *   - their push devices, so the wrong phone stops being told about jobs
 *
 * The row is deactivated rather than deleted. Past jobs, inspections, status
 * reports and clocked hours all point at it, and removing it would rewrite
 * history to say nobody did the work.
 */

/** Keyed on the person rather than the technician row, because everything
 * being revoked below hangs off the account: their sessions, their devices,
 * their outstanding codes. */
const schema = z.object({
  userId: z.string().min(1),
})

export async function removeTechnicianAccess(input: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      const { userId } = schema.parse(input)

      const technician = await db.technician.findFirst({
        where: { userId, organizationId },
        select: { id: true, name: true, userId: true },
      })
      if (!technician) throw new Error('That technician is not part of this workshop.')

      const updated = await db.technician.update({
        where: { id: technician.id },
        data: { isActive: false },
      })

      await revokeTechnicianCredentials(organizationId, technician.userId)

      notificationBus.emit('workboard', {
        type: 'technician_updated',
        organizationId,
        technician: updated,
      })
      revalidatePath('/settings/team')
      revalidatePath('/work-board')

      return { technicianId: technician.id, name: technician.name }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.MANAGE, subject: PermissionSubject.SETTINGS },
      ],
      audit: ({ result }) => ({
        action: 'team.removeTechnicianAccess',
        message: 'Removed a technician and revoked their access',
        metadata: { technicianId: result.technicianId, name: result.name },
      }),
    }
  )
}
