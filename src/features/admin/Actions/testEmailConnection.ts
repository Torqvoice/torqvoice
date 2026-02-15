"use server";

import { withSuperAdmin } from "@/lib/with-super-admin";
import { db } from "@/lib/db";
import { sendMail } from "@/lib/email";
import { SYSTEM_SETTING_KEYS } from "../Schema/systemSettingsSchema";

export async function testEmailConnection() {
  return withSuperAdmin(async (ctx) => {
    const user = await db.user.findUnique({
      where: { id: ctx.userId },
      select: { email: true, name: true },
    });

    if (!user?.email) {
      throw new Error("Could not find your email address");
    }

    // Determine provider
    const providerSetting = await db.systemSetting.findUnique({
      where: { key: SYSTEM_SETTING_KEYS.EMAIL_PROVIDER },
    });
    const provider = providerSetting?.value === "resend" ? "resend" : "smtp";

    // Get from address based on provider
    let from: string;
    if (provider === "resend") {
      const fromSetting = await db.systemSetting.findUnique({
        where: { key: SYSTEM_SETTING_KEYS.RESEND_FROM_EMAIL },
      });
      const fromName = await db.systemSetting.findUnique({
        where: { key: SYSTEM_SETTING_KEYS.RESEND_FROM_NAME },
      });
      const fromEmail = fromSetting?.value || user.email;
      const senderName = fromName?.value || "Torqvoice";
      from = `${senderName} <${fromEmail}>`;
    } else {
      const fromSetting = await db.systemSetting.findUnique({
        where: { key: SYSTEM_SETTING_KEYS.SMTP_FROM_EMAIL },
      });
      const fromName = await db.systemSetting.findUnique({
        where: { key: SYSTEM_SETTING_KEYS.SMTP_FROM_NAME },
      });
      const fromEmail =
        fromSetting?.value || process.env.SMTP_FROM_EMAIL || user.email;
      const senderName = fromName?.value || "Torqvoice";
      from = `${senderName} <${fromEmail}>`;
    }

    await sendMail({
      from,
      to: user.email,
      subject: "Email Test - Torqvoice",
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2>Email Configuration Test</h2>
          <p>This is a test email from your Torqvoice platform.</p>
          <p>If you're reading this, your <strong>${provider.toUpperCase()}</strong> settings are configured correctly.</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;" />
          <p style="color: #6b7280; font-size: 12px;">
            Sent to: ${user.email}<br/>
            Provider: ${provider}<br/>
            Time: ${new Date().toISOString()}
          </p>
        </div>
      `,
    });

    return { sentTo: user.email };
  });
}
