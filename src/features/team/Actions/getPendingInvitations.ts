'use server'

import { db } from '@/lib/db'
import { withAuth } from '@/lib/with-auth'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { pendingInvitationSelect } from '../Lib/invitationRules'

export async function getPendingInvitations() {
  return withAuth(
    async ({ organizationId }) => {
      const invitations = await db.teamInvitation.findMany({
        where: {
          organizationId,
          status: 'pending',
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: 'desc' },
        select: pendingInvitationSelect,
      })

      return invitations
    },
    {
      requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.SETTINGS }],
    }
  )
}
