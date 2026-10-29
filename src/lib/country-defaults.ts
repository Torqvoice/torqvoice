import { type Locale, locales } from '@/i18n/config'
import { currencyDefinition } from '@/lib/currencies'

/**
 * What a new workshop is offered once it says which country it is in.
 *
 * Suggestions only: onboarding shows every one of them and the owner keeps or
 * changes each, so nothing here is a silent guess. Facts that change by law
 * (tax rates above all) are deliberately absent; the tax name is a label the
 * owner can retype. Date order and the clock are read from the browser's own
 * locale data rather than kept in a table that would drift.
 */

export type DistanceSystem = 'metric' | 'imperial'
export type DateFormatOption = 'dd/MM/yyyy' | 'dd.MM.yyyy' | 'MM/dd/yyyy' | 'yyyy-MM-dd'

export interface CountryDefaults {
  /** ISO 3166-1 alpha-2. */
  country: string
  /** The language the country writes in (BCP 47), shipped by the app or not. */
  language: string
  /** The app language to write documents in, when we ship the country's language. */
  locale: Locale | undefined
  /** ISO 4217, only when the app offers it. */
  currency: string | undefined
  /** Calling code with its plus, "+33". */
  dialCode: string
  /** Kilometres or miles. */
  distance: DistanceSystem
  /** Litres and kilograms, or quarts, gallons and pounds. */
  measure: DistanceSystem
  dateFormat: DateFormatOption
  timeFormat: '12h' | '24h'
  /** What the tax is called on an invoice there, when it has a common name. */
  taxLabel: string | undefined
}

/**
 * Country, currency, calling code and main language (BCP 47). The language
 * picks the app locale and, with the country, how dates are written there.
 */
