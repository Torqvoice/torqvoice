'use server'

import { db } from '@/lib/db'
import { withAuth } from '@/lib/with-auth'
import { sendInvitationSchema } from '../Schema/teamSchema'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { revalidatePath } from 'next/cache'
import { demoGuard } from '@/lib/demo'
import { canInvite } from '../Lib/invitationRules'
import { createAndSendInvitation } from '../Lib/createInvitation'

export async function sendInvitation(input: unknown) {
  return withAuth(
    async ({ userId, organizationId, role, isAdmin }) => {
      demoGuard()
      const data = sendInvitationSchema.parse(input)

      // MANAGE:SETTINGS can sit on a custom role that is not an admin role, so
      // the permission alone is not enough to bring people in, and only the
      // owner hands out admin.
      const decision = canInvite({ role, isAdmin }, data.role)
      if (!decision.ok) throw new Error(decision.reason)

      const membership = await db.organizationMember.findFirst({
        where: { userId, organizationId },
        include: { organization: true },
      })
      if (!membership) throw new Error("You don't belong to an organization")

      await createAndSendInvitation({
        organizationId,
        organizationName: membership.organization.name,
        invitedById: userId,
        email: data.email,
        role: data.role,
        roleId: data.roleId,
      })

      revalidatePath('/settings/team')
      return { invited: true, pending: true, email: data.email, role: data.role }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.MANAGE, subject: PermissionSubject.SETTINGS },
      ],
      audit: ({ result }) => ({
        action: 'team.sendInvitation',
        entity: 'TeamInvitation',
        details: { key: 'team_sendInvitation', params: { email: result.email, role: result.role } },
        metadata: { email: result.email, role: result.role },
      }),
    }
  )
}
