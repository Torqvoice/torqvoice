import { defaultLocale, type Locale, locales } from '@/i18n/config'
import { countryDefaults, detectCountry, timeZoneFor } from '@/lib/country-defaults'
import { DEFAULT_CURRENCY_CODE } from '@/lib/currencies'
import type { EngineSizeUnit } from '@/lib/engine-size'

/**
 * The workshop as onboarding builds it, step by step, before anything is
 * saved. Every regional value starts from the country and stays editable.
 */

export type WorkKind = 'cars' | 'motorcycles' | 'marine'
export type TaxChoice = 'yes' | 'no' | 'skipped'

/**
 * Where the language came from. Only one the owner picked themselves is kept
 * when the country changes; a suggestion moves with the country.
 */
export type LanguageSource = 'browser' | 'country' | 'chosen'

/** The language for a country whose own the app does not ship yet. */
export const FALLBACK_LOCALE: Locale = 'en'

export const SETUP_DATE_FORMATS = [
  'dd/MM/yyyy',
  'dd.MM.yyyy',
  'MM/dd/yyyy',
  'yyyy-MM-dd',
  'MMM d, yyyy',
  'd. MMM yyyy',
  'd MMMM yyyy',
] as const

export interface SetupDraft {
  workshopName: string
  kind: WorkKind
  country: string | null
  /** The language customers get: the owner's own, unless they asked for another. */
  locale: Locale
  languageSource: LanguageSource
  /** True when customers get a language of their own, picked under the owner's. */
  customerLanguageSeparate: boolean
  forceCustomerLocale: boolean
  currencyCode: string
  dateFormat: string
  timeFormat: '12h' | '24h'
  timezone: string
  distance: 'metric' | 'imperial'
  measure: 'metric' | 'imperial'
  engineSizeUnit: EngineSizeUnit
  dialCode: string
  taxChoice: TaxChoice
  /** As typed, so "20" and "5,5" both survive until saved. */
  taxRate: string
  taxLabel: string
  /** True once the owner typed a tax name, so a later country change keeps it. */
  taxLabelEdited: boolean
  taxInclusive: boolean
  address: string
  loadSampleData: boolean
}

function asLocale(value: string | undefined): Locale | undefined {
  return value && (locales as readonly string[]).includes(value) ? (value as Locale) : undefined
}

/**
 * Fill the regional choices from a country. The workshop's name, its kind,
 * address and tax answer are the owner's own and are kept; a tax name they
 * typed is kept too, and so is a language they picked. Otherwise the language
 * follows the country, or English where the app does not ship the country's.
 */
export function withCountry(
  draft: SetupDraft,
  country: string,
  browserLanguage: string | undefined
): SetupDraft {
  const chosen = draft.languageSource === 'chosen'
  const d = countryDefaults(country, chosen ? draft.locale : browserLanguage)
  return {
    ...draft,
    country: d.country,
    locale: chosen ? draft.locale : (d.locale ?? FALLBACK_LOCALE),
    languageSource: chosen ? 'chosen' : 'country',
    // A suggestion is one language for everything; the screens follow it.
    customerLanguageSeparate: chosen ? draft.customerLanguageSeparate : false,
    currencyCode: d.currency ?? draft.currencyCode,
    dateFormat: d.dateFormat,
    timeFormat: d.timeFormat,
    distance: d.distance,
    measure: d.measure,
    // The workshop's clock is where the workshop is, not where the browser is.
    timezone: timeZoneFor(d.country, draft.timezone) ?? draft.timezone,
    dialCode: d.dialCode,
    taxLabel: draft.taxLabelEdited ? draft.taxLabel : (d.taxLabel ?? ''),
  }
}

/**
 * The owner's own language, picked: their screens, the workshop and its
 * customers get it, unless customers were given another one.
 */
export function withLanguage(draft: SetupDraft, locale: Locale): SetupDraft {
  return {
    ...draft,
    locale: draft.customerLanguageSeparate ? draft.locale : locale,
    languageSource: 'chosen',
  }
}

/** A language for customers alone, picked under the owner's. */
export function withCustomerLanguage(draft: SetupDraft, locale: Locale): SetupDraft {
  return { ...draft, locale, customerLanguageSeparate: true, languageSource: 'chosen' }
}

