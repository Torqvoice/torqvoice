/**
 * Turning what people type in spreadsheets into what the database stores.
 *
 * Imports come from every country the app is sold in, so nothing here assumes
 * a locale: dates can be day-first, month-first or year-first, decimals can
 * be a comma, phone numbers can lack a country code, and a fuel type can be
 * "Benzin", "Bensin" or "Petrol". Each function is pure so it can be tested
 * on its own.
 */

import { normalizePortalPhone } from '@/lib/portal-phone'

// ── Headers ───────────────────────────────────────────────────────────────────

/** "E-Mail 1 - Value" → "email1value"; "Reg.nr" → "regnr"; "Straße" → "strasse". */
export function normalizeHeader(header: string): string {
  return header
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/ø/gi, 'o')
    .replace(/æ/gi, 'ae')
    .replace(/å/gi, 'a')
    .replace(/ł/gi, 'l')
    .replace(/ı/g, 'i')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

// ── Text ──────────────────────────────────────────────────────────────────────

export function cleanText(value: string | null | undefined): string | null {
  if (value == null) return null
  const trimmed = String(value).replace(/\s+/g, ' ').trim()
  return trimmed.length ? trimmed : null
}

export function normalizeEmail(value: string | null | undefined): {
  value: string | null
  valid: boolean
} {
  const cleaned = cleanText(value)?.toLowerCase() ?? null
  if (!cleaned) return { value: null, valid: true }
  // Same shape zod's email check accepts, kept simple on purpose.
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleaned)
  return { value: cleaned, valid }
}

/**
 * Best-effort E.164. With a workshop country code, a local number becomes
 * international; without one, the number is kept as typed so nothing is
 * lost. Letters (an "ext. 12" suffix) are left alone rather than mangled.
 */
export function normalizePhone(
  value: string | null | undefined,
  defaultCountryCode: string | null
): string | null {
  const cleaned = cleanText(value)
  if (!cleaned) return null
  if (/[a-z]/i.test(cleaned)) return cleaned
  const e164 = normalizePortalPhone(cleaned, defaultCountryCode)
  if (e164 && /^\+\d{7,15}$/.test(e164)) return e164
  return cleaned
}

/** Digits only, for comparing two phone numbers that may be formatted apart. */
export function phoneKey(value: string | null | undefined): string | null {
  if (!value) return null
  const digits = value.replace(/\D/g, '')
  if (digits.length < 6) return null
  // The last eight digits identify a subscriber in every numbering plan the
  // app has met; comparing on them lets "+47 912 34 567" match "91234567".
  return digits.slice(-8)
}

// ── Numbers ───────────────────────────────────────────────────────────────────

export type DecimalSeparator = 'auto' | '.' | ','

/**
 * "1 234,56", "1,234.56", "$1,234.56", "kr 1.234", "(12.50)" and "12,5" all
 * come back as numbers. When only one kind of separator appears once and is
 * followed by exactly three digits, it is read as a thousands separator, so
 * "125.000" km is 125000 and not 125. A leading "0." or "0," is always a
 * decimal.
 */
