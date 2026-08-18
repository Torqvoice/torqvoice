import { SETTING_KEYS } from "@/features/settings/Schema/settingsSchema";
import { SMS_TEMPLATE_DEFAULTS, interpolateSmsTemplate } from "@/lib/sms-templates";
import { defaultLocale, locales, type Locale } from "@/i18n/config";

export type CustomerReminderType = "inspection_due" | "service_due";

export type ReminderMessageVariables = {
  customer_name: string;
  vehicle: string;
  license_plate: string;
  due_date: string;
  company_name: string;
};

/** English fallbacks, used when a locale file cannot be loaded. */
const EMAIL_FALLBACK = {
  inspectionDueSubject: "Inspection due for your {vehicle}",
  serviceDueSubject: "Service due for your {vehicle}",
  greeting: "Hi {customer_name},",
  signoff: "Best regards,",
};

const TEMPLATE_KEY: Record<CustomerReminderType, string> = {
  inspection_due: SETTING_KEYS.SMS_TEMPLATE_INSPECTION_DUE,
  service_due: SETTING_KEYS.SMS_TEMPLATE_SERVICE_DUE,
};

const SMS_DEFAULT_MESSAGE_KEY: Record<CustomerReminderType, string> = {
  inspection_due: "inspectionDue",
  service_due: "serviceDue",
};

type LocaleTemplateStrings = {
  smsDefault: string;
  subject: string;
  greeting: string;
  signoff: string;
};

/**
 * Loads the customer-facing default strings for a locale from the settings
 * message catalog (same source the settings UI shows). Falls back to the
 * English constants if the catalog cannot be read.
 */
export async function loadReminderTemplateStrings(
  locale: string,
  type: CustomerReminderType,
): Promise<LocaleTemplateStrings> {
  const safeLocale: Locale = locales.includes(locale as Locale)
    ? (locale as Locale)
    : defaultLocale;

  const subjectKey =
    type === "inspection_due" ? "inspectionDueSubject" : "serviceDueSubject";

  try {
    const catalog = (
      await import(`../../../../messages/${safeLocale}/settings.json`)
    ).default as {
      templates?: {
        smsDefaults?: Record<string, string>;
        customerReminderEmail?: Record<string, string>;
      };
    };
    const smsDefaults = catalog.templates?.smsDefaults ?? {};
    const email = catalog.templates?.customerReminderEmail ?? {};
    return {
      smsDefault:
        smsDefaults[SMS_DEFAULT_MESSAGE_KEY[type]] ||
        SMS_TEMPLATE_DEFAULTS[TEMPLATE_KEY[type]],
      subject: email[subjectKey] || EMAIL_FALLBACK[subjectKey],
      greeting: email.greeting || EMAIL_FALLBACK.greeting,
      signoff: email.signoff || EMAIL_FALLBACK.signoff,
    };
  } catch {
    return {
      smsDefault: SMS_TEMPLATE_DEFAULTS[TEMPLATE_KEY[type]],
      subject: EMAIL_FALLBACK[subjectKey],
      greeting: EMAIL_FALLBACK.greeting,
      signoff: EMAIL_FALLBACK.signoff,
    };
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export type BuiltReminderMessage = {
  smsBody: string;
  emailSubject: string;
  emailHtml: string;
};

/**
 * Builds the SMS body and the email subject/body for one reminder.
 *
 * The message text comes from the org's customized SMS template when one is
 * saved (Settings -> Templates -> SMS), otherwise from the localized default
 * in the workshop's customer-facing locale. The same text doubles as the
 * email body, wrapped in a greeting and sign-off.
 */
export async function buildReminderMessage(options: {
  type: CustomerReminderType;
  locale: string;
  /** Org-customized template text (AppSetting), if any. */
  templateOverride: string | null | undefined;
  variables: ReminderMessageVariables;
}): Promise<BuiltReminderMessage> {
  const strings = await loadReminderTemplateStrings(options.locale, options.type);
  const vars = options.variables as unknown as Record<string, string>;

  const body = interpolateSmsTemplate(
    options.templateOverride?.trim() || strings.smsDefault,
    vars,
  );
  const subject = interpolateSmsTemplate(strings.subject, vars);
  const greeting = interpolateSmsTemplate(strings.greeting, vars);
  const signoff = interpolateSmsTemplate(strings.signoff, vars);

  const emailHtml =
    `<div style="font-family:system-ui,sans-serif;line-height:1.5;max-width:600px;">` +
    `<p>${escapeHtml(greeting)}</p>` +
    `<p>${escapeHtml(body)}</p>` +
    `<p>${escapeHtml(signoff)}<br/>${escapeHtml(options.variables.company_name)}</p>` +
    `</div>`;

  return { smsBody: body, emailSubject: subject, emailHtml };
}
