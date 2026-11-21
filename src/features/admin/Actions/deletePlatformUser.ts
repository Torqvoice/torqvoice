'use server'

import { getTranslations } from 'next-intl/server'
import { auditDetails } from '@/lib/audit'
import { db } from '@/lib/db'
import { deleteUserOrganizations } from '@/lib/delete-user-data'
import { demoGuard } from '@/lib/demo'
import { withSuperAdmin } from '@/lib/with-super-admin'
import { emailMatches } from '../Lib/emailMatches'
import { withPlatformAccountLock } from '../Lib/platformAccountLock'
import { confirmedUserSchema } from '../Schema/adminSchema'

/**
 * Deletes an account from the platform admin console.
 *
 * `confirmEmail` is what the admin typed into the confirmation. Checking it
 * here as well means a request that did not come through that dialog (a tab
 * left open on another account, a replayed call) removes nobody.
 */
export async function deletePlatformUser(input: { userId: string; confirmEmail: string }) {
  let target = { id: '', name: '', email: '' }
  return withSuperAdmin(
    async (ctx) => {
      demoGuard()
      const { userId, confirmEmail } = confirmedUserSchema.parse(input)
      // Said to whoever is signed in, so in their language.
      const t = await getTranslations('admin.accountActions.errors')

      if (userId === ctx.userId) throw new Error(t('deleteSelf'))

      return withPlatformAccountLock(
        ctx.userId,
        async () => {
          const user = await db.user.findUnique({
            where: { id: userId },
            select: { id: true, name: true, email: true, isSuperAdmin: true },
          })
          if (!user) throw new Error(t('notFound'))
          // Two deliberate steps to remove somebody who runs the platform.
          if (user.isSuperAdmin) throw new Error(t('deleteSuperAdmin'))
          if (!emailMatches(confirmEmail, user.email)) throw new Error(t('emailMismatch'))
          target = { id: user.id, name: user.name, email: user.email }

          // Handle all org cleanup (delete empty orgs, reassign data in shared orgs)
          await deleteUserOrganizations(userId)

          // Delete the user: cascades sessions, accounts, 2FA
          await db.user.delete({ where: { id: userId } })

          await db.teamInvitation.deleteMany({ where: { email: user.email } })

          return { deleted: true }
        },
        120_000
      )
    },
    {
      audit: () => ({
        action: 'platform.deleteUser',
        entity: 'user',
        entityId: target.id,
        details: auditDetails('platform_deleteUser', { name: target.name, email: target.email }),
      }),
    }
  )
}
