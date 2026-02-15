"use server";

import { withSuperAdmin } from "@/lib/with-super-admin";
import { db } from "@/lib/db";
import { ALL_SYSTEM_KEYS } from "../Schema/systemSettingsSchema";
import type { SystemSettingsMap } from "../Schema/systemSettingsSchema";

export async function getSystemSettings() {
  return withSuperAdmin(async () => {
    const settings = await db.systemSetting.findMany({
      where: { key: { in: ALL_SYSTEM_KEYS } },
    });

    const map: SystemSettingsMap = {};
    for (const s of settings) {
      map[s.key as keyof SystemSettingsMap] = s.value;
    }

    return map;
  });
}
