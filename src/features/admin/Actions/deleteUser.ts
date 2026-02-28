'use server'

import { withSuperAdmin } from '@/lib/with-super-admin'
import { db } from '@/lib/db'
import { deleteUserOrganizations } from '@/lib/delete-user-data'
import { deleteUserSchema } from '../Schema/adminSchema'

export async function deleteUser(input: { userId: string }) {
  return withSuperAdmin(async (ctx) => {
    const { userId } = deleteUserSchema.parse(input)

    if (userId === ctx.userId) {
      throw new Error('Cannot delete your own account')
    }

    // Get user email to clean up invitations
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { email: true },
    })

    // Handle all org cleanup (delete empty orgs, reassign data in shared orgs)
    await deleteUserOrganizations(userId)

    // Delete the user — cascades sessions, accounts, 2FA
    await db.user.delete({ where: { id: userId } })

    // Clean up invitations for this email
    if (user?.email) {
      await db.teamInvitation.deleteMany({
        where: { email: user.email },
      })
    }

    return { deleted: true }
  })
}
