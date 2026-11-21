'use server'

import { getTranslations } from 'next-intl/server'
import { auditDetails } from '@/lib/audit'
import { db } from '@/lib/db'
import { withSuperAdmin } from '@/lib/with-super-admin'
import { emailMatches } from '../Lib/emailMatches'
import { confirmedUserSchema } from '../Schema/adminSchema'

/**
 * Gives an account the run of the platform. `confirmEmail` is what the admin
 * typed into the confirmation, checked here too so that only a request from
 * that dialog, for that account, goes through.
 */
export async function grantSuperAdmin(input: { userId: string; confirmEmail: string }) {
  return withSuperAdmin(
    async (ctx) => {
      const { userId, confirmEmail } = confirmedUserSchema.parse(input)
      const t = await getTranslations('admin.accountActions.errors')

      if (userId === ctx.userId) throw new Error(t('changeSelf'))

      const user = await db.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, email: true },
      })
      if (!user) throw new Error(t('notFound'))
      if (!emailMatches(confirmEmail, user.email)) throw new Error(t('emailMismatch'))

      await db.user.update({ where: { id: userId }, data: { isSuperAdmin: true } })

      return user
    },
    {
      audit: (user) => ({
        action: 'platform.grantSuperAdmin',
        entity: 'user',
        entityId: user.id,
        details: auditDetails('platform_grantSuperAdmin', { name: user.name, email: user.email }),
      }),
    }
  )
}
