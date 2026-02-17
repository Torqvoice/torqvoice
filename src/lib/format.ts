const CURRENCY_LOCALES: Record<string, string> = {
  USD: "en-US",
  EUR: "de-DE",
  GBP: "en-GB",
  NOK: "nb-NO",
  SEK: "sv-SE",
  DKK: "da-DK",
  CHF: "de-CH",
  JPY: "ja-JP",
  CAD: "en-CA",
  AUD: "en-AU",
  NZD: "en-NZ",
  PLN: "pl-PL",
  CZK: "cs-CZ",
  HUF: "hu-HU",
  BRL: "pt-BR",
  MXN: "es-MX",
  INR: "en-IN",
  CNY: "zh-CN",
  KRW: "ko-KR",
  TRY: "tr-TR",
  ZAR: "en-ZA",
  RUB: "ru-RU",
  ISK: "is-IS",
  THB: "th-TH",
  SGD: "en-SG",
  HKD: "zh-HK",
  TWD: "zh-TW",
  PHP: "en-PH",
  ILS: "he-IL",
  AED: "ar-AE",
  SAR: "ar-SA",
  RON: "ro-RO",
  BGN: "bg-BG",
  HRK: "hr-HR",
  UAH: "uk-UA",
  CLP: "es-CL",
  COP: "es-CO",
  ARS: "es-AR",
  PEN: "es-PE",
  IDR: "id-ID",
  MYR: "ms-MY",
  VND: "vi-VN",
};

/**
 * Format a number as currency using the correct locale for the given ISO 4217 currency code.
 *
 * Examples:
 *   formatCurrency(20412.90, "NOK") → "kr 20 412,90"
 *   formatCurrency(1234.56, "USD") → "$1,234.56"
 *   formatCurrency(1234.56, "EUR") → "1.234,56 €"
 */
export function formatCurrency(
  amount: number,
  currencyCode: string = "USD",
): string {
  const locale = CURRENCY_LOCALES[currencyCode] || "en-US";
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currencyCode,
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    // Fallback if the currency code is not recognized by Intl
    return `${currencyCode} ${amount.toFixed(2)}`;
  }
}

/**
 * Get just the currency symbol for a given ISO 4217 code.
 * Useful for column headers like "Rate (kr/hr)".
 *
 * Examples:
 *   getCurrencySymbol("NOK") → "kr"
 *   getCurrencySymbol("USD") → "$"
 *   getCurrencySymbol("EUR") → "€"
 */
export function getCurrencySymbol(currencyCode: string = "USD"): string {
  try {
    const parts = new Intl.NumberFormat("en", {
      style: "currency",
      currency: currencyCode,
      currencyDisplay: "narrowSymbol",
    }).formatToParts(0);
    return parts.find((p) => p.type === "currency")?.value || currencyCode;
  } catch {
    return currencyCode;
  }
}

/**
 * Convert a date to a specific timezone by shifting its local representation.
 * Uses Intl.DateTimeFormat to get the date parts in the target timezone,
 * then reconstructs a Date object whose local time matches those parts.
 */
function toTimezone(date: Date, timezone: string): Date {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).formatToParts(date);

    const get = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((p) => p.type === type)?.value || 0);

    return new Date(
      get("year"),
      get("month") - 1,
      get("day"),
      get("hour") === 24 ? 0 : get("hour"),
      get("minute"),
      get("second"),
    );
  } catch {
    return date;
  }
}

/**
 * Default date format matching the most common existing pattern.
 */
export const DEFAULT_DATE_FORMAT = "MMM d, yyyy";
export const DEFAULT_TIME_FORMAT = "12h" as const;

/**
 * Simple date-fns-style format function that handles common tokens.
 * Tokens: yyyy, yy, MMMM, MMM, MM, dd, d, HH, hh, mm, ss, a
 */
function formatWithPattern(date: Date, pattern: string): string {
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const monthsShort = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];

  const y = date.getFullYear();
  const M = date.getMonth();
  const d = date.getDate();
  const H = date.getHours();
  const m = date.getMinutes();
  const s = date.getSeconds();
  const h12 = H % 12 || 12;
  const ampm = H < 12 ? "AM" : "PM";

  // Use placeholders for month names to avoid collisions with later replacements
  // (e.g. "a" in "May" being replaced by the AM/PM token)
  const MONTH_LONG = "\x01";
  const MONTH_SHORT = "\x02";

  return pattern
    .replace("yyyy", String(y))
    .replace("yy", String(y).slice(-2))
    .replace("MMMM", MONTH_LONG)
    .replace("MMM", MONTH_SHORT)
    .replace("MM", String(M + 1).padStart(2, "0"))
    .replace(/\bdd\b/, String(d).padStart(2, "0"))
    .replace(/\bd\b/, String(d))
    .replace("HH", String(H).padStart(2, "0"))
    .replace("hh", String(h12).padStart(2, "0"))
    .replace("mm", String(m).padStart(2, "0"))
    .replace("ss", String(s).padStart(2, "0"))
    .replace("a", ampm)
    .replace(MONTH_LONG, months[M])
    .replace(MONTH_SHORT, monthsShort[M]);
}

/**
 * Format a date using the org date format and optional timezone.
 */
export function formatDate(
  date: Date | string,
  dateFormat: string = DEFAULT_DATE_FORMAT,
  timezone?: string,
): string {
  let d = typeof date === "string" ? new Date(date) : date;
  if (timezone) d = toTimezone(d, timezone);
  return formatWithPattern(d, dateFormat);
}

/**
 * Format a date and time using org settings.
 */
export function formatDateTime(
  date: Date | string,
  dateFormat: string = DEFAULT_DATE_FORMAT,
  timeFormat: "12h" | "24h" = "12h",
  timezone?: string,
): string {
  let d = typeof date === "string" ? new Date(date) : date;
  if (timezone) d = toTimezone(d, timezone);
  const datePart = formatWithPattern(d, dateFormat);
  const timePart = timeFormat === "24h"
    ? formatWithPattern(d, "HH:mm")
    : formatWithPattern(d, "hh:mm a");
  return `${datePart} ${timePart}`;
}

/**
 * Format time only using org settings.
 */
export function formatTime(
  date: Date | string,
  timeFormat: "12h" | "24h" = "12h",
  timezone?: string,
): string {
  let d = typeof date === "string" ? new Date(date) : date;
  if (timezone) d = toTimezone(d, timezone);
  return timeFormat === "24h"
    ? formatWithPattern(d, "HH:mm")
    : formatWithPattern(d, "hh:mm a");
}

/**
 * Format a date for server-side PDF/invoice rendering (uses toLocaleDateString for full month names).
 * Applies timezone if provided, otherwise UTC for server contexts.
 */
export function formatDateForPdf(
  date: Date | string,
  dateFormat: string = DEFAULT_DATE_FORMAT,
  timezone?: string,
): string {
  let d = typeof date === "string" ? new Date(date) : date;
  if (timezone) {
    d = toTimezone(d, timezone);
  }
  return formatWithPattern(d, dateFormat);
}
