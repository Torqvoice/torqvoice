import { z } from "zod";

export const SYSTEM_SETTING_KEYS = {
  // Registration
  REGISTRATION_DISABLED: "registration.disabled",

  // Email Provider
  EMAIL_PROVIDER: "email.provider",

  // SMTP
  SMTP_HOST: "smtp.host",
  SMTP_PORT: "smtp.port",
  SMTP_USER: "smtp.user",
  SMTP_PASS: "smtp.pass",
  SMTP_SECURE: "smtp.secure",
  SMTP_FROM_EMAIL: "smtp.fromEmail",
  SMTP_FROM_NAME: "smtp.fromName",
  SMTP_REJECT_UNAUTHORIZED: "smtp.rejectUnauthorized",
  SMTP_REQUIRE_TLS: "smtp.requireTls",

  // Resend
  RESEND_API_KEY: "resend.apiKey",
  RESEND_FROM_EMAIL: "resend.fromEmail",
  RESEND_FROM_NAME: "resend.fromName",

  // Postmark
  POSTMARK_API_KEY: "postmark.apiKey",
  POSTMARK_FROM_EMAIL: "postmark.fromEmail",
  POSTMARK_FROM_NAME: "postmark.fromName",

  // Mailgun
  MAILGUN_API_KEY: "mailgun.apiKey",
  MAILGUN_DOMAIN: "mailgun.domain",
  MAILGUN_REGION: "mailgun.region",
  MAILGUN_FROM_EMAIL: "mailgun.fromEmail",
  MAILGUN_FROM_NAME: "mailgun.fromName",

  // SendGrid
  SENDGRID_API_KEY: "sendgrid.apiKey",
  SENDGRID_FROM_EMAIL: "sendgrid.fromEmail",
  SENDGRID_FROM_NAME: "sendgrid.fromName",

  // Amazon SES
  SES_ACCESS_KEY_ID: "ses.accessKeyId",
  SES_SECRET_ACCESS_KEY: "ses.secretAccessKey",
  SES_REGION: "ses.region",
  SES_FROM_EMAIL: "ses.fromEmail",
  SES_FROM_NAME: "ses.fromName",
} as const;

export type SystemSettingKey =
  (typeof SYSTEM_SETTING_KEYS)[keyof typeof SYSTEM_SETTING_KEYS];

export const ALL_SYSTEM_KEYS = Object.values(SYSTEM_SETTING_KEYS);

export const systemSettingsUpdateSchema = z.record(z.string(), z.string());

export type SystemSettingsMap = Partial<Record<SystemSettingKey, string>>;
