"use server";

import { withSuperAdmin } from "@/lib/with-super-admin";
import { db } from "@/lib/db";
import {
  systemSettingsUpdateSchema,
  ALL_SYSTEM_KEYS,
} from "../Schema/systemSettingsSchema";

export async function setSystemSettings(input: Record<string, string>) {
  return withSuperAdmin(async () => {
    const data = systemSettingsUpdateSchema.parse(input);

    // Only allow known keys, filter out license.* (readonly)
    const entries = Object.entries(data).filter(([key]) => {
      if (!ALL_SYSTEM_KEYS.includes(key as (typeof ALL_SYSTEM_KEYS)[number]))
        return false;
      if (key.startsWith("license.")) return false;
      return true;
    });

    await db.$transaction(
      entries.map(([key, value]) =>
        db.systemSetting.upsert({
          where: { key },
          update: { value },
          create: { key, value },
        }),
      ),
    );

    return { updated: entries.length };
  });
}
