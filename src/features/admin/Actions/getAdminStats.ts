"use server";

import { withSuperAdmin } from "@/lib/with-super-admin";
import { db } from "@/lib/db";

export async function getAdminStats() {
  return withSuperAdmin(async () => {
    const [totalUsers, totalOrganizations, totalActiveSubscriptions, activeSubscriptions] =
      await Promise.all([
        db.user.count(),
        db.organization.count(),
        db.subscription.count({ where: { status: "active" } }),
        db.subscription.findMany({
          where: { status: "active" },
          select: { plan: { select: { price: true } } },
        }),
      ]);

    const totalRevenue = activeSubscriptions.reduce(
      (sum, sub) => sum + sub.plan.price,
      0
    );

    return {
      totalUsers,
      totalOrganizations,
      totalActiveSubscriptions,
      totalRevenue,
    };
  });
}
