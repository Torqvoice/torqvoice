import nodemailer from "nodemailer";
import { Resend } from "resend";
import { ServerClient as PostmarkClient } from "postmark";
import Mailgun from "mailgun.js";
import FormData from "form-data";
import sgMail, { type MailDataRequired } from "@sendgrid/mail";
import { SESClient, SendRawEmailCommand } from "@aws-sdk/client-ses";
import { db } from "./db";
import { SYSTEM_SETTING_KEYS } from "@/features/admin/Schema/systemSettingsSchema";
import { ORG_EMAIL_KEYS } from "@/features/email/Schema/emailSettingsSchema";

export type EmailProvider =
  | "smtp"
  | "resend"
  | "postmark"
  | "mailgun"
  | "sendgrid"
  | "ses";

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

// ─── Settings map helper ────────────────────────────────────────────────────

type SettingsMap = Map<string, string>;

async function getSystemSettings(keys: string[]): Promise<SettingsMap> {
  const rows = await db.systemSetting.findMany({
    where: { key: { in: keys } },
  });
  return new Map(rows.map((r) => [r.key, r.value]));
}

async function getOrgSettings(
  organizationId: string,
  keys: string[],
): Promise<SettingsMap> {
  const rows = await db.appSetting.findMany({
    where: { organizationId, key: { in: keys } },
  });
  return new Map(rows.map((r) => [r.key, r.value]));
}

// ─── System-level helpers (read from SystemSetting + env) ───────────────────

async function getEmailProvider(): Promise<EmailProvider> {
  const setting = await db.systemSetting.findUnique({
    where: { key: SYSTEM_SETTING_KEYS.EMAIL_PROVIDER },
  });
  const value = setting?.value;
  if (
    value === "resend" ||
    value === "postmark" ||
    value === "mailgun" ||
    value === "sendgrid" ||
    value === "ses"
  ) {
    return value;
  }
  return "smtp";
}

export async function getFromAddress(): Promise<string> {
  const provider = await getEmailProvider();

  const keyMap: Record<EmailProvider, { email: string; name: string }> = {
    smtp: {
      email: SYSTEM_SETTING_KEYS.SMTP_FROM_EMAIL,
      name: SYSTEM_SETTING_KEYS.SMTP_FROM_NAME,
    },
    resend: {
      email: SYSTEM_SETTING_KEYS.RESEND_FROM_EMAIL,
      name: SYSTEM_SETTING_KEYS.RESEND_FROM_NAME,
    },
    postmark: {
      email: SYSTEM_SETTING_KEYS.POSTMARK_FROM_EMAIL,
      name: SYSTEM_SETTING_KEYS.POSTMARK_FROM_NAME,
    },
    mailgun: {
      email: SYSTEM_SETTING_KEYS.MAILGUN_FROM_EMAIL,
      name: SYSTEM_SETTING_KEYS.MAILGUN_FROM_NAME,
    },
    sendgrid: {
      email: SYSTEM_SETTING_KEYS.SENDGRID_FROM_EMAIL,
      name: SYSTEM_SETTING_KEYS.SENDGRID_FROM_NAME,
    },
    ses: {
      email: SYSTEM_SETTING_KEYS.SES_FROM_EMAIL,
      name: SYSTEM_SETTING_KEYS.SES_FROM_NAME,
    },
  };

  const keys = keyMap[provider];
  const rows = await db.systemSetting.findMany({
    where: { key: { in: [keys.email, keys.name] } },
  });
  const map = new Map(rows.map((r) => [r.key, r.value]));

  const fromEmail =
    map.get(keys.email) || process.env.SMTP_FROM_EMAIL || "noreply@example.com";
  const fromName = map.get(keys.name) || "Torqvoice";

  return `${fromName} <${fromEmail}>`;
}

// ─── SMTP ──────────────────────────────────────────────────────────────────

interface SmtpConfig {
  host: string;
  port: number;
  user?: string;
  pass?: string;
  secure: boolean;
  rejectUnauthorized: boolean;
  requireTls: boolean;
}