const COUNTRIES: Record<string, [currency: string, dial: string, language: string]> = {
  // Europe
  AD: ['EUR', '376', 'ca'],
  AL: ['ALL', '355', 'sq'],
  AT: ['EUR', '43', 'de'],
  BA: ['BAM', '387', 'bs'],
  BE: ['EUR', '32', 'nl'],
  BG: ['EUR', '359', 'bg'],
  BY: ['BYN', '375', 'ru'],
  CH: ['CHF', '41', 'de'],
  CY: ['EUR', '357', 'el'],
  CZ: ['CZK', '420', 'cs'],
  DE: ['EUR', '49', 'de'],
  DK: ['DKK', '45', 'da'],
  EE: ['EUR', '372', 'et'],
  ES: ['EUR', '34', 'es'],
  FI: ['EUR', '358', 'fi'],
  FO: ['DKK', '298', 'fo'],
  FR: ['EUR', '33', 'fr'],
  GB: ['GBP', '44', 'en'],
  GI: ['GIP', '350', 'en'],
  GR: ['EUR', '30', 'el'],
  HR: ['EUR', '385', 'hr'],
  HU: ['HUF', '36', 'hu'],
  IE: ['EUR', '353', 'en'],
  IS: ['ISK', '354', 'is'],
  IT: ['EUR', '39', 'it'],
  LI: ['CHF', '423', 'de'],
  LT: ['EUR', '370', 'lt'],
  LU: ['EUR', '352', 'fr'],
  LV: ['EUR', '371', 'lv'],
  MC: ['EUR', '377', 'fr'],
  MD: ['MDL', '373', 'ro'],
  ME: ['EUR', '382', 'sr'],
  MK: ['MKD', '389', 'mk'],
  MT: ['EUR', '356', 'en'],
  NL: ['EUR', '31', 'nl'],
  NO: ['NOK', '47', 'nb'],
  PL: ['PLN', '48', 'pl'],
  PT: ['EUR', '351', 'pt'],
  RO: ['RON', '40', 'ro'],
  RS: ['RSD', '381', 'sr'],
  RU: ['RUB', '7', 'ru'],
  SE: ['SEK', '46', 'sv'],
  SI: ['EUR', '386', 'sl'],
  SK: ['EUR', '421', 'sk'],
  SM: ['EUR', '378', 'it'],
  TR: ['TRY', '90', 'tr'],
  UA: ['UAH', '380', 'uk'],
  XK: ['EUR', '383', 'sq'],
  AX: ['EUR', '358', 'sv'],
  GG: ['GBP', '44', 'en'],
  IM: ['GBP', '44', 'en'],
  JE: ['GBP', '44', 'en'],
  SJ: ['NOK', '47', 'nb'],
  VA: ['EUR', '39', 'it'],
  // Americas
  AR: ['ARS', '54', 'es'],
  BB: ['BBD', '1', 'en'],
  BO: ['BOB', '591', 'es'],
  BR: ['BRL', '55', 'pt'],
  BS: ['BSD', '1', 'en'],
  CA: ['CAD', '1', 'en'],
  CL: ['CLP', '56', 'es'],
  CO: ['COP', '57', 'es'],
  CR: ['CRC', '506', 'es'],
  CU: ['CUP', '53', 'es'],
  DO: ['DOP', '1', 'es'],
  EC: ['USD', '593', 'es'],
  GT: ['GTQ', '502', 'es'],
  HN: ['HNL', '504', 'es'],
  JM: ['JMD', '1', 'en'],
  MX: ['MXN', '52', 'es'],
  NI: ['NIO', '505', 'es'],
  PA: ['USD', '507', 'es'],
  PE: ['PEN', '51', 'es'],
  PR: ['USD', '1', 'es'],
  PY: ['PYG', '595', 'es'],
  SV: ['USD', '503', 'es'],
  TT: ['TTD', '1', 'en'],
  US: ['USD', '1', 'en'],
  UY: ['UYU', '598', 'es'],
  VE: ['VES', '58', 'es'],
  AG: ['XCD', '1', 'en'],
  AI: ['XCD', '1', 'en'],
  AW: ['AWG', '297', 'nl'],
  BL: ['EUR', '590', 'fr'],
  BM: ['BMD', '1', 'en'],
  BQ: ['USD', '599', 'nl'],
  BZ: ['BZD', '501', 'en'],
  CW: ['XCG', '599', 'nl'],
  DM: ['XCD', '1', 'en'],
  FK: ['FKP', '500', 'en'],
  GD: ['XCD', '1', 'en'],
  GF: ['EUR', '594', 'fr'],
  GL: ['DKK', '299', 'kl'],
  GP: ['EUR', '590', 'fr'],
  GY: ['GYD', '592', 'en'],
  HT: ['HTG', '509', 'fr'],
  KN: ['XCD', '1', 'en'],
  KY: ['KYD', '1', 'en'],
  LC: ['XCD', '1', 'en'],
  MF: ['EUR', '590', 'fr'],
  MQ: ['EUR', '596', 'fr'],
  MS: ['XCD', '1', 'en'],
  PM: ['EUR', '508', 'fr'],
  SR: ['SRD', '597', 'nl'],
  SX: ['XCG', '1', 'nl'],
  TC: ['USD', '1', 'en'],
  VC: ['XCD', '1', 'en'],
  VG: ['USD', '1', 'en'],
  VI: ['USD', '1', 'en'],
  // Asia and Oceania
  AE: ['AED', '971', 'ar'],
  AF: ['AFN', '93', 'fa'],
  AM: ['AMD', '374', 'hy'],
  AU: ['AUD', '61', 'en'],
  AZ: ['AZN', '994', 'az'],
  BD: ['BDT', '880', 'bn'],
  BH: ['BHD', '973', 'ar'],
  CN: ['CNY', '86', 'zh'],
  FJ: ['FJD', '679', 'en'],
  GE: ['GEL', '995', 'ka'],
  HK: ['HKD', '852', 'zh'],
  ID: ['IDR', '62', 'id'],
  IL: ['ILS', '972', 'he'],
  IN: ['INR', '91', 'en'],
  IQ: ['IQD', '964', 'ar'],
  IR: ['IRR', '98', 'fa'],
  JO: ['JOD', '962', 'ar'],
  JP: ['JPY', '81', 'ja'],
  KH: ['KHR', '855', 'km'],
  KR: ['KRW', '82', 'ko'],
  KW: ['KWD', '965', 'ar'],
  KZ: ['KZT', '7', 'ru'],
  LB: ['LBP', '961', 'ar'],
  LK: ['LKR', '94', 'si'],
  MM: ['MMK', '95', 'my'],
  MN: ['MNT', '976', 'mn'],
  MY: ['MYR', '60', 'ms'],
  NP: ['NPR', '977', 'ne'],
  NZ: ['NZD', '64', 'en'],
  OM: ['OMR', '968', 'ar'],
  PG: ['PGK', '675', 'en'],
  PH: ['PHP', '63', 'en'],
  PK: ['PKR', '92', 'en'],
  QA: ['QAR', '974', 'ar'],
  SA: ['SAR', '966', 'ar'],
  SG: ['SGD', '65', 'en'],
  TH: ['THB', '66', 'th'],
  TW: ['TWD', '886', 'zh'],
  UZ: ['UZS', '998', 'uz'],
  VN: ['VND', '84', 'vi'],
  AS: ['USD', '1', 'en'],
  BN: ['BND', '673', 'ms'],
  BT: ['BTN', '975', 'dz'],
  CC: ['AUD', '61', 'en'],
  CK: ['NZD', '682', 'en'],
  CX: ['AUD', '61', 'en'],
  FM: ['USD', '691', 'en'],
  GU: ['USD', '1', 'en'],
  KG: ['KGS', '996', 'ky'],
  KI: ['AUD', '686', 'en'],
  KP: ['KPW', '850', 'ko'],
  LA: ['LAK', '856', 'lo'],
  MH: ['USD', '692', 'en'],
  MO: ['MOP', '853', 'zh'],
  MP: ['USD', '1', 'en'],
  MV: ['MVR', '960', 'dv'],
  NC: ['XPF', '687', 'fr'],
  NF: ['AUD', '672', 'en'],
  NR: ['AUD', '674', 'en'],
  NU: ['NZD', '683', 'en'],
  PF: ['XPF', '689', 'fr'],
  PN: ['NZD', '64', 'en'],
  PS: ['ILS', '970', 'ar'],
  PW: ['USD', '680', 'en'],
  SB: ['SBD', '677', 'en'],
  SY: ['SYP', '963', 'ar'],
  TJ: ['TJS', '992', 'tg'],
  TK: ['NZD', '690', 'en'],
  TL: ['USD', '670', 'pt'],
  TM: ['TMT', '993', 'tk'],
  TO: ['TOP', '676', 'en'],
  TV: ['AUD', '688', 'en'],
  VU: ['VUV', '678', 'en'],
  WF: ['XPF', '681', 'fr'],
  WS: ['WST', '685', 'en'],
  YE: ['YER', '967', 'ar'],
  // Africa
  AO: ['AOA', '244', 'pt'],
  BW: ['BWP', '267', 'en'],
  CI: ['XOF', '225', 'fr'],
  CM: ['XAF', '237', 'fr'],
  DZ: ['DZD', '213', 'ar'],
  EG: ['EGP', '20', 'ar'],
  ET: ['ETB', '251', 'am'],
  GH: ['GHS', '233', 'en'],
  KE: ['KES', '254', 'en'],
  LY: ['LYD', '218', 'ar'],
  MA: ['MAD', '212', 'ar'],
  MG: ['MGA', '261', 'fr'],
  MU: ['MUR', '230', 'en'],
  MZ: ['MZN', '258', 'pt'],
  NA: ['NAD', '264', 'en'],
  NG: ['NGN', '234', 'en'],
  RW: ['RWF', '250', 'en'],
  SD: ['SDG', '249', 'ar'],
  SN: ['XOF', '221', 'fr'],
  TN: ['TND', '216', 'ar'],
  TZ: ['TZS', '255', 'sw'],
  UG: ['UGX', '256', 'en'],
  ZA: ['ZAR', '27', 'en'],
  ZM: ['ZMW', '260', 'en'],
  ZW: ['USD', '263', 'en'],
  BF: ['XOF', '226', 'fr'],
  BI: ['BIF', '257', 'fr'],
  BJ: ['XOF', '229', 'fr'],
  CD: ['CDF', '243', 'fr'],
  CF: ['XAF', '236', 'fr'],
  CG: ['XAF', '242', 'fr'],
  CV: ['CVE', '238', 'pt'],
  DJ: ['DJF', '253', 'fr'],
  ER: ['ERN', '291', 'ti'],
  GA: ['XAF', '241', 'fr'],
  GM: ['GMD', '220', 'en'],
  GN: ['GNF', '224', 'fr'],
  GQ: ['XAF', '240', 'es'],
  GW: ['XOF', '245', 'pt'],
  KM: ['KMF', '269', 'fr'],
  LR: ['LRD', '231', 'en'],
  LS: ['LSL', '266', 'en'],
  ML: ['XOF', '223', 'fr'],
  MR: ['MRU', '222', 'ar'],
  MW: ['MWK', '265', 'en'],
  NE: ['XOF', '227', 'fr'],
  RE: ['EUR', '262', 'fr'],
  SC: ['SCR', '248', 'en'],
  SH: ['SHP', '290', 'en'],
  SL: ['SLE', '232', 'en'],
  SO: ['SOS', '252', 'so'],
  SS: ['SSP', '211', 'en'],
  ST: ['STN', '239', 'pt'],
  SZ: ['SZL', '268', 'en'],
  TD: ['XAF', '235', 'fr'],
  TG: ['XOF', '228', 'fr'],
  YT: ['EUR', '262', 'fr'],
}

