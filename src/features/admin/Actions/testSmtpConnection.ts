"use server";

import { withSuperAdmin } from "@/lib/with-super-admin";
import { db } from "@/lib/db";
import { sendMail } from "@/lib/email";
import { SYSTEM_SETTING_KEYS } from "../Schema/systemSettingsSchema";

export async function testSmtpConnection() {
  return withSuperAdmin(async (ctx) => {
    const user = await db.user.findUnique({
      where: { id: ctx.userId },
      select: { email: true, name: true },
    });

    if (!user?.email) {
      throw new Error("Could not find your email address");
    }

    // Get the from email from system settings, fall back to env var
    const fromSetting = await db.systemSetting.findUnique({
      where: { key: SYSTEM_SETTING_KEYS.SMTP_FROM_EMAIL },
    });
    const fromName = await db.systemSetting.findUnique({
      where: { key: SYSTEM_SETTING_KEYS.SMTP_FROM_NAME },
    });

    const from = fromSetting?.value || process.env.SMTP_FROM_EMAIL || user.email;
    const senderName = fromName?.value || "Torqvoice";

    await sendMail({
      from: `${senderName} <${from}>`,
      to: user.email,
      subject: "SMTP Test - Torqvoice",
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2>SMTP Configuration Test</h2>
          <p>This is a test email from your Torqvoice platform.</p>
          <p>If you're reading this, your SMTP settings are configured correctly.</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;" />
          <p style="color: #6b7280; font-size: 12px;">
            Sent to: ${user.email}<br/>
            Time: ${new Date().toISOString()}
          </p>
        </div>
      `,
    });

    return { sentTo: user.email };
  });
}
