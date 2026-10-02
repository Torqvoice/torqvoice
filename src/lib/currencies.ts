import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'

/**
 * Every currency the app knows, and the one place to add another.
 *
 * A new currency is one line here: the Localization dropdown, the formatter
 * and the documents all read this list, and its name comes from the runtime's
 * own locale data, so there is nothing to translate.
 */
export interface CurrencyDefinition {
  /** ISO 4217 code. */
  code: string
  /** The locale whose grouping, decimals and symbol placement amounts follow. */
  locale: string
  /**
   * Print the ISO code where the symbol would go. Set for currencies whose
   * narrow symbol falls outside the WinAnsi encoding used by the default
   * Helvetica font in @react-pdf/renderer (it renders as "?" in PDFs).
   */
  printCode?: true
  /**
   * Replaces CLDR's narrow symbol where that one is ambiguous or locally
   * non-idiomatic on business documents. Applied only in 'symbol' mode.
   */
  symbol?: string
  /** No longer offered in the dropdown, still formatted for workshops that have it stored. */
  retired?: true
}

/** In the order the Localization dropdown lists them: the common ones first. */
export const CURRENCIES: readonly CurrencyDefinition[] = [
  { code: 'USD', locale: 'en-US' },
  { code: 'EUR', locale: 'de-DE' },
  { code: 'GBP', locale: 'en-GB' },
  { code: 'NOK', locale: 'nb-NO' },
  { code: 'SEK', locale: 'sv-SE' },
  { code: 'DKK', locale: 'da-DK' },
  { code: 'CHF', locale: 'de-CH' },
  { code: 'CAD', locale: 'en-CA' },
  { code: 'AUD', locale: 'en-AU' },
  { code: 'NZD', locale: 'en-NZ' },
  { code: 'JPY', locale: 'ja-JP', printCode: true },
  // RMB disambiguates from JPY ¥ and matches Chinese invoice convention.
  { code: 'CNY', locale: 'zh-CN', symbol: 'RMB' },
  { code: 'INR', locale: 'en-IN', printCode: true },
  { code: 'BRL', locale: 'pt-BR' },
  { code: 'MXN', locale: 'es-MX' },
  { code: 'PLN', locale: 'pl-PL', printCode: true },
  { code: 'CZK', locale: 'cs-CZ', printCode: true },
  { code: 'HUF', locale: 'hu-HU' },
  { code: 'TRY', locale: 'tr-TR', printCode: true },
  { code: 'ZAR', locale: 'en-ZA' },
  { code: 'KRW', locale: 'ko-KR', printCode: true },
  { code: 'SGD', locale: 'en-SG' },
  { code: 'HKD', locale: 'zh-HK' },
  { code: 'THB', locale: 'th-TH', printCode: true },
  { code: 'ISK', locale: 'is-IS' },
  { code: 'RON', locale: 'ro-RO' },
  { code: 'ILS', locale: 'en', printCode: true },
  { code: 'PHP', locale: 'en-PH', printCode: true },
  { code: 'IDR', locale: 'id-ID' },
  { code: 'MYR', locale: 'ms-MY' },
  { code: 'LKR', locale: 'en-LK' },
  { code: 'TWD', locale: 'zh-TW' },
  { code: 'VND', locale: 'vi-VN', printCode: true },
  { code: 'PKR', locale: 'en-PK' },
  { code: 'BDT', locale: 'en-BD', printCode: true },
  { code: 'NPR', locale: 'en-NP' },
  { code: 'BGN', locale: 'bg-BG', printCode: true },
  { code: 'UAH', locale: 'uk-UA', printCode: true },
  { code: 'CLP', locale: 'es-CL' },
  { code: 'COP', locale: 'es-CO' },
  { code: 'ARS', locale: 'es-AR' },
  { code: 'PEN', locale: 'es-PE' },
  { code: 'NIO', locale: 'es-NI' },
  { code: 'EGP', locale: 'en-EG' },
  { code: 'NGN', locale: 'en-NG', printCode: true },
  { code: 'KES', locale: 'en-KE' },
  { code: 'MAD', locale: 'en-MA' },
  // French-Algerian formatting gives the idiomatic Latin "DA" symbol; the
  // Arabic locale's د.ج would fall outside the PDF font's encoding.
  { code: 'DZD', locale: 'fr-DZ' },
  { code: 'GHS', locale: 'en-GH', printCode: true },
  { code: 'AED', locale: 'en' },
  { code: 'SAR', locale: 'en' },
  { code: 'QAR', locale: 'en' },
  { code: 'KWD', locale: 'en' },
  { code: 'BHD', locale: 'en' },
  { code: 'OMR', locale: 'en' },
  { code: 'JOD', locale: 'en' },
  { code: 'RUB', locale: 'ru-RU', printCode: true },
  // Every other currency in circulation, alphabetically. Where the country's
  // own locale writes digits or the symbol outside Latin script, amounts follow
  // English formatting instead, so they print in the PDF font.
  { code: 'AFN', locale: 'en', printCode: true },
  { code: 'ALL', locale: 'sq-AL' },
  { code: 'AMD', locale: 'hy-AM', printCode: true },
  { code: 'AOA', locale: 'pt-AO' },
  { code: 'AWG', locale: 'nl-AW' },
  { code: 'AZN', locale: 'az-AZ', printCode: true },
  { code: 'BAM', locale: 'bs-BA' },
  { code: 'BBD', locale: 'en-BB' },
  { code: 'BIF', locale: 'fr-BI' },
  { code: 'BMD', locale: 'en-BM' },
  { code: 'BND', locale: 'ms-BN' },
  { code: 'BOB', locale: 'es-BO' },
  { code: 'BSD', locale: 'en-BS' },
  { code: 'BTN', locale: 'en' },
  { code: 'BWP', locale: 'en-BW' },
  { code: 'BYN', locale: 'ru-BY' },
  { code: 'BZD', locale: 'en-BZ' },
  { code: 'CDF', locale: 'fr-CD' },
  { code: 'CRC', locale: 'es-CR', printCode: true },
  { code: 'CUP', locale: 'es-CU' },
  { code: 'CVE', locale: 'pt-CV', printCode: true },
  { code: 'DJF', locale: 'fr-DJ' },
  { code: 'DOP', locale: 'es-DO' },
  { code: 'ERN', locale: 'en-ER' },
  { code: 'ETB', locale: 'en' },
  { code: 'FJD', locale: 'en-FJ' },
  { code: 'FKP', locale: 'en-FK' },
  { code: 'GEL', locale: 'ka-GE', printCode: true },
  { code: 'GIP', locale: 'en-GI' },
  { code: 'GMD', locale: 'en-GM' },
  { code: 'GNF', locale: 'fr-GN' },
  { code: 'GTQ', locale: 'es-GT' },
  { code: 'GYD', locale: 'en-GY' },
  { code: 'HNL', locale: 'es-HN' },
  { code: 'HTG', locale: 'fr-HT' },
  { code: 'IQD', locale: 'en' },
  { code: 'IRR', locale: 'en' },
  { code: 'JMD', locale: 'en-JM' },
  { code: 'KGS', locale: 'ru-KG', printCode: true },
  { code: 'KHR', locale: 'en', printCode: true },
  { code: 'KMF', locale: 'fr-KM' },
  { code: 'KPW', locale: 'en', printCode: true },
  { code: 'KYD', locale: 'en-KY' },
  { code: 'KZT', locale: 'ru-KZ', printCode: true },
  { code: 'LAK', locale: 'en', printCode: true },
  { code: 'LBP', locale: 'en' },
  { code: 'LRD', locale: 'en-LR' },
  { code: 'LSL', locale: 'en-LS' },
  { code: 'LYD', locale: 'en' },
  { code: 'MDL', locale: 'ro-MD' },
  { code: 'MGA', locale: 'fr-MG' },
  { code: 'MKD', locale: 'mk-MK', printCode: true },
  { code: 'MMK', locale: 'en' },
  { code: 'MNT', locale: 'mn-MN', printCode: true },
  { code: 'MOP', locale: 'zh-MO' },
  { code: 'MRU', locale: 'fr-MR' },
  { code: 'MUR', locale: 'en-MU' },
  { code: 'MVR', locale: 'en' },
  { code: 'MWK', locale: 'en-MW' },
  { code: 'MZN', locale: 'pt-MZ' },
  { code: 'NAD', locale: 'en-NA' },
  { code: 'PAB', locale: 'es-PA' },
  { code: 'PGK', locale: 'en-PG' },
  { code: 'PYG', locale: 'es-PY', printCode: true },
  { code: 'RSD', locale: 'sr-Latn-RS' },
  { code: 'RWF', locale: 'en-RW' },
  { code: 'SBD', locale: 'en-SB' },
  { code: 'SCR', locale: 'en-SC' },
  { code: 'SDG', locale: 'en-SD' },
  { code: 'SHP', locale: 'en-SH' },
  { code: 'SLE', locale: 'en-SL' },
  { code: 'SOS', locale: 'so-SO' },
  { code: 'SRD', locale: 'nl-SR' },
  { code: 'SSP', locale: 'en-SS' },
  { code: 'STN', locale: 'pt-ST' },
  { code: 'SVC', locale: 'es-SV' },
  { code: 'SYP', locale: 'en' },
  { code: 'SZL', locale: 'en-SZ' },
  { code: 'TJS', locale: 'ru' },
  { code: 'TMT', locale: 'tk-TM' },
  { code: 'TND', locale: 'fr-TN' },
  { code: 'TOP', locale: 'en-TO' },
  { code: 'TTD', locale: 'en-TT' },
  { code: 'TZS', locale: 'en-TZ' },
  { code: 'UGX', locale: 'en-UG' },
  { code: 'UYU', locale: 'es-UY' },
  { code: 'UZS', locale: 'uz-UZ', printCode: true },
  { code: 'VES', locale: 'es-VE' },
  { code: 'VUV', locale: 'en-VU' },
  { code: 'WST', locale: 'en-WS' },
  { code: 'XAF', locale: 'fr-CM' },
  { code: 'XCD', locale: 'en-AG' },
  { code: 'XCG', locale: 'nl-CW' },
  { code: 'XOF', locale: 'fr-SN' },
  { code: 'XPF', locale: 'fr-PF' },
  { code: 'YER', locale: 'en' },
  { code: 'ZMW', locale: 'en-ZM' },
  { code: 'ZWG', locale: 'en-ZW' },
  { code: 'HRK', locale: 'hr-HR', retired: true },
]