/** Countries that drive in miles. */
const MILES = new Set(['US', 'GB', 'GG', 'IM', 'JE', 'LR', 'MM', 'PR', 'GU', 'VI', 'AS', 'MP'])
/** Countries that buy oil by the quart and parts by the pound. */
const US_CUSTOMARY = new Set(['US', 'LR', 'MM', 'PR', 'GU', 'VI', 'AS', 'MP'])

/** The name a sales tax goes by on an invoice, where there is one common name. */
const TAX_LABELS: Record<string, string> = {
  GB: 'VAT',
  IE: 'VAT',
  MT: 'VAT',
  CY: 'VAT',
  ZA: 'VAT',
  AE: 'VAT',
  SA: 'VAT',
  PL: 'VAT',
  FR: 'TVA',
  LU: 'TVA',
  MC: 'TVA',
  RO: 'TVA',
  DE: 'MwSt.',
  AT: 'MwSt.',
  CH: 'MWST',
  LI: 'MWST',
  IT: 'IVA',
  SM: 'IVA',
  ES: 'IVA',
  PT: 'IVA',
  MX: 'IVA',
  AR: 'IVA',
  CL: 'IVA',
  CO: 'IVA',
  UY: 'IVA',
  NL: 'BTW',
  NO: 'MVA',
  SE: 'Moms',
  DK: 'Moms',
  FI: 'ALV',
  IS: 'VSK',
  LT: 'PVM',
  LV: 'PVN',
  EE: 'KM',
  CZ: 'DPH',
  SK: 'DPH',
  HU: 'ÁFA',
  HR: 'PDV',
  SI: 'DDV',
  BG: 'ДДС',
  GR: 'ΦΠΑ',
  RU: 'НДС',
  TR: 'KDV',
  AU: 'GST',
  NZ: 'GST',
  CA: 'GST',
  SG: 'GST',
  IN: 'GST',
  MY: 'SST',
  US: 'Sales tax',
}

