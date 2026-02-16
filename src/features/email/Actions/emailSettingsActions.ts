"use server";

import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { revalidatePath } from "next/cache";
import { ALL_ORG_EMAIL_KEYS } from "../Schema/emailSettingsSchema";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";
import { sendOrgMail, getOrgFromAddress } from "@/lib/email";

export async function getEmailSettings() {
  return withAuth(
    async ({ organizationId }) => {
      const settings = await db.appSetting.findMany({
        where: { organizationId, key: { in: ALL_ORG_EMAIL_KEYS } },
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

export async function setEmailSettings(entries: Record<string, string>) {
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
      revalidatePath("/settings/email");
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

export async function testOrgEmailConnection() {
  return withAuth(
    async ({ userId, organizationId }) => {
      const user = await db.user.findUnique({
        where: { id: userId },
        select: { email: true },
      });

      if (!user?.email) {
        throw new Error("Could not find your email address");
      }

      const from = await getOrgFromAddress(organizationId);

      await sendOrgMail(organizationId, {
        from,
        to: user.email,
        subject: "Email Test - Torqvoice",
        html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
            <h2>Email Configuration Test</h2>
            <p>This is a test email from your organization's email settings.</p>
            <p>If you're reading this, your email provider is configured correctly.</p>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;" />
            <p style="color: #6b7280; font-size: 12px;">
              Sent to: ${user.email}<br/>
              Time: ${new Date().toISOString()}
            </p>
          </div>
        `,
      });

      return { sentTo: user.email };
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
