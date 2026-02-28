'use server'

import { db } from '@/lib/db'
import { withAuth } from '@/lib/with-auth'
import { deleteUserOrganizations } from '@/lib/delete-user-data'

export async function deleteAccount() {
  return withAuth(async ({ userId }) => {
    // Get user email to clean up invitations
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { email: true },
    })

    // Handle all org cleanup (delete empty orgs, reassign data in shared orgs)
    await deleteUserOrganizations(userId)

    // Delete the user — cascades sessions, accounts, 2FA
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
  })
}
