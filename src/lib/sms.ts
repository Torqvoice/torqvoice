import { db } from "./db";
import { ORG_SMS_KEYS } from "@/features/sms/Schema/smsSettingsSchema";

export type SmsProvider = "twilio" | "vonage" | "telnyx";

export interface SendSmsOptions {
  to: string;
  body: string;
}

type SettingsMap = Map<string, string>;

async function getOrgSettings(
  organizationId: string,
  keys: string[],
): Promise<SettingsMap> {
  const rows = await db.appSetting.findMany({
    where: { organizationId, key: { in: keys } },
  });
  return new Map(rows.map((r) => [r.key, r.value]));
}

export async function getOrgSmsProvider(
  organizationId: string,
): Promise<SmsProvider | null> {
  const setting = await db.appSetting.findUnique({
    where: {
      organizationId_key: {
        organizationId,
        key: ORG_SMS_KEYS.SMS_PROVIDER,
      },
    },
  });
  const value = setting?.value;
  if (value === "twilio" || value === "vonage" || value === "telnyx") {
    return value;
  }
  return null;
}

export async function getOrgSmsPhoneNumber(
  organizationId: string,
): Promise<string | null> {
  const setting = await db.appSetting.findUnique({
    where: {
      organizationId_key: {
        organizationId,
        key: ORG_SMS_KEYS.SMS_PHONE_NUMBER,
      },
    },
  });
  return setting?.value || null;
}

// ─── Twilio ──────────────────────────────────────────────────────────────────

interface TwilioResult {
  sid: string;
  status: string;
}

async function sendViaTwilio(
  settings: SettingsMap,
  from: string,
  to: string,
  body: string,
): Promise<TwilioResult> {
  const accountSid = settings.get(ORG_SMS_KEYS.SMS_TWILIO_ACCOUNT_SID);
  const authToken = settings.get(ORG_SMS_KEYS.SMS_TWILIO_AUTH_TOKEN);

  if (!accountSid || !authToken) {
    throw new Error("Twilio is not configured. Add your Account SID and Auth Token.");
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const credentials = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

  const params = new URLSearchParams({ From: from, To: to, Body: body });

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Twilio error: ${(err as { message?: string }).message || res.statusText}`);
  }

  const data = (await res.json()) as TwilioResult;
  return { sid: data.sid, status: data.status };
}

// ─── Vonage ──────────────────────────────────────────────────────────────────

interface VonageResult {
  messageId: string;
  status: string;
}

async function sendViaVonage(
  settings: SettingsMap,
  from: string,
  to: string,
  body: string,
): Promise<VonageResult> {
  const apiKey = settings.get(ORG_SMS_KEYS.SMS_VONAGE_API_KEY);
  const apiSecret = settings.get(ORG_SMS_KEYS.SMS_VONAGE_API_SECRET);

  if (!apiKey || !apiSecret) {
    throw new Error("Vonage is not configured. Add your API Key and Secret.");
  }

  const res = await fetch("https://rest.nexmo.com/sms/json", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      api_secret: apiSecret,
      from,
      to,
      text: body,
    }),
  });

  if (!res.ok) {
    throw new Error(`Vonage error: ${res.statusText}`);
  }

  const data = (await res.json()) as {
    messages: { "message-id": string; status: string; "error-text"?: string }[];
  };
  const msg = data.messages?.[0];

  if (msg?.status !== "0") {
    throw new Error(`Vonage error: ${msg?.["error-text"] || "Unknown error"}`);
  }

  return { messageId: msg["message-id"], status: msg.status };
}

// ─── Telnyx ──────────────────────────────────────────────────────────────────

interface TelnyxResult {
  id: string;
}

async function sendViaTelnyx(
  settings: SettingsMap,
  from: string,
  to: string,
  body: string,
): Promise<TelnyxResult> {
  const apiKey = settings.get(ORG_SMS_KEYS.SMS_TELNYX_API_KEY);

  if (!apiKey) {
    throw new Error("Telnyx is not configured. Add your API Key.");
  }

  const res = await fetch("https://api.telnyx.com/v2/messages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, text: body }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const errors = (err as { errors?: { detail?: string }[] }).errors;
    throw new Error(`Telnyx error: ${errors?.[0]?.detail || res.statusText}`);
  }

  const data = (await res.json()) as { data: { id: string } };
  return { id: data.data.id };
}

// ─── Main dispatch ───────────────────────────────────────────────────────────

export interface SendSmsResult {
  providerMsgId: string;
}

export async function sendOrgSms(
  organizationId: string,
  options: SendSmsOptions,
): Promise<SendSmsResult> {
  const provider = await getOrgSmsProvider(organizationId);
  if (!provider) {
    throw new Error("SMS is not configured. Set up an SMS provider in Settings.");
  }

  const from = await getOrgSmsPhoneNumber(organizationId);
  if (!from) {
    throw new Error("SMS phone number is not configured.");
  }

  const allKeys = Object.values(ORG_SMS_KEYS);
  const settings = await getOrgSettings(organizationId, allKeys);

  switch (provider) {
    case "twilio": {
      const result = await sendViaTwilio(settings, from, options.to, options.body);
      return { providerMsgId: result.sid };
    }
    case "vonage": {
      const result = await sendViaVonage(settings, from, options.to, options.body);
      return { providerMsgId: result.messageId };
    }
    case "telnyx": {
      const result = await sendViaTelnyx(settings, from, options.to, options.body);
      return { providerMsgId: result.id };
    }
  }
}
