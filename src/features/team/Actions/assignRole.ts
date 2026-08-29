'use server'

import { db } from '@/lib/db'
import { withAuth } from '@/lib/with-auth'
import { assignRoleSchema } from '../Schema/teamSchema'
import { revalidatePath } from 'next/cache'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { setTechnicianStanding } from '../Lib/technicianStanding'
import {
  ensureTechnicianRole,
  TECHNICIAN_ROLE_NAME,
  TECHNICIAN_ROLE_VALUE,
} from '../Lib/technicianRole'

export async function assignRole(input: unknown) {
  return withAuth(
    async ({ organizationId, isAdmin }) => {
      if (!isAdmin) {
        throw new Error('Only owners and admins can assign roles')
      }
      const data = assignRoleSchema.parse(input)

      const member = await db.organizationMember.findFirst({
        where: { id: data.memberId, organizationId },
      })
      if (!member) throw new Error('Member not found')
      if (member.role === 'owner') throw new Error('Cannot assign a role to the owner')

      if (data.roleId) {
        const roleExists = await db.role.findFirst({
          where: { id: data.roleId, organizationId },
        })
        if (!roleExists) throw new Error('Role not found')
      }

      /**
       * Technician is one answer to one question, not two settings to keep in
       * step.
       *
       * It used to be a toggle beside this dropdown, so the desk had to say
       * "works jobs" in one place and "is allowed to do the work" in another,
       * and getting either half wrong produced an app that answered "Your role
       * does not allow this" to every screen. Saying it once here does both:
       * the technician record the work board and the app read, and the
       * permissions the API checks.
       */
      /**
       * The role decides what they may do. Whether they work jobs is the
       * switch beside it, and this no longer answers that question for them.
       *
       * It used to: choosing any role other than Technician deactivated their
       * technician record, so a desk person who also turns spanners could not
       * exist. You could have the permissions to run the office or a place on
       * the board, never both, and the only account that escaped it was the
       * owner, because this action refuses to touch an owner at all.
       *
       * Now it is one way. Picking the technician role puts them on the board,
       * because that is plainly what was meant. Picking anything else leaves
       * the board alone.
       */
      const technicianRole = await db.role.findFirst({
        where: { organizationId, name: TECHNICIAN_ROLE_NAME },
        select: { id: true },
      })
      // `technician` as a role word is kept for callers that still send it,
      // though the team page now picks the role by id like any other.
      const byWord = data.role === TECHNICIAN_ROLE_VALUE
      const byId = Boolean(data.roleId && data.roleId === technicianRole?.id)
      const asTechnician = byWord || byId

      await db.organizationMember.update({
        where: { id: data.memberId },
        data: {
          // `technician` is ours, not one of Better Auth's built-in three, so
          // the stored role stays `member` and the custom role carries it.
          ...(data.role && { role: byWord ? 'member' : data.role }),
          roleId: byWord ? await ensureTechnicianRole(db, organizationId) : (data.roleId ?? null),
        },
      })

      const technician = asTechnician
        ? await setTechnicianStanding(organizationId, member.userId, true, member.userId)
        : null

      revalidatePath('/settings/team')
      revalidatePath('/work-board')
      return { assigned: true, isTechnician: asTechnician, technicianId: technician }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.MANAGE, subject: PermissionSubject.SETTINGS },
      ],
    }
  )
}