export function parseNumber(
  value: string | number | null | undefined,
  separator: DecimalSeparator = 'auto'
): number | null {
  if (value == null) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  let s = String(value).trim()
  if (!s) return null
  const negative = /^\(.*\)$/.test(s) || /^-/.test(s.replace(/[^\d\-(]/g, ''))
  s = s.replace(/[^\d.,]/g, '')
  if (!s) return null

  const commas = (s.match(/,/g) ?? []).length
  const dots = (s.match(/\./g) ?? []).length

  let normalized: string
  if (separator === ',') {
    normalized = s.replace(/\./g, '').replace(',', '.')
  } else if (separator === '.') {
    normalized = s.replace(/,/g, '')
  } else if (commas && dots) {
    // Whichever comes last is the decimal mark.
    const lastComma = s.lastIndexOf(',')
    const lastDot = s.lastIndexOf('.')
    normalized = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  } else if (commas === 1 || dots === 1) {
    const mark = commas === 1 ? ',' : '.'
    const [intPart, fracPart] = s.split(mark)
    const thousands = fracPart.length === 3 && intPart.length > 0 && intPart !== '0'
    normalized = thousands ? intPart + fracPart : `${intPart}.${fracPart}`
  } else if (commas > 1 || dots > 1) {
    // Repeated separators can only be grouping.
    normalized = s.replace(/[.,]/g, '')
  } else {
    normalized = s
  }

  const n = Number(normalized)
  if (!Number.isFinite(n)) return null
  return negative ? -Math.abs(n) : n
}

export function parseInteger(
  value: string | number | null | undefined,
  separator: DecimalSeparator = 'auto'
): number | null {
  const n = parseNumber(value, separator)
  if (n == null) return null
  return Math.round(n)
}

export function parseYear(value: string | number | null | undefined): number | null {
  if (value == null) return null
  const s = String(value).trim()
  const m = s.match(/(?:^|\D)((?:19|20)\d{2})(?:\D|$)/)
  if (m) return Number(m[1])
  // Two-digit model years, "18" → 2018, "98" → 1998.
  if (/^\d{2}$/.test(s)) {
    const n = Number(s)
    return n <= (new Date().getFullYear() % 100) + 1 ? 2000 + n : 1900 + n
  }
  return null
}

// ── Dates ─────────────────────────────────────────────────────────────────────

export type DateFormat = 'auto' | 'DMY' | 'MDY' | 'YMD'

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  januar: 1,
  janvier: 1,
  enero: 1,
  ene: 1,
  gennaio: 1,
  gen: 1,
  sty: 1,
  styczen: 1,
  ocak: 1,
  oca: 1,
  sausis: 1,
  janeiro: 1,
  yanvar: 1,
  feb: 2,
  february: 2,
  februar: 2,
  fevrier: 2,
  fev: 2,
  febrero: 2,
  febbraio: 2,
  lut: 2,
  luty: 2,
  subat: 2,
  sub: 2,
  vasaris: 2,
  fevereiro: 2,
  fevral: 2,
  mar: 3,
  march: 3,
  marz: 3,
  maerz: 3,
  mars: 3,
  marzo: 3,
  marca: 3,
  marzec: 3,
  mart: 3,
  kovas: 3,
  marco: 3,
  apr: 4,
  april: 4,
  avril: 4,
  avr: 4,
  abril: 4,
  abr: 4,
  aprile: 4,
  kwi: 4,
  kwiecien: 4,
  nisan: 4,
  nis: 4,
  balandis: 4,
  aprel: 4,
  may: 5,
  mai: 5,
  mayo: 5,
  maggio: 5,
  mag: 5,
  maj: 5,
  mayis: 5,
  geguze: 5,
  maio: 5,
  jun: 6,
  june: 6,
  juni: 6,
  juin: 6,
  junio: 6,
  giugno: 6,
  giu: 6,
  cze: 6,
  czerwiec: 6,
  haziran: 6,
  haz: 6,
  birzelis: 6,
  junho: 6,
  iyun: 6,
  jul: 7,
  july: 7,
  juli: 7,
  juillet: 7,
  juil: 7,
  julio: 7,
  luglio: 7,
  lug: 7,
  lip: 7,
  lipiec: 7,
  temmuz: 7,
  tem: 7,
  liepa: 7,
  julho: 7,
  iyul: 7,
  aug: 8,
  august: 8,
  aout: 8,
  agosto: 8,
  ago: 8,
  sie: 8,
  sierpien: 8,
  agustos: 8,
  agu: 8,
  rugpjutis: 8,
  avgust: 8,
  sep: 9,
  sept: 9,
  september: 9,
  septembre: 9,
  septiembre: 9,
  settembre: 9,
  set: 9,
  wrz: 9,
  wrzesien: 9,
  eylul: 9,
  eyl: 9,
  rugsejis: 9,
  setembro: 9,
  sentyabr: 9,
  oct: 10,
  october: 10,
  oktober: 10,
  okt: 10,
  octobre: 10,
  octubre: 10,
  ottobre: 10,
  ott: 10,
  paz: 10,
  pazdziernik: 10,
  ekim: 10,
  eki: 10,
  spalis: 10,
  outubro: 10,
  out: 10,
  oktyabr: 10,
  nov: 11,
  november: 11,
  novembre: 11,
  noviembre: 11,
  lis: 11,
  listopad: 11,
  kasim: 11,
  kas: 11,
  lapkritis: 11,
  novembro: 11,
  noyabr: 11,
  dec: 12,
  december: 12,
  dezember: 12,
  dez: 12,
  decembre: 12,
  diciembre: 12,
  dic: 12,
  dicembre: 12,
  gru: 12,
  grudzien: 12,
  aralik: 12,
  ara: 12,
  gruodis: 12,
  dezembro: 12,
  dekabr: 12,
}

