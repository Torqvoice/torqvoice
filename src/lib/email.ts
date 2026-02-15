import nodemailer from "nodemailer";
import { db } from "./db";
import { SYSTEM_SETTING_KEYS } from "@/features/admin/Schema/systemSettingsSchema";

export interface SendMailOptions {
  from: string;
  to: string;
  subject: string;
  html: string;
  attachments?: {
    filename: string;
    content: Buffer;
  }[];
}

async function getSmtpSettings() {
  const keys = [
    SYSTEM_SETTING_KEYS.SMTP_HOST,
    SYSTEM_SETTING_KEYS.SMTP_PORT,
    SYSTEM_SETTING_KEYS.SMTP_USER,
    SYSTEM_SETTING_KEYS.SMTP_PASS,
    SYSTEM_SETTING_KEYS.SMTP_SECURE,
    SYSTEM_SETTING_KEYS.SMTP_REJECT_UNAUTHORIZED,
    SYSTEM_SETTING_KEYS.SMTP_REQUIRE_TLS,
  ];

  const rows = await db.systemSetting.findMany({
    where: { key: { in: keys } },
  });

  const map = new Map(rows.map((r) => [r.key, r.value]));
  return map;
}

async function getTransporter() {
  // Read from DB first, fall back to env vars
  const settings = await getSmtpSettings();

  const host =
    settings.get(SYSTEM_SETTING_KEYS.SMTP_HOST) || process.env.SMTP_HOST;
  const port =
    Number(settings.get(SYSTEM_SETTING_KEYS.SMTP_PORT)) ||
    Number(process.env.SMTP_PORT) ||
    587;
  const user =
    settings.get(SYSTEM_SETTING_KEYS.SMTP_USER) || process.env.SMTP_USER;
  const pass =
    settings.get(SYSTEM_SETTING_KEYS.SMTP_PASS) || process.env.SMTP_PASS;

  const secureSetting = settings.get(SYSTEM_SETTING_KEYS.SMTP_SECURE);
  const secure =
    secureSetting !== undefined
      ? secureSetting === "true"
      : process.env.SMTP_SECURE === "true";

  const rejectSetting = settings.get(
    SYSTEM_SETTING_KEYS.SMTP_REJECT_UNAUTHORIZED,
  );
  const rejectUnauthorized =
    rejectSetting !== undefined
      ? rejectSetting !== "false"
      : process.env.SMTP_REJECT_UNAUTHORIZED !== "false";

  const requireTlsSetting = settings.get(SYSTEM_SETTING_KEYS.SMTP_REQUIRE_TLS);
  const requireTls = requireTlsSetting === "true";

  if (!host) {
    throw new Error(
      "SMTP is not configured. Configure SMTP in Admin Settings or add SMTP_HOST to your .env file.",
    );
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user
      ? {
          user,
          pass,
        }
      : undefined,
    tls: {
      rejectUnauthorized,
    },
    requireTLS: requireTls,
  });
}

export async function sendMail(options: SendMailOptions) {
  const transporter = await getTransporter();
  await transporter.sendMail({
    from: options.from,
    to: options.to,
    subject: options.subject,
    html: options.html,
    attachments: options.attachments?.map((a) => ({
      filename: a.filename,
      content: a.content,
    })),
  });
}