function buildSmtpConfig(
  settings: SettingsMap,
  keys: {
    host: string;
    port: string;
    user: string;
    pass: string;
    secure: string;
    rejectUnauthorized: string;
    requireTls: string;
  },
  useEnvFallback: boolean,
): SmtpConfig {
  const host = settings.get(keys.host) || (useEnvFallback ? process.env.SMTP_HOST : undefined);
  const port =
    Number(settings.get(keys.port)) ||
    (useEnvFallback ? Number(process.env.SMTP_PORT) : 0) ||
    587;
  const user = settings.get(keys.user) || (useEnvFallback ? process.env.SMTP_USER : undefined);
  const pass = settings.get(keys.pass) || (useEnvFallback ? process.env.SMTP_PASS : undefined);

  const secureSetting = settings.get(keys.secure);
  const secure =
    secureSetting !== undefined
      ? secureSetting === "true"
      : useEnvFallback
        ? process.env.SMTP_SECURE === "true"
        : false;

  const rejectSetting = settings.get(keys.rejectUnauthorized);
  const rejectUnauthorized =
    rejectSetting !== undefined
      ? rejectSetting !== "false"
      : useEnvFallback
        ? process.env.SMTP_REJECT_UNAUTHORIZED !== "false"
        : true;

  const requireTlsSetting = settings.get(keys.requireTls);
  const requireTls = requireTlsSetting === "true";

  if (!host) {
    throw new Error(
      "SMTP is not configured. Configure SMTP in your email settings.",
    );
  }

  return { host, port, user, pass, secure, rejectUnauthorized, requireTls };
}

function createSmtpTransporter(config: SmtpConfig) {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.user
      ? {
          user: config.user,
          pass: config.pass,
        }
      : undefined,
    tls: {
      rejectUnauthorized: config.rejectUnauthorized,
    },
    requireTLS: config.requireTls,
  });
}