function utcDate(y: number, m: number, d: number): Date | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  if (y < 1900 || y > 2100) return null
  const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
  // Reject 31 February and friends, which Date would otherwise roll over.
  if (date.getUTCMonth() !== m - 1) return null
  return date
}

function fullYear(y: number, raw: string): number {
  if (raw.length === 4) return y
  return y <= (new Date().getFullYear() % 100) + 1 ? 2000 + y : 1900 + y
}

/** Excel stores dates as days since 1899-12-30. */
function fromExcelSerial(n: number): Date | null {
  if (n < 20000 || n > 80000) return null
  const ms = Math.round((n - 25569) * 86400 * 1000)
  const d = new Date(ms)
  return utcDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
}

/**
 * Split a date string into its three numeric parts and say which slot holds
 * the year, when that is unambiguous. Returns null for anything that is not
 * three parts.
 */
function numericParts(s: string): { a: number; b: number; c: number; raw: string[] } | null {
  const m = s.match(/^(\d{1,4})[./\-\s](\d{1,2})[./\-\s](\d{1,4})$/)
  if (!m) return null
  return { a: Number(m[1]), b: Number(m[2]), c: Number(m[3]), raw: [m[1], m[2], m[3]] }
}

/**
 * Parse one cell. `format` decides day-first versus month-first when both
 * readings are possible; `detectDateFormat` works that out from a whole
 * column so the caller rarely has to ask.
 */
export function parseDate(
  value: string | number | Date | null | undefined,
  format: DateFormat = 'auto'
): Date | null {
  if (value == null) return null
  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? null
      : utcDate(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate())
  }
  if (typeof value === 'number') return fromExcelSerial(value)

  let s = String(value).trim()
  if (!s) return null
  // Drop a time part: "2024-03-15 14:30", "15/03/2024 09:00:00", ISO "T".
  s = s.replace(/[T ]\d{1,2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/i, '').trim()

  if (/^\d{5}(\.\d+)?$/.test(s)) return fromExcelSerial(Number(s))

  // ISO and other year-first forms: 2024-03-15, 2024/3/5, 20240315.
  let m = s.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/)
  if (m) return utcDate(Number(m[1]), Number(m[2]), Number(m[3]))
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/)
  if (m) return utcDate(Number(m[1]), Number(m[2]), Number(m[3]))

  // Month names: "15 Mar 2024", "Mar 15, 2024", "15. März 2024", "March 2024" is not a day.
  const lower = s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  m = lower.match(/^(\d{1,2})\.?\s*([a-z]+)\.?,?\s*(\d{2,4})$/)
  if (m && MONTHS[m[2]]) return utcDate(fullYear(Number(m[3]), m[3]), MONTHS[m[2]], Number(m[1]))
  m = lower.match(/^([a-z]+)\.?\s*(\d{1,2}),?\s*(\d{2,4})$/)
  if (m && MONTHS[m[1]]) return utcDate(fullYear(Number(m[3]), m[3]), MONTHS[m[1]], Number(m[2]))

  const p = numericParts(s)
  if (!p) return null
  const { a, b, c, raw } = p

  if (raw[0].length === 4) return utcDate(a, b, c)
  if (raw[2].length !== 4 && raw[2].length !== 2) return null
  const year = fullYear(c, raw[2])

  const dayFirst = (): Date | null => utcDate(year, b, a)
  const monthFirst = (): Date | null => utcDate(year, a, b)

  if (format === 'DMY') return dayFirst()
  if (format === 'MDY') return monthFirst()
  if (format === 'YMD') return utcDate(year, b, a)
  // auto: whichever reading is possible; day-first when both are, since that
  // is the convention everywhere the app is used except one country, and the
  // column-level detector overrides this when the data says otherwise.
  if (a > 12 && b <= 12) return dayFirst()
  if (b > 12 && a <= 12) return monthFirst()
  return dayFirst() ?? monthFirst()
}