/** Where a country speaks more than one of our languages, the label follows the language. */
const TAX_LABELS_BY_LANGUAGE: Record<string, Record<string, string>> = {
  BE: { fr: 'TVA', nl: 'BTW', de: 'MwSt.' },
  CH: { fr: 'TVA', it: 'IVA', de: 'MWST' },
}

/** The countries a workshop can choose, as ISO codes. */
export const COUNTRY_CODES: readonly string[] = Object.keys(COUNTRIES).sort()

/** Names people search for that neither the English nor the local name contains. */
const SEARCH_ALIASES: Record<string, string> = {
  GB: 'UK England Scotland Wales Northern Ireland Great Britain Britain',
  US: 'USA America',
  AE: 'UAE Emirates Dubai',
  NL: 'Holland',
  CZ: 'Czech Republic',
  KR: 'Korea',
  KP: 'Korea',
  CI: 'Ivory Coast',
  CD: 'DRC Congo',
  CG: 'Congo',
  MM: 'Burma',
  SZ: 'Swaziland',
  TR: 'Turkey',
  MK: 'Macedonia',
  CV: 'Cape Verde',
  TL: 'East Timor',
  VA: 'Holy See Vatican',
  BA: 'Bosnia',
}

/**
 * What a country is found by in the picker, besides its name in the owner's
 * own language: its code, its English name, its name in its own language and
 * the short names people type ("UK" for Storbritannia).
 */
export function countrySearchTerms(code: string): string {
  const cc = code.toUpperCase()
  const name = (locale: string) => {
    try {
      return new Intl.DisplayNames([locale], { type: 'region', fallback: 'none' }).of(cc) ?? ''
    } catch {
      return ''
    }
  }
  const local = COUNTRIES[cc] ? name(`${COUNTRIES[cc][2]}-${cc}`) : ''
  return [cc, name('en'), local, SEARCH_ALIASES[cc] ?? ''].filter(Boolean).join(' ')
}