const BY_CODE = new Map(CURRENCIES.map((c) => [c.code, c]))

/** The currencies a workshop can pick. */
export const SELECTABLE_CURRENCIES = CURRENCIES.filter((c) => !c.retired)

/** What a workshop that never chose a currency is shown. */
export const DEFAULT_CURRENCY_CODE = 'USD'

export type CurrencyFormat = 'symbol' | 'code'
export const DEFAULT_CURRENCY_FORMAT: CurrencyFormat = 'symbol'

export interface CurrencySettings {
  currencyCode: string
  currencyFormat: CurrencyFormat
}

export function currencyDefinition(code: string): CurrencyDefinition | undefined {
  return BY_CODE.get(code)
}

/** A stored or passed currency code, or the default when there is none. */
export function resolveCurrencyCode(value: string | null | undefined): string {
  return value || DEFAULT_CURRENCY_CODE
}

/** A stored or passed format preference, held to the two the app knows. */
export function resolveCurrencyFormat(value: string | null | undefined): CurrencyFormat {
  return value === 'code' ? 'code' : DEFAULT_CURRENCY_FORMAT
}

type SettingsLookup =
  | Record<string, string | null | undefined>
  | Map<string, string | null | undefined>

/** The workshop's currency and format out of a settings map, however it was read. */
export function resolveCurrencySettings(settings: SettingsLookup): CurrencySettings {
  const read = (key: string) => (settings instanceof Map ? settings.get(key) : settings[key])
  return {
    currencyCode: resolveCurrencyCode(read(SETTING_KEYS.CURRENCY_CODE)),
    currencyFormat: resolveCurrencyFormat(read(SETTING_KEYS.CURRENCY_FORMAT)),
  }
}

