"use server";

import { withSuperAdmin } from "@/lib/with-super-admin";
import { db } from "@/lib/db";
import { deleteUserSchema } from "../Schema/adminSchema";

export async function deleteUser(input: { userId: string }) {
  return withSuperAdmin(async (ctx) => {
    const { userId } = deleteUserSchema.parse(input);

    if (userId === ctx.userId) {
      throw new Error("Cannot delete your own account");
    }

    await db.user.delete({ where: { id: userId } });

    return { deleted: true };
  });
}
