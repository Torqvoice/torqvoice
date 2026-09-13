'use server'

import { withSuperAdmin } from '@/lib/with-super-admin'
import { db } from '@/lib/db'

export async function getAdminStats() {
  return withSuperAdmin(async () => {
    const [totalUsers, totalOrganizations, totalActiveSubscriptions] = await Promise.all([
      db.user.count(),
      db.organization.count(),
      db.subscription.count({ where: { status: 'active' } }),
    ])

    return {
      totalUsers,
      totalOrganizations,
      totalActiveSubscriptions,
    }
  })
}