/**
 * The currency's name in the reader's language, e.g. "Norwegian Krone" or
 * "Norske kroner". A currency newer than the runtime's data for that language
 * gets its English name, and the bare code only where there is none at all.
 */
export function currencyName(code: string, locale: string): string {
  for (const language of [locale, 'en']) {
    try {
      const name = new Intl.DisplayNames([language], { type: 'currency', fallback: 'none' }).of(
        code
      )
      // Several locales write currency names in lower case mid-sentence; here
      // the name stands alone in a list.
      if (name) return name.charAt(0).toLocaleUpperCase(language) + name.slice(1)
    } catch {
      // An unknown locale or a malformed code: try the next, then the code.
    }
  }
  return code
}

/** Lower case with the accents off, so "cordoba" finds "Córdoba". */
function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

/**
 * How well a currency's "CODE Name" label answers what was typed into the
 * currency search, 0 for not at all.
 *
 * A code is matched from its first letter and a name on any run of letters in
 * it. The picker's stock fuzzy match read "NIO" as any label with an n, an i
 * and an o somewhere in it, and listed thirty currencies for it.
 */
export function currencySearchScore(label: string, search: string): number {
  const query = fold(search.trim())
  if (!query) return 1
  const text = fold(label)
  if (text.startsWith(query)) return 1
  const at = text.indexOf(query)
  if (at < 0) return 0
  return text[at - 1] === ' ' ? 0.8 : 0.5
}
