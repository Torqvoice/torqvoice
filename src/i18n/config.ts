export const locales = ['en', 'de', 'es', 'fr', 'nb', 'pt-BR', 'pl', 'nl', 'it', 'tr'] as const

export type Locale = (typeof locales)[number]

export const defaultLocale: Locale = 'en'

export const localeNames: Record<Locale, string> = {
  en: 'English',
  de: 'Deutsch',
  es: 'Español',
  fr: 'Français',
  nb: 'Norsk Bokmål',
  'pt-BR': 'Português (Brasil)',
  pl: 'Polski',
  nl: 'Nederlands',
  it: 'Italiano',
  tr: 'Türkçe',
}
