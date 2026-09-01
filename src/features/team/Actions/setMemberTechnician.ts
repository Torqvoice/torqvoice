'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db'
import { notificationBus } from '@/lib/notification-bus'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { withAuth } from '@/lib/with-auth'
import { ensureTechnicianRole } from '../Lib/technicianRole'

/**
 * Marks a team member as a technician, or stops doing so.
 *
 * The work board's technician dialog is the full editor: colour, capacity, and
 * technicians who have no login at all. This is the other half of the same
 * idea, put where someone actually looks for it. A shop owner adding a
 * mechanic to the team expects to say "this person works jobs" on the screen
 * where they added them, not to discover that the setting lives on a
 * scheduling board they may never have opened.
 *
 * It also gates the technician app: without a linked technician row, signing in
 * there gets "not set up as a technician" and nothing else.
 */

const schema = z.object({
  userId: z.string().min(1),
  enabled: z.boolean(),
})

export async function setMemberTechnician(input: unknown) {
  return withAuth(
    async ({ organizationId }) => {
      const { userId, enabled } = schema.parse(input)

      // Only for people already in this workshop. Without this check the
      // action would happily mint a technician for any user id sent to it.
      const member = await db.organizationMember.findFirst({
        where: { userId, organizationId },
        select: { user: { select: { id: true, name: true, email: true } } },
      })
      if (!member?.user) throw new Error('That person is not a member of this workshop.')

      const existing = await db.technician.findFirst({
        where: { userId, organizationId },
        select: { id: true, isActive: true },
      })

      // Being a technician and being allowed to use the app are two different
      // facts, and the desk has no reason to know that. withApiAuth enforces
      // permissions exactly as the web app does, so a member with no role is
      // refused by every screen in the technician app: the switch would go on
      // and nothing would work.
      //
      // Only when they have no role at all. A role somebody chose by hand is a
      // decision, and quietly widening it here would undo it.
      if (enabled) {
        const membership = await db.organizationMember.findFirst({
          where: { userId, organizationId },
          select: { id: true, roleId: true, role: true },
        })
        const isOwnerOrAdmin = membership?.role === 'owner' || membership?.role === 'admin'
        if (membership && !membership.roleId && !isOwnerOrAdmin) {
          await db.organizationMember.update({
            where: { id: membership.id },
            data: { roleId: await ensureTechnicianRole(db, organizationId) },
          })
        }
      }

      if (!enabled) {
        // Deactivated, never deleted. The row is what past jobs, inspections
        // and status reports point at, so removing it would rewrite history to
        // say nobody did the work. Deactivating takes them off the board and
        // out of the app while leaving every record intact, and keeps the row
        // findable if they are switched back on later.
        if (!existing) return { technicianId: null, isActive: false }

        const technician = await db.technician.update({
          where: { id: existing.id },
          data: { isActive: false },
        })
        notificationBus.emit('workboard', {
          type: 'technician_updated',
          organizationId,
          technician,
        })
        revalidatePath('/settings/team')
        revalidatePath('/work-board')
        return { technicianId: technician.id, isActive: false }
      }

      if (existing) {
        const technician = await db.technician.update({
          where: { id: existing.id },
          data: { isActive: true },
        })
        notificationBus.emit('workboard', {
          type: 'technician_updated',
          organizationId,
          technician,
        })
        revalidatePath('/settings/team')
        revalidatePath('/work-board')
        return { technicianId: technician.id, isActive: true }
      }

      const maxOrder = await db.technician.aggregate({
        where: { organizationId },
        _max: { sortOrder: true },
      })

      const technician = await db.technician.create({
        data: {
          // Named from the account, and the colour left at the default. Both
          // are worth setting properly on the board; neither is worth asking
          // about on a screen where the question is simply yes or no.
          name: member.user.name || member.user.email,
          userId,
          sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
          organizationId,
        },
      })

      notificationBus.emit('workboard', {
        type: 'technician_created',
        organizationId,
        technician,
      })
      revalidatePath('/settings/team')
      revalidatePath('/work-board')
      return { technicianId: technician.id, isActive: true }
    },
    {
      // Managing who counts as a technician is a team decision, so it sits
      // behind the team permission rather than the work board's.
      requiredPermissions: [
        { action: PermissionAction.MANAGE, subject: PermissionSubject.SETTINGS },
      ],
      audit: ({ result }) => ({
        action: 'team.setMemberTechnician',
        message: result.isActive
          ? 'Marked a member as a technician'
          : 'Removed a member as a technician',
        metadata: { technicianId: result.technicianId, isActive: result.isActive },
      }),
    }
  )
}

/** User ids in this workshop that already have an active technician row. */
export async function getTechnicianUserIds() {
  return withAuth(
    async ({ organizationId }) => {
      const rows = await db.technician.findMany({
        where: { organizationId, isActive: true, userId: { not: null } },
        select: { userId: true },
      })
      return rows.map((r) => r.userId as string)
    },
    {
      requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.SETTINGS }],
    }
  )
}
