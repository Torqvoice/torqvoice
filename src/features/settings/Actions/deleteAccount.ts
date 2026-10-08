'use server'

import { db } from '@/lib/db'
import { withAuth } from '@/lib/with-auth'
import { deleteUserOrganizations } from '@/lib/delete-user-data'
import { demoGuard } from '@/lib/demo'
import { verifyReauth } from '@/lib/reauth.server'

/**
 * Deletes the caller's account, and every workshop they are the only member
 * of. `input` carries the password, or the two-factor code, that
 * verifyReauth asks for: a session on its own is not enough to destroy this
 * much (see lib/reauth.server.ts).
 */
export async function deleteAccount(input: { password?: string; totpCode?: string } = {}) {
  return withAuth(
    async ({ userId }) => {
      demoGuard()
      await verifyReauth(userId, input, 'account')

      // Get user email to clean up invitations
      const user = await db.user.findUnique({
        where: { id: userId },
        select: { email: true },
      })

      // Handle all org cleanup (delete empty orgs, reassign data in shared orgs)
      await deleteUserOrganizations(userId)

      // Delete the user, which cascades sessions, accounts and 2FA
      await db.user.delete({
        where: { id: userId },
      })

      // Clean up invitations for this email
      if (user?.email) {
        await db.teamInvitation.deleteMany({
          where: { email: user.email },
        })
      }

      return { deleted: true }
    },
    { accountLevel: true }
  )
}
