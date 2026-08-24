'use server'

import { withSuperAdmin } from '@/lib/with-super-admin'
import { db } from '@/lib/db'
import { demoGuard } from '@/lib/demo'
import { toggleSuperAdminSchema } from '../Schema/adminSchema'

export async function toggleSuperAdmin(input: { userId: string; isSuperAdmin: boolean }) {
  return withSuperAdmin(async (ctx) => {
    // Granting platform-wide admin is the one thing in here worth refusing
    // twice, so it refuses alongside deleteUser and deleteOrganization rather
    // than resting on the demo owner never being a super admin.
    demoGuard()

    const { userId, isSuperAdmin } = toggleSuperAdminSchema.parse(input)

    if (userId === ctx.userId) {
      throw new Error('Cannot modify your own super admin status')
    }

    const user = await db.user.update({
      where: { id: userId },
      data: { isSuperAdmin },
      select: { id: true, name: true, isSuperAdmin: true },
    })

    return user
  })
}
