"use server";

import { withSuperAdmin } from "@/lib/with-super-admin";
import { db } from "@/lib/db";
import { toggleSuperAdminSchema } from "../Schema/adminSchema";

export async function toggleSuperAdmin(input: { userId: string; isSuperAdmin: boolean }) {
  return withSuperAdmin(async (ctx) => {
    const { userId, isSuperAdmin } = toggleSuperAdminSchema.parse(input);

    if (userId === ctx.userId) {
      throw new Error("Cannot modify your own super admin status");
    }

    const user = await db.user.update({
      where: { id: userId },
      data: { isSuperAdmin },
      select: { id: true, name: true, isSuperAdmin: true },
    });

    return user;
  });
}
