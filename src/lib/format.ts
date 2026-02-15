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