/**
 * Look at a whole column and say whether it is day-first or month-first.
 * "unknown" means every value was ambiguous (or empty); the caller then falls
 * back to the workshop's convention and lets the user override.
 */
export function detectDateFormat(values: readonly (string | null | undefined)[]): DateFormat {
  let dayFirst = 0
  let monthFirst = 0
  let yearFirst = 0
  for (const v of values) {
    if (!v) continue
    const s = String(v)
      .trim()
      .replace(/[T ]\d{1,2}:\d{2}.*$/, '')
    if (/^\d{4}[./-]\d{1,2}[./-]\d{1,2}$/.test(s)) {
      yearFirst++
      continue
    }
    const p = numericParts(s)
    if (!p || p.raw[0].length === 4) continue
    if (p.a > 12 && p.b <= 12) dayFirst++
    else if (p.b > 12 && p.a <= 12) monthFirst++
  }
  if (yearFirst && !dayFirst && !monthFirst) return 'YMD'
  if (dayFirst && !monthFirst) return 'DMY'
  if (monthFirst && !dayFirst) return 'MDY'
  if (dayFirst && monthFirst) return dayFirst >= monthFirst ? 'DMY' : 'MDY'
  return 'auto'
}

/**
 * Look at a column of amounts and say whether the comma is the decimal mark.
 * A value like "1.234,56" or "12,5" settles it; "1,234.56" or "12.5" settles
 * it the other way.
 */
export function detectDecimalSeparator(
  values: readonly (string | null | undefined)[]
): DecimalSeparator {
  let comma = 0
  let dot = 0
  for (const v of values) {
    if (!v) continue
    const s = String(v).replace(/[^\d.,]/g, '')
    const lastComma = s.lastIndexOf(',')
    const lastDot = s.lastIndexOf('.')
    if (lastComma < 0 && lastDot < 0) continue
    if (lastComma >= 0 && lastDot >= 0) {
      if (lastComma > lastDot) comma++
      else dot++
      continue
    }
    const mark = lastComma >= 0 ? ',' : '.'
    const frac = s.slice(s.lastIndexOf(mark) + 1)
    if (frac.length === 3 && (s.match(/[.,]/g) ?? []).length === 1) continue // grouping, says nothing
    if (mark === ',') comma++
    else dot++
  }
  if (comma && !dot) return ','
  if (dot && !comma) return '.'
  return 'auto'
}

// ── Vehicles ──────────────────────────────────────────────────────────────────

export function normalizeVin(value: string | null | undefined): {
  value: string | null
  valid: boolean
} {
  const cleaned = cleanText(value)?.toUpperCase().replace(/[\s-]/g, '') ?? null
  if (!cleaned) return { value: null, valid: true }
  // Modern VINs are 17 characters and never use I, O or Q. Older vehicles
  // have shorter chassis numbers, which are kept as typed with a warning.
  const valid = /^[A-HJ-NPR-Z0-9]{17}$/.test(cleaned)
  return { value: cleaned, valid }
}

