'use server'

import { withSuperAdmin } from '@/lib/with-super-admin'
import { db } from '@/lib/db'
import { monthlyPlanPrice } from '@/lib/plan-pricing'

export async function getAdminStats() {
  return withSuperAdmin(async () => {
    const [totalUsers, totalOrganizations, totalActiveSubscriptions, activeSubscriptions] =
      await Promise.all([
        db.user.count(),
        db.organization.count(),
        db.subscription.count({ where: { status: 'active' } }),
        db.subscription.findMany({
          where: { status: 'active' },
          select: { plan: { select: { price: true, interval: true } } },
        }),
      ])

    // Yearly plans are the common case, so their price has to come down to a
    // month before it can be added to the monthly total.
    const totalRevenue = activeSubscriptions.reduce(
      (sum, sub) => sum + monthlyPlanPrice(sub.plan.price, sub.plan.interval),
      0
    )

    return {
      totalUsers,
      totalOrganizations,
      totalActiveSubscriptions,
      totalRevenue,
    }
  })
}
