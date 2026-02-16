import nodemailer from "nodemailer";
import { Resend } from "resend";
import { ServerClient as PostmarkClient } from "postmark";
import Mailgun from "mailgun.js";
import FormData from "form-data";
import sgMail, { type MailDataRequired } from "@sendgrid/mail";
import { SESClient, SendRawEmailCommand } from "@aws-sdk/client-ses";
import { db } from "./db";
import { SYSTEM_SETTING_KEYS } from "@/features/admin/Schema/systemSettingsSchema";

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

  const keyMap: Record<
    EmailProvider,
    { email: string; name: string }
  > = {
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

async function sendViaSmtp(options: SendMailOptions) {
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

// ─── Resend ────────────────────────────────────────────────────────────────

async function getResendSettings() {
  const keys = [
    SYSTEM_SETTING_KEYS.RESEND_API_KEY,
    SYSTEM_SETTING_KEYS.RESEND_FROM_EMAIL,
    SYSTEM_SETTING_KEYS.RESEND_FROM_NAME,
  ];

  const rows = await db.systemSetting.findMany({
    where: { key: { in: keys } },
  });

  const map = new Map(rows.map((r) => [r.key, r.value]));
  return map;
}

async function sendViaResend(options: SendMailOptions) {
  const settings = await getResendSettings();
  const apiKey = settings.get(SYSTEM_SETTING_KEYS.RESEND_API_KEY);

  if (!apiKey) {
    throw new Error(
      "Resend is not configured. Add your Resend API key in Admin Settings.",
    );
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

// ─── Postmark ──────────────────────────────────────────────────────────────

async function sendViaPostmark(options: SendMailOptions) {
  const rows = await db.systemSetting.findMany({
    where: {
      key: { in: [SYSTEM_SETTING_KEYS.POSTMARK_API_KEY] },
    },
  });
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const apiKey = map.get(SYSTEM_SETTING_KEYS.POSTMARK_API_KEY);

  if (!apiKey) {
    throw new Error(
      "Postmark is not configured. Add your Server Token in Admin Settings.",
    );
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

// ─── Mailgun ───────────────────────────────────────────────────────────────

async function sendViaMailgun(options: SendMailOptions) {
  const keys = [
    SYSTEM_SETTING_KEYS.MAILGUN_API_KEY,
    SYSTEM_SETTING_KEYS.MAILGUN_DOMAIN,
    SYSTEM_SETTING_KEYS.MAILGUN_REGION,
  ];
  const rows = await db.systemSetting.findMany({
    where: { key: { in: keys } },
  });
  const map = new Map(rows.map((r) => [r.key, r.value]));

  const apiKey = map.get(SYSTEM_SETTING_KEYS.MAILGUN_API_KEY);
  const domain = map.get(SYSTEM_SETTING_KEYS.MAILGUN_DOMAIN);
  const region = map.get(SYSTEM_SETTING_KEYS.MAILGUN_REGION) || "us";

  if (!apiKey || !domain) {
    throw new Error(
      "Mailgun is not configured. Add your API key and domain in Admin Settings.",
    );
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

// ─── SendGrid ──────────────────────────────────────────────────────────────

async function sendViaSendGrid(options: SendMailOptions) {
  const rows = await db.systemSetting.findMany({
    where: {
      key: { in: [SYSTEM_SETTING_KEYS.SENDGRID_API_KEY] },
    },
  });
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const apiKey = map.get(SYSTEM_SETTING_KEYS.SENDGRID_API_KEY);

  if (!apiKey) {
    throw new Error(
      "SendGrid is not configured. Add your API key in Admin Settings.",
    );
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

// ─── Amazon SES ────────────────────────────────────────────────────────────

async function sendViaSes(options: SendMailOptions) {
  const keys = [
    SYSTEM_SETTING_KEYS.SES_ACCESS_KEY_ID,
    SYSTEM_SETTING_KEYS.SES_SECRET_ACCESS_KEY,
    SYSTEM_SETTING_KEYS.SES_REGION,
  ];
  const rows = await db.systemSetting.findMany({
    where: { key: { in: keys } },
  });
  const map = new Map(rows.map((r) => [r.key, r.value]));

  const accessKeyId = map.get(SYSTEM_SETTING_KEYS.SES_ACCESS_KEY_ID);
  const secretAccessKey = map.get(SYSTEM_SETTING_KEYS.SES_SECRET_ACCESS_KEY);
  const region = map.get(SYSTEM_SETTING_KEYS.SES_REGION) || "us-east-1";

  if (!accessKeyId || !secretAccessKey) {
    throw new Error(
      "Amazon SES is not configured. Add your credentials in Admin Settings.",
    );
  }

  // Build raw email via nodemailer (supports attachments) then send through SES
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

// ─── Router ────────────────────────────────────────────────────────────────

export async function sendMail(options: SendMailOptions) {
  const provider = await getEmailProvider();

  switch (provider) {
    case "resend":
      await sendViaResend(options);
      break;
    case "postmark":
      await sendViaPostmark(options);
      break;
    case "mailgun":
      await sendViaMailgun(options);
      break;
    case "sendgrid":
      await sendViaSendGrid(options);
      break;
    case "ses":
      await sendViaSes(options);
      break;
    default:
      await sendViaSmtp(options);
      break;
  }
}
