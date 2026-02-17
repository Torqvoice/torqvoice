"use server";

import { withAuth } from "@/lib/with-auth";
import { db } from "@/lib/db";
import { SETTING_KEYS } from "../Schema/settingsSchema";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";
import { revalidatePath } from "next/cache";

export async function validateLicense(licenseKey: string) {
  return withAuth(
    async (ctx) => {
      const key = licenseKey.trim();
      if (!key) {
        throw new Error("License key is required");
      }

      let valid = false;
      let plan = "free";
      let expiresAt = "";

      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_TORQVOICE_COM_URL || "https://torqvoice.com"}/api/license/validate`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ key, organizationId: ctx.organizationId }),
            signal: AbortSignal.timeout(10000),
          },
        );

        if (response.ok) {
          const data = await response.json();
          valid = data.valid === true;
          if (valid && data.plan) {
            plan = data.plan;
          }
          if (data.expiresAt) {
            expiresAt = data.expiresAt;
          }
        }
      } catch {
        // API unreachable — fall back to cached result
        const cached = await db.appSetting.findMany({
          where: {
            organizationId: ctx.organizationId,
            key: {
              in: [
                SETTING_KEYS.LICENSE_VALID,
                SETTING_KEYS.LICENSE_PLAN,
                SETTING_KEYS.LICENSE_EXPIRES_AT,
              ],
            },
          },
          select: { key: true, value: true },
        });
        for (const setting of cached) {
          if (setting.key === SETTING_KEYS.LICENSE_VALID) {
            valid = setting.value === "true";
          }
          if (setting.key === SETTING_KEYS.LICENSE_PLAN) {
            plan = setting.value;
          }
          if (setting.key === SETTING_KEYS.LICENSE_EXPIRES_AT) {
            expiresAt = setting.value;
          }
        }
      }

      const now = new Date().toISOString();

      await db.$transaction([
        db.appSetting.upsert({
          where: {
            organizationId_key: {
              organizationId: ctx.organizationId,
              key: SETTING_KEYS.LICENSE_KEY,
            },
          },
          update: { value: key },
          create: {
            userId: ctx.userId,
            organizationId: ctx.organizationId,
            key: SETTING_KEYS.LICENSE_KEY,
            value: key,
          },
        }),
        db.appSetting.upsert({
          where: {
            organizationId_key: {
              organizationId: ctx.organizationId,
              key: SETTING_KEYS.LICENSE_VALID,
            },
          },
          update: { value: String(valid) },
          create: {
            userId: ctx.userId,
            organizationId: ctx.organizationId,
            key: SETTING_KEYS.LICENSE_VALID,
            value: String(valid),
          },
        }),
        db.appSetting.upsert({
          where: {
            organizationId_key: {
              organizationId: ctx.organizationId,
              key: SETTING_KEYS.LICENSE_CHECKED_AT,
            },
          },
          update: { value: now },
          create: {
            userId: ctx.userId,
            organizationId: ctx.organizationId,
            key: SETTING_KEYS.LICENSE_CHECKED_AT,
            value: now,
          },
        }),
        db.appSetting.upsert({
          where: {
            organizationId_key: {
              organizationId: ctx.organizationId,
              key: SETTING_KEYS.LICENSE_PLAN,
            },
          },
          update: { value: plan },
          create: {
            userId: ctx.userId,
            organizationId: ctx.organizationId,
            key: SETTING_KEYS.LICENSE_PLAN,
            value: plan,
          },
        }),
        ...(expiresAt
          ? [
              db.appSetting.upsert({
                where: {
                  organizationId_key: {
                    organizationId: ctx.organizationId,
                    key: SETTING_KEYS.LICENSE_EXPIRES_AT,
                  },
                },
                update: { value: expiresAt },
                create: {
                  userId: ctx.userId,
                  organizationId: ctx.organizationId,
                  key: SETTING_KEYS.LICENSE_EXPIRES_AT,
                  value: expiresAt,
                },
              }),
            ]
          : []),
      ]);

      revalidatePath("/settings");

      return { valid, plan };
    },
    { requiredPermissions: [{ action: PermissionAction.UPDATE, subject: PermissionSubject.SETTINGS }] },
  );
}