/**
 * The time zone to suggest for a workshop in a country: the browser's own
 * when it is in that country, otherwise the country's first listed zone (its
 * capital's, or its most populous). Undefined where the table has none.
 */
export function timeZoneFor(country: string, browserZone: string | undefined): string | undefined {
  const cc = country.toUpperCase()
  if (browserZone && ZONE_COUNTRIES[browserZone] === cc) return browserZone
  for (const [zone, code] of Object.entries(ZONE_COUNTRIES)) if (code === cc) return zone
  // Kosovo has no zone of its own in the time zone database; it keeps Belgrade's.
  return cc === 'XK' ? 'Europe/Belgrade' : undefined
}

export function isCountryCode(value: unknown): value is string {
  return typeof value === 'string' && value in COUNTRIES
}

/** Our app locale for a language spoken in a country, if we ship it. */
export function appLocaleFor(language: string, country: string): Locale | undefined {
  const lang = language.toLowerCase().split('-')[0]
  if (lang === 'pt') return country === 'BR' ? 'pt-BR' : 'pt-PT'
  if (lang === 'nb' || lang === 'no' || lang === 'nn') return 'nb'
  return (locales as readonly string[]).includes(lang) ? (lang as Locale) : undefined
}

/**
 * The closest of the app's date formats to how dates are written in a
 * locale: day, month or year first, and the separator used.
 */
export function dateFormatFor(locale: string): DateFormatOption {
  try {
    const parts = new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date(Date.UTC(2026, 1, 15, 12)))
    const order = parts.filter((p) => p.type !== 'literal').map((p) => p.type)
    const separator = parts.find((p) => p.type === 'literal')?.value.trim() ?? '/'
    if (order[0] === 'year') return 'yyyy-MM-dd'
    if (order[0] === 'month') return 'MM/dd/yyyy'
    return separator === '.' ? 'dd.MM.yyyy' : 'dd/MM/yyyy'
  } catch {
    return 'dd/MM/yyyy'
  }
}

/** Whether a locale reads the clock in twelve hours or twenty-four. */
export function timeFormatFor(locale: string): '12h' | '24h' {
  try {
    const { hour12 } = new Intl.DateTimeFormat(locale, { hour: 'numeric' }).resolvedOptions()
    return hour12 ? '12h' : '24h'
  } catch {
    return '24h'
  }
}

/**
 * Everything onboarding suggests for a country. `preferredLanguage` is the
 * owner's own, from the browser, and wins where the country speaks it: a
 * French-speaking Belgian workshop gets French, a Flemish one Dutch.
 */
export function countryDefaults(country: string, preferredLanguage?: string): CountryDefaults {
  const cc = country.toUpperCase()
  const [currency, dial, mainLanguage] = COUNTRIES[cc] ?? ['USD', '1', 'en']
  const browserLanguage = preferredLanguage?.toLowerCase().split('-')[0]
  const spoken = multilingual(cc)
  const language =
    browserLanguage && spoken.includes(browserLanguage) ? browserLanguage : mainLanguage
  const formatLocale = `${language}-${cc}`
  return {
    country: cc,
    language,
    locale: appLocaleFor(language, cc),
    currency: currencyDefinition(currency) ? currency : undefined,
    dialCode: `+${dial}`,
    distance: MILES.has(cc) ? 'imperial' : 'metric',
    measure: US_CUSTOMARY.has(cc) ? 'imperial' : 'metric',
    dateFormat: dateFormatFor(formatLocale),
    timeFormat: timeFormatFor(formatLocale),
    taxLabel: TAX_LABELS_BY_LANGUAGE[cc]?.[language] ?? TAX_LABELS[cc],
  }
}

/** The languages a country commonly writes business documents in. */
function multilingual(country: string): string[] {
  switch (country) {
    case 'BE':
      return ['nl', 'fr', 'de']
    case 'CH':
      return ['de', 'fr', 'it']
    case 'CA':
      return ['en', 'fr']
    case 'LU':
      return ['fr', 'de']
    case 'FI':
      return ['fi', 'sv']
    default:
      return [COUNTRIES[country]?.[2] ?? 'en']
  }
}

