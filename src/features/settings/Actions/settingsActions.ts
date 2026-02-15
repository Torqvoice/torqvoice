"use server";

import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { revalidatePath } from "next/cache";
import type { SettingKey } from "../Schema/settingsSchema";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";

export async function getSetting(key: SettingKey) {
  return withAuth(async ({ userId, organizationId }) => {
    const setting = await db.appSetting.findUnique({
      where: { organizationId_key: { organizationId, key } },
    });
    return setting?.value ?? null;
  }, { requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.SETTINGS }] });
}

export async function getSettings(keys?: SettingKey[]) {
  return withAuth(async ({ userId, organizationId }) => {
    const where = keys
      ? { organizationId, key: { in: keys } }
      : { organizationId };

    const settings = await db.appSetting.findMany({ where });

    const map: Record<string, string> = {};
    for (const s of settings) {
      map[s.key] = s.value;
    }
    return map;
  }, { requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.SETTINGS }] });
}

export async function setSetting(key: SettingKey, value: string) {
  return withAuth(async ({ userId, organizationId }) => {
    const setting = await db.appSetting.upsert({
      where: { organizationId_key: { organizationId, key } },
      update: { value },
      create: { userId, organizationId, key, value },
    });
    revalidatePath("/settings");
    return setting;
  }, { requiredPermissions: [{ action: PermissionAction.UPDATE, subject: PermissionSubject.SETTINGS }] });
}

export async function setSettings(entries: Record<string, string>) {
  return withAuth(async ({ userId, organizationId }) => {
    await db.$transaction(
      Object.entries(entries).map(([key, value]) =>
        db.appSetting.upsert({
          where: { organizationId_key: { organizationId, key } },
          update: { value },
          create: { userId, organizationId, key, value },
        })
      )
    );
    revalidatePath("/settings");
    return true;
  }, { requiredPermissions: [{ action: PermissionAction.UPDATE, subject: PermissionSubject.SETTINGS }] });
}
