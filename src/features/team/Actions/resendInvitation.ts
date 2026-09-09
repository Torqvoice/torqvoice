'use server'

import { randomUUID } from 'crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db'
import { demoGuard } from '@/lib/demo'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { withAuth } from '@/lib/with-auth'
import { sendInvitationMail } from '../Lib/createInvitation'

const resendInvitationSchema = z.object({ invitationId: z.string().min(1).max(64) })

/**
 * Mails a pending invitation again, with a fresh link.
 *
 * The old link is retired at the same time: the token never leaves the
 * server, so a fresh one on every resend costs nothing, and a link that
 * went astray in a mailbox stops working the moment a new one is sent.
 * Seven more days from now, the same as a new invitation.
 */
export async function resendInvitation(input: unknown) {
  return withAuth(
    async ({ organizationId, isAdmin }) => {
      demoGuard()
      if (!isAdmin) throw new Error('Only owners and admins can resend invitations')
      const data = resendInvitationSchema.parse(input)

      const invitation = await db.teamInvitation.findFirst({
        where: { id: data.invitationId, organizationId, status: 'pending' },
        include: {
          organization: { select: { name: true } },
          customRole: { select: { name: true } },
        },
      })
      if (!invitation) throw new Error('Invitation not found')

      const token = randomUUID()
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      await db.teamInvitation.update({
        where: { id: invitation.id },
        data: { token, expiresAt },
      })

      await sendInvitationMail({
        organizationId,
        organizationName: invitation.organization.name,
        email: invitation.email,
        roleLabel: invitation.customRole?.name || invitation.role,
        token,
      })

      revalidatePath('/settings/team')
      return { resent: true, invitationId: invitation.id, email: invitation.email }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.MANAGE, subject: PermissionSubject.SETTINGS },
      ],
      audit: ({ result }) => ({
        action: 'team.resendInvitation',
        entity: 'TeamInvitation',
        entityId: result.invitationId,
        details: { key: 'team_resendInvitation', params: { email: result.email } },
        metadata: { invitationId: result.invitationId, email: result.email },
      }),
    }
  )
}
