'use server'

import { getTranslations } from 'next-intl/server'
import { auditDetails } from '@/lib/audit'
import { db } from '@/lib/db'
import { withSuperAdmin } from '@/lib/with-super-admin'
import { userIdSchema } from '../Schema/adminSchema'

/** Takes the platform rights back from an account. Never from the last one that has them. */
export async function revokeSuperAdmin(input: { userId: string }) {
  return withSuperAdmin(
    async (ctx) => {
      const { userId } = userIdSchema.parse(input)
      const t = await getTranslations('admin.accountActions.errors')

      if (userId === ctx.userId) throw new Error(t('changeSelf'))

      const user = await db.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, email: true },
      })
      if (!user) throw new Error(t('notFound'))

      // The caller is one and cannot be the target, so this cannot be reached
      // today. It is here so the platform keeps an admin whatever changes
      // around it.
      const others = await db.user.count({ where: { isSuperAdmin: true, NOT: { id: userId } } })
      if (others === 0) throw new Error(t('lastSuperAdmin'))

      await db.user.update({ where: { id: userId }, data: { isSuperAdmin: false } })

      return user
    },
    {
      audit: (user) => ({
        action: 'platform.revokeSuperAdmin',
        entity: 'user',
        entityId: user.id,
        details: auditDetails('platform_revokeSuperAdmin', { name: user.name, email: user.email }),
      }),
    }
  )
}