async function sendViaSmtpWithSettings(
  options: SendMailOptions,
  settings: SettingsMap,
  keys: {
    host: string;
    port: string;
    user: string;
    pass: string;
    secure: string;
    rejectUnauthorized: string;
    requireTls: string;
  },
  useEnvFallback: boolean,
) {
  const config = buildSmtpConfig(settings, keys, useEnvFallback);
  const transporter = createSmtpTransporter(config);
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

async function sendViaSmtp(options: SendMailOptions) {
  const keys = [
    SYSTEM_SETTING_KEYS.SMTP_HOST,
    SYSTEM_SETTING_KEYS.SMTP_PORT,
    SYSTEM_SETTING_KEYS.SMTP_USER,
    SYSTEM_SETTING_KEYS.SMTP_PASS,
    SYSTEM_SETTING_KEYS.SMTP_SECURE,
    SYSTEM_SETTING_KEYS.SMTP_REJECT_UNAUTHORIZED,
    SYSTEM_SETTING_KEYS.SMTP_REQUIRE_TLS,
  ];
  const settings = await getSystemSettings(keys);
  await sendViaSmtpWithSettings(options, settings, {
    host: SYSTEM_SETTING_KEYS.SMTP_HOST,
    port: SYSTEM_SETTING_KEYS.SMTP_PORT,
    user: SYSTEM_SETTING_KEYS.SMTP_USER,
    pass: SYSTEM_SETTING_KEYS.SMTP_PASS,
    secure: SYSTEM_SETTING_KEYS.SMTP_SECURE,
    rejectUnauthorized: SYSTEM_SETTING_KEYS.SMTP_REJECT_UNAUTHORIZED,
    requireTls: SYSTEM_SETTING_KEYS.SMTP_REQUIRE_TLS,
  }, true);
}

// ─── Resend ────────────────────────────────────────────────────────────────

async function sendViaResendWithSettings(
  options: SendMailOptions,
  settings: SettingsMap,
  apiKeyField: string,
) {
  const apiKey = settings.get(apiKeyField);
  if (!apiKey) {
    throw new Error("Resend is not configured. Add your Resend API key.");
  }

  const resend = new Resend(apiKey);
  await resend.emails.send({
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

async function sendViaResend(options: SendMailOptions) {
  const settings = await getSystemSettings([SYSTEM_SETTING_KEYS.RESEND_API_KEY]);
  await sendViaResendWithSettings(options, settings, SYSTEM_SETTING_KEYS.RESEND_API_KEY);
}

// ─── Postmark ──────────────────────────────────────────────────────────────

async function sendViaPostmarkWithSettings(
  options: SendMailOptions,
  settings: SettingsMap,
  apiKeyField: string,
) {
  const apiKey = settings.get(apiKeyField);
  if (!apiKey) {
    throw new Error("Postmark is not configured. Add your Server Token.");
  }

  const client = new PostmarkClient(apiKey);

  if (options.attachments?.length) {
    await client.sendEmail({
      From: options.from,
      To: options.to,
      Subject: options.subject,
      HtmlBody: options.html,
      Attachments: options.attachments.map((a) => ({
        Name: a.filename,
        Content: a.content.toString("base64"),
        ContentType: "application/octet-stream",
        ContentID: "",
      })),
    });
  } else {
    await client.sendEmail({
      From: options.from,
      To: options.to,
      Subject: options.subject,
      HtmlBody: options.html,
    });
  }
}

async function sendViaPostmark(options: SendMailOptions) {
  const settings = await getSystemSettings([SYSTEM_SETTING_KEYS.POSTMARK_API_KEY]);
  await sendViaPostmarkWithSettings(options, settings, SYSTEM_SETTING_KEYS.POSTMARK_API_KEY);
}

// ─── Mailgun ───────────────────────────────────────────────────────────────

async function sendViaMailgunWithSettings(
  options: SendMailOptions,
  settings: SettingsMap,
  keys: { apiKey: string; domain: string; region: string },
) {
  const apiKey = settings.get(keys.apiKey);
  const domain = settings.get(keys.domain);
  const region = settings.get(keys.region) || "us";

  if (!apiKey || !domain) {
    throw new Error("Mailgun is not configured. Add your API key and domain.");
  }

  const mailgun = new Mailgun(FormData);
  const mg = mailgun.client({
    username: "api",
    key: apiKey,
    url: region === "eu" ? "https://api.eu.mailgun.net" : undefined,
  });

  await mg.messages.create(domain, {
    from: options.from,
    to: [options.to],
    subject: options.subject,
    html: options.html,
    ...(options.attachments?.length && {
      attachment: options.attachments.map((a) => ({
        filename: a.filename,
        data: a.content,
      })),
    }),
  });
}

async function sendViaMailgun(options: SendMailOptions) {
  const keys = [
    SYSTEM_SETTING_KEYS.MAILGUN_API_KEY,
    SYSTEM_SETTING_KEYS.MAILGUN_DOMAIN,
    SYSTEM_SETTING_KEYS.MAILGUN_REGION,
  ];
  const settings = await getSystemSettings(keys);
  await sendViaMailgunWithSettings(options, settings, {
    apiKey: SYSTEM_SETTING_KEYS.MAILGUN_API_KEY,
    domain: SYSTEM_SETTING_KEYS.MAILGUN_DOMAIN,
    region: SYSTEM_SETTING_KEYS.MAILGUN_REGION,
  });
}

// ─── SendGrid ──────────────────────────────────────────────────────────────

async function sendViaSendGridWithSettings(
  options: SendMailOptions,
  settings: SettingsMap,
  apiKeyField: string,
) {
  const apiKey = settings.get(apiKeyField);
  if (!apiKey) {
    throw new Error("SendGrid is not configured. Add your API key.");
  }

  sgMail.setApiKey(apiKey);

  const msg: MailDataRequired = {
    from: options.from,
    to: options.to,
    subject: options.subject,
    html: options.html,
  };

  if (options.attachments?.length) {
    msg.attachments = options.attachments.map((a) => ({
      filename: a.filename,
      content: a.content.toString("base64"),
      type: "application/octet-stream",
      disposition: "attachment" as const,
    }));
  }

  await sgMail.send(msg);
}

async function sendViaSendGrid(options: SendMailOptions) {
  const settings = await getSystemSettings([SYSTEM_SETTING_KEYS.SENDGRID_API_KEY]);
  await sendViaSendGridWithSettings(options, settings, SYSTEM_SETTING_KEYS.SENDGRID_API_KEY);
}

// ─── Amazon SES ────────────────────────────────────────────────────────────

async function sendViaSesWithSettings(
  options: SendMailOptions,
  settings: SettingsMap,
  keys: { accessKeyId: string; secretAccessKey: string; region: string },
) {
  const accessKeyId = settings.get(keys.accessKeyId);
  const secretAccessKey = settings.get(keys.secretAccessKey);
  const region = settings.get(keys.region) || "us-east-1";

  if (!accessKeyId || !secretAccessKey) {
    throw new Error("Amazon SES is not configured. Add your credentials.");
  }

  const transporter = nodemailer.createTransport({ streamTransport: true });
  const info = await transporter.sendMail({
    from: options.from,
    to: options.to,
    subject: options.subject,
    html: options.html,
    attachments: options.attachments?.map((a) => ({
      filename: a.filename,
      content: a.content,
    })),
  });

  const rawMessage = Buffer.isBuffer(info.message)
    ? info.message
    : await streamToBuffer(info.message);

  const client = new SESClient({
    region,
    credentials: { accessKeyId, secretAccessKey },
  });

  await client.send(
    new SendRawEmailCommand({ RawMessage: { Data: rawMessage } }),
  );
}

async function sendViaSes(options: SendMailOptions) {
  const keys = [
    SYSTEM_SETTING_KEYS.SES_ACCESS_KEY_ID,
    SYSTEM_SETTING_KEYS.SES_SECRET_ACCESS_KEY,
    SYSTEM_SETTING_KEYS.SES_REGION,
  ];
  const settings = await getSystemSettings(keys);
  await sendViaSesWithSettings(options, settings, {
    accessKeyId: SYSTEM_SETTING_KEYS.SES_ACCESS_KEY_ID,
    secretAccessKey: SYSTEM_SETTING_KEYS.SES_SECRET_ACCESS_KEY,
    region: SYSTEM_SETTING_KEYS.SES_REGION,
  });
}

function streamToBuffer(
  stream: NodeJS.ReadableStream,
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (chunk: Buffer) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

// ─── Provider dispatch (shared by both system and org) ──────────────────────

function sendWithProvider(
  provider: EmailProvider,
  options: SendMailOptions,
  settings: SettingsMap,
  keySet: "system" | "org",
) {
  if (keySet === "org") {
    switch (provider) {
      case "smtp":
        return sendViaSmtpWithSettings(options, settings, {
          host: ORG_EMAIL_KEYS.EMAIL_SMTP_HOST,
          port: ORG_EMAIL_KEYS.EMAIL_SMTP_PORT,
          user: ORG_EMAIL_KEYS.EMAIL_SMTP_USER,
          pass: ORG_EMAIL_KEYS.EMAIL_SMTP_PASS,
          secure: ORG_EMAIL_KEYS.EMAIL_SMTP_SECURE,
          rejectUnauthorized: ORG_EMAIL_KEYS.EMAIL_SMTP_REJECT_UNAUTHORIZED,
          requireTls: ORG_EMAIL_KEYS.EMAIL_SMTP_REQUIRE_TLS,
        }, false);
      case "resend":
        return sendViaResendWithSettings(options, settings, ORG_EMAIL_KEYS.EMAIL_RESEND_API_KEY);
      case "postmark":
        return sendViaPostmarkWithSettings(options, settings, ORG_EMAIL_KEYS.EMAIL_POSTMARK_API_KEY);
      case "mailgun":
        return sendViaMailgunWithSettings(options, settings, {
          apiKey: ORG_EMAIL_KEYS.EMAIL_MAILGUN_API_KEY,
          domain: ORG_EMAIL_KEYS.EMAIL_MAILGUN_DOMAIN,
          region: ORG_EMAIL_KEYS.EMAIL_MAILGUN_REGION,
        });
      case "sendgrid":
        return sendViaSendGridWithSettings(options, settings, ORG_EMAIL_KEYS.EMAIL_SENDGRID_API_KEY);
      case "ses":
        return sendViaSesWithSettings(options, settings, {
          accessKeyId: ORG_EMAIL_KEYS.EMAIL_SES_ACCESS_KEY_ID,
          secretAccessKey: ORG_EMAIL_KEYS.EMAIL_SES_SECRET_ACCESS_KEY,
          region: ORG_EMAIL_KEYS.EMAIL_SES_REGION,
        });
    }
  }

  // system keySet
  switch (provider) {
    case "resend":
      return sendViaResend(options);
    case "postmark":
      return sendViaPostmark(options);
    case "mailgun":
      return sendViaMailgun(options);
    case "sendgrid":
      return sendViaSendGrid(options);
    case "ses":
      return sendViaSes(options);
    default:
      return sendViaSmtp(options);
  }
}

// ─── System-level router (unchanged behavior) ──────────────────────────────

export async function sendMail(options: SendMailOptions) {
  const provider = await getEmailProvider();
  await sendWithProvider(provider, options, new Map(), "system");
}

// ─── Org-level email ────────────────────────────────────────────────────────

async function getOrgEmailProvider(
  organizationId: string,
): Promise<EmailProvider | null> {
  const setting = await db.appSetting.findUnique({
    where: {
      organizationId_key: {
        organizationId,
        key: ORG_EMAIL_KEYS.EMAIL_PROVIDER,
      },
    },
  });
  const value = setting?.value;
  if (
    value === "smtp" ||
    value === "resend" ||
    value === "postmark" ||
    value === "mailgun" ||
    value === "sendgrid" ||
    value === "ses"
  ) {
    return value;
  }
  return null;
}

export async function getOrgFromAddress(
  organizationId: string,
): Promise<string> {
  const provider = await getOrgEmailProvider(organizationId);

  if (!provider) {
    return getFromAddress();
  }

  const keyMap: Record<EmailProvider, { email: string; name: string }> = {
    smtp: {
      email: ORG_EMAIL_KEYS.EMAIL_SMTP_FROM_EMAIL,
      name: ORG_EMAIL_KEYS.EMAIL_SMTP_FROM_NAME,
    },
    resend: {
      email: ORG_EMAIL_KEYS.EMAIL_RESEND_FROM_EMAIL,
      name: ORG_EMAIL_KEYS.EMAIL_RESEND_FROM_NAME,
    },
    postmark: {
      email: ORG_EMAIL_KEYS.EMAIL_POSTMARK_FROM_EMAIL,
      name: ORG_EMAIL_KEYS.EMAIL_POSTMARK_FROM_NAME,
    },
    mailgun: {
      email: ORG_EMAIL_KEYS.EMAIL_MAILGUN_FROM_EMAIL,
      name: ORG_EMAIL_KEYS.EMAIL_MAILGUN_FROM_NAME,
    },
    sendgrid: {
      email: ORG_EMAIL_KEYS.EMAIL_SENDGRID_FROM_EMAIL,
      name: ORG_EMAIL_KEYS.EMAIL_SENDGRID_FROM_NAME,
    },
    ses: {
      email: ORG_EMAIL_KEYS.EMAIL_SES_FROM_EMAIL,
      name: ORG_EMAIL_KEYS.EMAIL_SES_FROM_NAME,
    },
  };

  const keys = keyMap[provider];
  const settings = await getOrgSettings(organizationId, [
    keys.email,
    keys.name,
  ]);

  const fromEmail = settings.get(keys.email) || "noreply@example.com";
  const fromName = settings.get(keys.name) || "Torqvoice";

  return `${fromName} <${fromEmail}>`;
}

export async function sendOrgMail(
  organizationId: string,
  options: SendMailOptions,
) {
  const provider = await getOrgEmailProvider(organizationId);

  if (!provider) {
    // Fall back to global platform email
    await sendMail(options);
    return;
  }

  // Load all org email settings
  const allKeys = Object.values(ORG_EMAIL_KEYS);
  const settings = await getOrgSettings(organizationId, allKeys);

  await sendWithProvider(provider, options, settings, "org");
}
