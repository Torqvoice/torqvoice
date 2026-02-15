import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { twoFactor } from "better-auth/plugins/two-factor";
import { db } from "./db";

const baseURL = process.env.NEXT_PUBLIC_APP_URL;
const isProduction = baseURL?.startsWith("https://");

export const auth = betterAuth({
  baseURL,
  trustedOrigins: baseURL ? [baseURL] : [],
  database: prismaAdapter(db, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
    sendResetPassword: async ({ user, url }) => {
      const { SYSTEM_SETTING_KEYS } = await import(
        "@/features/admin/Schema/systemSettingsSchema"
      );

      // Determine provider and get from address
      const providerSetting = await db.systemSetting.findUnique({
        where: { key: SYSTEM_SETTING_KEYS.EMAIL_PROVIDER },
      });
      const provider =
        providerSetting?.value === "resend" ? "resend" : "smtp";

      let fromEmail: string;
      let fromName: string;

      if (provider === "resend") {
        const emailSetting = await db.systemSetting.findUnique({
          where: { key: SYSTEM_SETTING_KEYS.RESEND_FROM_EMAIL },
        });
        const nameSetting = await db.systemSetting.findUnique({
          where: { key: SYSTEM_SETTING_KEYS.RESEND_FROM_NAME },
        });
        fromEmail = emailSetting?.value || "noreply@example.com";
        fromName = nameSetting?.value || "Torqvoice";
      } else {
        const emailSetting = await db.systemSetting.findUnique({
          where: { key: SYSTEM_SETTING_KEYS.SMTP_FROM_EMAIL },
        });
        const nameSetting = await db.systemSetting.findUnique({
          where: { key: SYSTEM_SETTING_KEYS.SMTP_FROM_NAME },
        });
        fromEmail =
          emailSetting?.value ||
          process.env.SMTP_FROM_EMAIL ||
          "noreply@example.com";
        fromName = nameSetting?.value || "Torqvoice";
      }

      const { sendMail } = await import("@/lib/email");
      await sendMail({
        from: `${fromName} <${fromEmail}>`,
        to: user.email,
        subject: "Reset your Torqvoice password",
        html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
            <h2>Password Reset</h2>
            <p>Hi${user.name ? ` ${user.name}` : ""},</p>
            <p>We received a request to reset your password. Click the button below to set a new password:</p>
            <div style="margin: 24px 0;">
              <a href="${url}" style="display: inline-block; padding: 12px 24px; background-color: #171717; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 500;">
                Reset Password
              </a>
            </div>
            <p style="color: #6b7280; font-size: 14px;">If you didn't request this, you can safely ignore this email.</p>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;" />
            <p style="color: #6b7280; font-size: 12px;">
              This link will expire shortly. If it doesn't work, copy and paste this URL into your browser:<br/>
              <a href="${url}" style="color: #6b7280;">${url}</a>
            </p>
          </div>
        `,
      });
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // 5 minutes
    },
  },
  advanced: {
    useSecureCookies: isProduction,
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          // Block registration if disabled via system settings
          const setting = await db.systemSetting.findUnique({
            where: { key: "registration.disabled" },
          });
          if (setting?.value === "true") {
            return false;
          }
          return { data: user };
        },
        after: async (user) => {
          // Auto-promote the first registered user to super admin
          const count = await db.user.count();
          if (count === 1) {
            await db.user.update({
              where: { id: user.id },
              data: { isSuperAdmin: true },
            });
          }
        },
      },
    },
  },
  plugins: [
    twoFactor({ issuer: "Torqvoice" }),
    nextCookies(), // Must be last plugin
  ],
});
