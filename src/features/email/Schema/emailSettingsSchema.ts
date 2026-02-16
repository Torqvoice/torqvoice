export const ORG_EMAIL_KEYS = {
  EMAIL_PROVIDER: "email.provider",

  // SMTP
  EMAIL_SMTP_HOST: "email.smtp.host",
  EMAIL_SMTP_PORT: "email.smtp.port",
  EMAIL_SMTP_USER: "email.smtp.user",
  EMAIL_SMTP_PASS: "email.smtp.pass",
  EMAIL_SMTP_SECURE: "email.smtp.secure",
  EMAIL_SMTP_FROM_EMAIL: "email.smtp.fromEmail",
  EMAIL_SMTP_FROM_NAME: "email.smtp.fromName",
  EMAIL_SMTP_REJECT_UNAUTHORIZED: "email.smtp.rejectUnauthorized",
  EMAIL_SMTP_REQUIRE_TLS: "email.smtp.requireTls",

  // Resend
  EMAIL_RESEND_API_KEY: "email.resend.apiKey",
  EMAIL_RESEND_FROM_EMAIL: "email.resend.fromEmail",
  EMAIL_RESEND_FROM_NAME: "email.resend.fromName",

  // Postmark
  EMAIL_POSTMARK_API_KEY: "email.postmark.apiKey",
  EMAIL_POSTMARK_FROM_EMAIL: "email.postmark.fromEmail",
  EMAIL_POSTMARK_FROM_NAME: "email.postmark.fromName",

  // Mailgun
  EMAIL_MAILGUN_API_KEY: "email.mailgun.apiKey",
  EMAIL_MAILGUN_DOMAIN: "email.mailgun.domain",
  EMAIL_MAILGUN_REGION: "email.mailgun.region",
  EMAIL_MAILGUN_FROM_EMAIL: "email.mailgun.fromEmail",
  EMAIL_MAILGUN_FROM_NAME: "email.mailgun.fromName",

  // SendGrid
  EMAIL_SENDGRID_API_KEY: "email.sendgrid.apiKey",
  EMAIL_SENDGRID_FROM_EMAIL: "email.sendgrid.fromEmail",
  EMAIL_SENDGRID_FROM_NAME: "email.sendgrid.fromName",

  // Amazon SES
  EMAIL_SES_ACCESS_KEY_ID: "email.ses.accessKeyId",
  EMAIL_SES_SECRET_ACCESS_KEY: "email.ses.secretAccessKey",
  EMAIL_SES_REGION: "email.ses.region",
  EMAIL_SES_FROM_EMAIL: "email.ses.fromEmail",
  EMAIL_SES_FROM_NAME: "email.ses.fromName",
} as const;

export type OrgEmailKey = (typeof ORG_EMAIL_KEYS)[keyof typeof ORG_EMAIL_KEYS];

export const ALL_ORG_EMAIL_KEYS = Object.values(ORG_EMAIL_KEYS);