/**
 * The time zones that settle a country on their own. A browser's zone is the
 * best clue to where the workshop is: an owner can read English in Lyon, but
 * the clock says Paris.
 */
const ZONE_COUNTRIES: Record<string, string> = {
  'Europe/Andorra': 'AD',
  'Europe/Tirane': 'AL',
  'Europe/Vienna': 'AT',
  'Europe/Sarajevo': 'BA',
  'Europe/Brussels': 'BE',
  'Europe/Sofia': 'BG',
  'Europe/Minsk': 'BY',
  'Europe/Zurich': 'CH',
  'Asia/Nicosia': 'CY',
  'Europe/Nicosia': 'CY',
  'Europe/Prague': 'CZ',
  'Europe/Berlin': 'DE',
  'Europe/Copenhagen': 'DK',
  'Europe/Tallinn': 'EE',
  'Europe/Madrid': 'ES',
  'Atlantic/Canary': 'ES',
  'Europe/Helsinki': 'FI',
  'Atlantic/Faroe': 'FO',
  'Europe/Paris': 'FR',
  'Europe/London': 'GB',
  'Europe/Gibraltar': 'GI',
  'Europe/Athens': 'GR',
  'Europe/Zagreb': 'HR',
  'Europe/Budapest': 'HU',
  'Europe/Dublin': 'IE',
  'Atlantic/Reykjavik': 'IS',
  'Europe/Rome': 'IT',
  'Europe/Vaduz': 'LI',
  'Europe/Vilnius': 'LT',
  'Europe/Luxembourg': 'LU',
  'Europe/Riga': 'LV',
  'Europe/Monaco': 'MC',
  'Europe/Chisinau': 'MD',
  'Europe/Podgorica': 'ME',
  'Europe/Skopje': 'MK',
  'Europe/Malta': 'MT',
  'Europe/Amsterdam': 'NL',
  'Europe/Oslo': 'NO',
  'Europe/Warsaw': 'PL',
  'Europe/Lisbon': 'PT',
  'Atlantic/Madeira': 'PT',
  'Atlantic/Azores': 'PT',
  'Europe/Bucharest': 'RO',
  'Europe/Belgrade': 'RS',
  'Europe/Moscow': 'RU',
  'Europe/Stockholm': 'SE',
  'Europe/Ljubljana': 'SI',
  'Europe/Bratislava': 'SK',
  'Europe/San_Marino': 'SM',
  'Europe/Istanbul': 'TR',
  'Europe/Kyiv': 'UA',
  'Europe/Kiev': 'UA',
  'America/Argentina/Buenos_Aires': 'AR',
  'America/Buenos_Aires': 'AR',
  'America/Barbados': 'BB',
  'America/La_Paz': 'BO',
  'America/Sao_Paulo': 'BR',
  'America/Nassau': 'BS',
  'America/Toronto': 'CA',
  'America/Vancouver': 'CA',
  'America/Edmonton': 'CA',
  'America/Winnipeg': 'CA',
  'America/Halifax': 'CA',
  'America/St_Johns': 'CA',
  'America/Regina': 'CA',
  'America/Montreal': 'CA',
  'America/Santiago': 'CL',
  'America/Bogota': 'CO',
  'America/Costa_Rica': 'CR',
  'America/Havana': 'CU',
  'America/Santo_Domingo': 'DO',
  'America/Guayaquil': 'EC',
  'America/Guatemala': 'GT',
  'America/Tegucigalpa': 'HN',
  'America/Jamaica': 'JM',
  'America/Mexico_City': 'MX',
  'America/Monterrey': 'MX',
  'America/Tijuana': 'MX',
  'America/Cancun': 'MX',
  'America/Managua': 'NI',
  'America/Panama': 'PA',
  'America/Lima': 'PE',
  'America/Puerto_Rico': 'PR',
  'America/Asuncion': 'PY',
  'America/El_Salvador': 'SV',
  'America/Port_of_Spain': 'TT',
  'America/New_York': 'US',
  'America/Chicago': 'US',
  'America/Denver': 'US',
  'America/Phoenix': 'US',
  'America/Los_Angeles': 'US',
  'America/Anchorage': 'US',
  'Pacific/Honolulu': 'US',
  'America/Detroit': 'US',
  'America/Boise': 'US',
  'America/Indiana/Indianapolis': 'US',
  'America/Montevideo': 'UY',
  'America/Caracas': 'VE',
  'Asia/Dubai': 'AE',
  'Asia/Kabul': 'AF',
  'Asia/Yerevan': 'AM',
  'Australia/Sydney': 'AU',
  'Australia/Melbourne': 'AU',
  'Australia/Brisbane': 'AU',
  'Australia/Perth': 'AU',
  'Australia/Adelaide': 'AU',
  'Australia/Hobart': 'AU',
  'Australia/Darwin': 'AU',
  'Asia/Baku': 'AZ',
  'Asia/Dhaka': 'BD',
  'Asia/Bahrain': 'BH',
  'Asia/Shanghai': 'CN',
  'Pacific/Fiji': 'FJ',
  'Asia/Tbilisi': 'GE',
  'Asia/Hong_Kong': 'HK',
  'Asia/Jakarta': 'ID',
  'Asia/Jerusalem': 'IL',
  'Asia/Kolkata': 'IN',
  'Asia/Calcutta': 'IN',
  'Asia/Baghdad': 'IQ',
  'Asia/Tehran': 'IR',
  'Asia/Amman': 'JO',
  'Asia/Tokyo': 'JP',
  'Asia/Phnom_Penh': 'KH',
  'Asia/Seoul': 'KR',
  'Asia/Kuwait': 'KW',
  'Asia/Almaty': 'KZ',
  'Asia/Beirut': 'LB',
  'Asia/Colombo': 'LK',
  'Asia/Yangon': 'MM',
  'Asia/Ulaanbaatar': 'MN',
  'Asia/Kuala_Lumpur': 'MY',
  'Asia/Kathmandu': 'NP',
  'Pacific/Auckland': 'NZ',
  'Asia/Muscat': 'OM',
  'Pacific/Port_Moresby': 'PG',
  'Asia/Manila': 'PH',
  'Asia/Karachi': 'PK',
  'Asia/Qatar': 'QA',
  'Asia/Riyadh': 'SA',
  'Asia/Singapore': 'SG',
  'Asia/Bangkok': 'TH',
  'Asia/Taipei': 'TW',
  'Asia/Tashkent': 'UZ',
  'Asia/Ho_Chi_Minh': 'VN',
  'Asia/Saigon': 'VN',
  'Africa/Luanda': 'AO',
  'Africa/Gaborone': 'BW',
  'Africa/Abidjan': 'CI',
  'Africa/Douala': 'CM',
  'Africa/Algiers': 'DZ',
  'Africa/Cairo': 'EG',
  'Africa/Addis_Ababa': 'ET',
  'Africa/Accra': 'GH',
  'Africa/Nairobi': 'KE',
  'Africa/Tripoli': 'LY',
  'Africa/Casablanca': 'MA',
  'Indian/Antananarivo': 'MG',
  'Indian/Mauritius': 'MU',
  'Africa/Maputo': 'MZ',
  'Africa/Windhoek': 'NA',
  'Africa/Lagos': 'NG',
  'Africa/Kigali': 'RW',
  'Africa/Khartoum': 'SD',
  'Africa/Dakar': 'SN',
  'Africa/Tunis': 'TN',
  'Africa/Dar_es_Salaam': 'TZ',
  'Africa/Kampala': 'UG',
  'Africa/Johannesburg': 'ZA',
  'Africa/Lusaka': 'ZM',
  'Africa/Harare': 'ZW',
  'Europe/Mariehamn': 'AX',
  'Europe/Guernsey': 'GG',
  'Europe/Isle_of_Man': 'IM',
  'Europe/Jersey': 'JE',
  'Arctic/Longyearbyen': 'SJ',
  'Europe/Vatican': 'VA',
  'America/Antigua': 'AG',
  'America/Anguilla': 'AI',
  'America/Aruba': 'AW',
  'America/St_Barthelemy': 'BL',
  'Atlantic/Bermuda': 'BM',
  'America/Kralendijk': 'BQ',
  'America/Belize': 'BZ',
  'America/Curacao': 'CW',
  'America/Dominica': 'DM',
  'Atlantic/Stanley': 'FK',
  'America/Grenada': 'GD',
  'America/Cayenne': 'GF',
  'America/Nuuk': 'GL',
  'America/Godthab': 'GL',
  'America/Guadeloupe': 'GP',
  'America/Guyana': 'GY',
  'America/Port-au-Prince': 'HT',
  'America/St_Kitts': 'KN',
  'America/Cayman': 'KY',
  'America/St_Lucia': 'LC',
  'America/Marigot': 'MF',
  'America/Martinique': 'MQ',
  'America/Montserrat': 'MS',
  'America/Miquelon': 'PM',
  'America/Paramaribo': 'SR',
  'America/Lower_Princes': 'SX',
  'America/Grand_Turk': 'TC',
  'America/St_Vincent': 'VC',
  'America/Tortola': 'VG',
  'America/St_Thomas': 'VI',
  'Pacific/Pago_Pago': 'AS',
  'Asia/Brunei': 'BN',
  'Asia/Thimphu': 'BT',
  'Indian/Cocos': 'CC',
  'Pacific/Rarotonga': 'CK',
  'Indian/Christmas': 'CX',
  'Pacific/Pohnpei': 'FM',
  'Pacific/Guam': 'GU',
  'Asia/Bishkek': 'KG',
  'Pacific/Tarawa': 'KI',
  'Asia/Pyongyang': 'KP',
  'Asia/Vientiane': 'LA',
  'Pacific/Majuro': 'MH',
  'Asia/Macau': 'MO',
  'Pacific/Saipan': 'MP',
  'Indian/Maldives': 'MV',
  'Pacific/Noumea': 'NC',
  'Pacific/Norfolk': 'NF',
  'Pacific/Nauru': 'NR',
  'Pacific/Niue': 'NU',
  'Pacific/Tahiti': 'PF',
  'Pacific/Pitcairn': 'PN',
  'Asia/Gaza': 'PS',
  'Asia/Hebron': 'PS',
  'Pacific/Palau': 'PW',
  'Pacific/Guadalcanal': 'SB',
  'Asia/Damascus': 'SY',
  'Asia/Dushanbe': 'TJ',
  'Pacific/Fakaofo': 'TK',
  'Asia/Dili': 'TL',
  'Asia/Ashgabat': 'TM',
  'Pacific/Tongatapu': 'TO',
  'Pacific/Funafuti': 'TV',
  'Pacific/Efate': 'VU',
  'Pacific/Wallis': 'WF',
  'Pacific/Apia': 'WS',
  'Asia/Aden': 'YE',
  'Africa/Ouagadougou': 'BF',
  'Africa/Bujumbura': 'BI',
  'Africa/Porto-Novo': 'BJ',
  'Africa/Kinshasa': 'CD',
  'Africa/Lubumbashi': 'CD',
  'Africa/Bangui': 'CF',
  'Africa/Brazzaville': 'CG',
  'Atlantic/Cape_Verde': 'CV',
  'Africa/Djibouti': 'DJ',
  'Africa/Asmara': 'ER',
  'Africa/Libreville': 'GA',
  'Africa/Banjul': 'GM',
  'Africa/Conakry': 'GN',
  'Africa/Malabo': 'GQ',
  'Africa/Bissau': 'GW',
  'Indian/Comoro': 'KM',
  'Africa/Monrovia': 'LR',
  'Africa/Maseru': 'LS',
  'Africa/Bamako': 'ML',
  'Africa/Nouakchott': 'MR',
  'Africa/Blantyre': 'MW',
  'Africa/Niamey': 'NE',
  'Indian/Reunion': 'RE',
  'Indian/Mahe': 'SC',
  'Atlantic/St_Helena': 'SH',
  'Africa/Freetown': 'SL',
  'Africa/Mogadishu': 'SO',
  'Africa/Juba': 'SS',
  'Africa/Sao_Tome': 'ST',
  'Africa/Mbabane': 'SZ',
  'Africa/Ndjamena': 'TD',
  'Africa/Lome': 'TG',
  'Indian/Mayotte': 'YT',
}

/**
 * The country the browser most likely sits in: its time zone first, then the
 * region of its preferred languages. Null when neither says, and the owner
 * picks.
 */
export function detectCountry(
  timeZone: string | undefined,
  languages: readonly string[]
): string | null {
  const fromZone = timeZone ? ZONE_COUNTRIES[timeZone] : undefined
  if (fromZone) return fromZone
  for (const tag of languages) {
    const region = tag.split('-')[1]?.toUpperCase()
    if (region && isCountryCode(region)) return region
  }
  return null
}