/** Uppercase, single spaces. The plate is stored as people write it. */
export function normalizePlate(value: string | null | undefined): string | null {
  const cleaned = cleanText(value)
  return cleaned ? cleaned.toUpperCase() : null
}

/** "AB 12345", "AB-12345" and "ab12345" are the same plate. */
export function plateKey(value: string | null | undefined): string | null {
  if (!value) return null
  const key = value.toUpperCase().replace(/[^A-Z0-9]/g, '')
  return key.length >= 2 ? key : null
}

const FUEL_SYNONYMS: Record<string, string> = {
  gasoline: 'gasoline',
  gas: 'gasoline',
  petrol: 'gasoline',
  benzin: 'gasoline',
  bensin: 'gasoline',
  gasolina: 'gasoline',
  essence: 'gasoline',
  benzina: 'gasoline',
  benzyna: 'gasoline',
  benzine: 'gasoline',
  benzinas: 'gasoline',
  unleaded: 'gasoline',
  super: 'gasoline',
  e10: 'gasoline',
  e5: 'gasoline',
  '95': 'gasoline',
  '98': 'gasoline',
  pb: 'gasoline',
  diesel: 'diesel',
  gasoil: 'diesel',
  gasoleo: 'diesel',
  gazole: 'diesel',
  dyzelinas: 'diesel',
  dizel: 'diesel',
  on: 'diesel',
  d: 'diesel',
  tdi: 'diesel',
  hdi: 'diesel',
  electric: 'electric',
  ev: 'electric',
  bev: 'electric',
  elektro: 'electric',
  elektrisk: 'electric',
  el: 'electric',
  electrico: 'electric',
  electrique: 'electric',
  elettrico: 'electric',
  elektryczny: 'electric',
  elektrisch: 'electric',
  elektrikli: 'electric',
  elektra: 'electric',
  eletrico: 'electric',
  hybrid: 'hybrid',
  phev: 'hybrid',
  hev: 'hybrid',
  mhev: 'hybrid',
  hibrido: 'hybrid',
  hybride: 'hybrid',
  ibrido: 'hybrid',
  hybryda: 'hybrid',
  hibrit: 'hybrid',
  hibridas: 'hybrid',
  pluginhybrid: 'hybrid',
  ladbarhybrid: 'hybrid',
  twostroke: 'two-stroke',
  '2stroke': 'two-stroke',
  '2t': 'two-stroke',
  zweitakt: 'two-stroke',
  totakt: 'two-stroke',
  outboard: 'outboard',
  aussenborder: 'outboard',
  pahengsmotor: 'outboard',
  inboard: 'inboard',
  innenborder: 'inboard',
  innenbordsmotor: 'inboard',
  lpg: 'other',
  cng: 'other',
  gpl: 'other',
  autogas: 'other',
  hydrogen: 'other',
  other: 'other',
  annet: 'other',
  andere: 'other',
  otro: 'other',
  autre: 'other',
  altro: 'other',
  inny: 'other',
  anders: 'other',
  diger: 'other',
  kita: 'other',
}

export function mapFuelType(value: string | null | undefined): string | null {
  const cleaned = cleanText(value)
  if (!cleaned) return null
  const key = normalizeHeader(cleaned)
  if (FUEL_SYNONYMS[key]) return FUEL_SYNONYMS[key]
  // "Diesel (Euro 6)", "Bensin/hybrid": first recognisable word wins.
  for (const word of cleaned.split(/[\s/,()-]+/)) {
    const k = normalizeHeader(word)
    if (k && FUEL_SYNONYMS[k]) return FUEL_SYNONYMS[k]
  }
  return 'other'
}

