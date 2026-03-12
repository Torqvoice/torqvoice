"use server";

import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { revalidatePath } from "next/cache";
import { ALL_AI_KEYS } from "../Schema/aiSettingsSchema";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";

export async function getAiSettings() {
  return withAuth(
    async ({ organizationId }) => {
      const settings = await db.appSetting.findMany({
        where: { organizationId, key: { in: ALL_AI_KEYS } },
      });
      const map: Record<string, string> = {};
      for (const s of settings) {
        map[s.key] = s.value;
      }
      return map;
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.SETTINGS },
      ],
    },
  );
}

export async function setAiSettings(entries: Record<string, string>) {
  return withAuth(
    async ({ userId, organizationId }) => {
      await db.$transaction(
        Object.entries(entries).map(([key, value]) =>
          db.appSetting.upsert({
            where: { organizationId_key: { organizationId, key } },
            update: { value },
            create: { userId, organizationId, key, value },
          }),
        ),
      );
      revalidatePath("/settings/ai");
      return true;
    },
    {
      requiredPermissions: [
        {
          action: PermissionAction.UPDATE,
          subject: PermissionSubject.SETTINGS,
        },
      ],
    },
  );
}
