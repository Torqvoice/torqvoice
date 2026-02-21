export const ORG_SMS_KEYS = {
  SMS_PROVIDER: "sms.provider",
  SMS_PHONE_NUMBER: "sms.phoneNumber",
  SMS_WEBHOOK_SECRET: "sms.webhookSecret",

  // Twilio
  SMS_TWILIO_ACCOUNT_SID: "sms.twilio.accountSid",
  SMS_TWILIO_AUTH_TOKEN: "sms.twilio.authToken",

  // Vonage
  SMS_VONAGE_API_KEY: "sms.vonage.apiKey",
  SMS_VONAGE_API_SECRET: "sms.vonage.apiSecret",

  // Telnyx
  SMS_TELNYX_API_KEY: "sms.telnyx.apiKey",
} as const;

export type OrgSmsKey = (typeof ORG_SMS_KEYS)[keyof typeof ORG_SMS_KEYS];

export const ALL_ORG_SMS_KEYS = Object.values(ORG_SMS_KEYS);
