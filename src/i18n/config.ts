export const locales = [
  'en',
  'bg',
  'de',
  'es',
  'fr',
  'nb',
  'pt-BR',
  'pt-PT',
  'pl',
  'nl',
  'it',
  'tr',
  'ru',
  'lt',
] as const

export type Locale = (typeof locales)[number]

export const defaultLocale: Locale = 'en'

export const localeNames: Record<Locale, string> = {
  en: 'English',
  bg: 'Български',
  de: 'Deutsch',
  es: 'Español',
  fr: 'Français',
  nb: 'Norsk Bokmål',
  'pt-BR': 'Português (Brasil)',
  'pt-PT': 'Português (Portugal)',
  pl: 'Polski',
  nl: 'Nederlands',
  it: 'Italiano',
  tr: 'Türkçe',
  ru: 'Русский',
  lt: 'Lietuvių',
}
