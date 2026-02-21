"use server";

import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { revalidatePath } from "next/cache";
import { ALL_ORG_SMS_KEYS, ORG_SMS_KEYS } from "../Schema/smsSettingsSchema";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";
import { sendOrgSms } from "@/lib/sms";

export async function getSmsSettings() {
  return withAuth(
    async ({ organizationId }) => {
      const settings = await db.appSetting.findMany({
        where: { organizationId, key: { in: ALL_ORG_SMS_KEYS } },
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

export async function setSmsSettings(entries: Record<string, string>) {
  return withAuth(
    async ({ userId, organizationId }) => {
      // Auto-generate webhook secret if not already set
      const existing = await db.appSetting.findUnique({
        where: {
          organizationId_key: {
            organizationId,
            key: ORG_SMS_KEYS.SMS_WEBHOOK_SECRET,
          },
        },
      });

      if (!existing?.value) {
        entries[ORG_SMS_KEYS.SMS_WEBHOOK_SECRET] = randomBytes(24).toString("hex");
      }

      await db.$transaction(
        Object.entries(entries).map(([key, value]) =>
          db.appSetting.upsert({
            where: { organizationId_key: { organizationId, key } },
            update: { value },
            create: { userId, organizationId, key, value },
          }),
        ),
      );
      revalidatePath("/settings/sms");
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

export async function testSmsSend(testPhone: string) {
  return withAuth(
    async ({ organizationId }) => {
      if (!testPhone?.trim()) {
        throw new Error("Please enter a phone number to send the test SMS to");
      }

      await sendOrgSms(organizationId, {
        to: testPhone.trim(),
        body: "SMS test from Torqvoice — your SMS provider is configured correctly.",
      });

      return { sentTo: testPhone.trim() };
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