const TRANSMISSION_SYNONYMS: Record<string, string> = {
  automatic: 'automatic',
  auto: 'automatic',
  at: 'automatic',
  automatik: 'automatic',
  automat: 'automatic',
  automatico: 'automatic',
  automatique: 'automatic',
  automatyczna: 'automatic',
  automaat: 'automatic',
  otomatik: 'automatic',
  automatine: 'automatic',
  avtomat: 'automatic',
  dsg: 'automatic',
  tiptronic: 'automatic',
  steptronic: 'automatic',
  dct: 'automatic',
  a: 'automatic',
  manual: 'manual',
  mt: 'manual',
  manuell: 'manual',
  schaltgetriebe: 'manual',
  schalter: 'manual',
  manuel: 'manual',
  manuale: 'manual',
  manualna: 'manual',
  handgeschakeld: 'manual',
  mekanik: 'manual',
  duz: 'manual',
  mechanine: 'manual',
  mekhanika: 'manual',
  stick: 'manual',
  m: 'manual',
  cvt: 'cvt',
  stufenlos: 'cvt',
  variomatic: 'cvt',
  multitronic: 'cvt',
  ecvt: 'cvt',
}

export function mapTransmission(value: string | null | undefined): string | null {
  const cleaned = cleanText(value)
  if (!cleaned) return null
  const key = normalizeHeader(cleaned)
  if (TRANSMISSION_SYNONYMS[key]) return TRANSMISSION_SYNONYMS[key]
  for (const word of cleaned.split(/[\s/,()-]+/)) {
    const k = normalizeHeader(word)
    if (k && TRANSMISSION_SYNONYMS[k]) return TRANSMISSION_SYNONYMS[k]
  }
  return null
}

/**
 * "2018 Toyota Corolla", "Toyota Corolla 2018", "Toyota Corolla (2018)" and
 * "Toyota Corolla" (no year) come apart into their pieces. The make is the
 * first word; multi-word makes that matter ("Alfa Romeo", "Land Rover",
 * "Mercedes Benz") are listed so their model is not eaten.
 */
const TWO_WORD_MAKES = [
  'alfa romeo',
  'aston martin',
  'land rover',
  'range rover',
  'mercedes benz',
  'rolls royce',
  'great wall',
  'mg motor',
  'lynk co',
]

export function splitVehicleDescription(value: string | null | undefined): {
  year: number | null
  make: string | null
  model: string | null
} {
  let s = cleanText(value)
  if (!s) return { year: null, make: null, model: null }

  let year: number | null = null
  let m = s.match(/^((?:19|20)\d{2})\s+(.+)$/)
  if (m) {
    year = Number(m[1])
    s = m[2]
  } else {
    m = s.match(/^(.+?)[\s,(]+((?:19|20)\d{2})\)?$/)
    if (m) {
      year = Number(m[2])
      s = m[1].trim()
    }
  }

  const lower = s.toLowerCase().replace(/-/g, ' ')
  for (const make of TWO_WORD_MAKES) {
    if (lower.startsWith(make)) {
      const rest = s.slice(make.length).replace(/^[\s-]+/, '')
      return { year, make: s.slice(0, make.length), model: cleanText(rest) }
    }
  }
  const [make, ...rest] = s.split(/\s+/)
  return { year, make: make || null, model: rest.length ? rest.join(' ') : null }
}

/** "Anna" + "Berg" → "Anna Berg"; either half may be missing. */
export function joinName(first: string | null, last: string | null): string | null {
  return cleanText([first, last].filter(Boolean).join(' '))
}

/** Street, postal code, city, state and country become one address line. */
export function joinAddress(parts: {
  street?: string | null
  postalCode?: string | null
  city?: string | null
  state?: string | null
  country?: string | null
}): string | null {
  const locality = cleanText([parts.postalCode, parts.city].filter(Boolean).join(' '))
  return cleanText([parts.street, locality, parts.state, parts.country].filter(Boolean).join(', '))
}
