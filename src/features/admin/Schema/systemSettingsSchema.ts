import { z } from "zod";

export const SYSTEM_SETTING_KEYS = {
  // Registration
  REGISTRATION_DISABLED: "registration.disabled",

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
} as const;

export type SystemSettingKey =
  (typeof SYSTEM_SETTING_KEYS)[keyof typeof SYSTEM_SETTING_KEYS];

export const ALL_SYSTEM_KEYS = Object.values(SYSTEM_SETTING_KEYS);

export const systemSettingsUpdateSchema = z.record(z.string(), z.string());

export type SystemSettingsMap = Partial<Record<SystemSettingKey, string>>;