/** Customers back on the owner's language. */
export function withSameLanguage(draft: SetupDraft, ownLocale: Locale): SetupDraft {
  return { ...draft, locale: ownLocale, customerLanguageSeparate: false }
}

/** What the kind of work decides: the marine fields, and how engines are written. */
export function withKind(draft: SetupDraft, kind: WorkKind): SetupDraft {
  return { ...draft, kind, engineSizeUnit: kind === 'motorcycles' ? 'cc' : 'litres' }
}

/** The first draft, from what the browser tells us about where it is. */
export function initialDraft(args: {
  timeZone: string
  languages: readonly string[]
  uiLocale: string
}): SetupDraft {
  const base: SetupDraft = {
    workshopName: '',
    kind: 'cars',
    country: null,
    locale: asLocale(args.uiLocale) ?? defaultLocale,
    languageSource: 'browser',
    customerLanguageSeparate: false,
    forceCustomerLocale: false,
    currencyCode: DEFAULT_CURRENCY_CODE,
    dateFormat: 'dd/MM/yyyy',
    timeFormat: '24h',
    timezone: args.timeZone || 'UTC',
    distance: 'metric',
    measure: 'metric',
    engineSizeUnit: 'litres',
    dialCode: '',
    taxChoice: 'yes',
    taxRate: '',
    taxLabel: '',
    taxLabelEdited: false,
    taxInclusive: false,
    address: '',
    loadSampleData: true,
  }
  const country = detectCountry(args.timeZone, args.languages)
  if (!country) return base
  // A detected country does not turn the screens; where its language is not
  // the browser's, customers get it on their own, shown under the owner's.
  const detected = withCountry(base, country, args.languages[0])
  return { ...detected, customerLanguageSeparate: detected.locale !== base.locale }
}

/** The rate as a number, or null while what is typed is not one. */
export function parseTaxRate(value: string): number | null {
  const n = Number(value.trim().replace(',', '.'))
  return value.trim() !== '' && Number.isFinite(n) && n >= 0 && n <= 100 ? n : null
}

/** Whether the tax step can be left as it stands. */
export function taxStepComplete(draft: SetupDraft): boolean {
  return draft.taxChoice !== 'yes' || parseTaxRate(draft.taxRate) !== null
}

/** A phone prefix the server accepts: empty, or + and up to four digits. */
export function dialCodeValid(dialCode: string): boolean {
  return dialCode === '' || /^\+\d{1,4}$/.test(dialCode)
}

/**
 * The first step still missing something, or null when the workshop can be
 * created. Ready can be reached from the step bar after a step was emptied
 * again, so creating checks every step, not only the one on screen.
 */
export function firstIncompleteStep(draft: SetupDraft): 'workshop' | 'region' | 'tax' | null {
  if (draft.workshopName.trim().length < 2) return 'workshop'
  if (!dialCodeValid(draft.dialCode)) return 'region'
  if (!taxStepComplete(draft)) return 'tax'
  return null
}

/** What the server is sent: the draft, settled into saved values. */
export function setupPayload(draft: SetupDraft) {
  const charges = draft.taxChoice === 'yes'
  return {
    workshopName: draft.workshopName.trim(),
    loadSampleData: draft.loadSampleData,
    timeZone: draft.timezone,
    setup: {
      country: draft.country ?? undefined,
      serviceType: draft.kind === 'marine' ? ('marine' as const) : ('automotive' as const),
      engineSizeUnit: draft.engineSizeUnit,
      locale: draft.locale,
      forceCustomerLocale: draft.forceCustomerLocale,
      currencyCode: draft.currencyCode,
      dateFormat: draft.dateFormat,
      timeFormat: draft.timeFormat,
      unitSystem: draft.distance,
      measureSystem: draft.measure,
      dialCode: draft.dialCode,
      tax: {
        enabled: charges,
        rate: charges ? (parseTaxRate(draft.taxRate) ?? 0) : 0,
        label: charges ? draft.taxLabel.trim() : '',
        inclusive: charges && draft.taxInclusive,
      },
      address: draft.address.trim(),
    },
  }
}

export type SetupPayload = ReturnType<typeof setupPayload>
