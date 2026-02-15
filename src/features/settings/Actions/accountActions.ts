"use server";

import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";
import { z } from "zod";

const updateEmailSchema = z.object({
  email: z.string().email("Invalid email address"),
});

export async function updateEmail(data: { email: string }) {
  return withAuth(async ({ userId }) => {
    const parsed = updateEmailSchema.parse(data);

    const existing = await db.user.findFirst({
      where: { email: parsed.email, NOT: { id: userId } },
    });

    if (existing) {
      throw new Error("Email is already in use");
    }

    await db.user.update({
      where: { id: userId },
      data: { email: parsed.email },
    });

    return { email: parsed.email };
  }, { requiredPermissions: [{ action: PermissionAction.UPDATE, subject: PermissionSubject.SETTINGS }] });
}
