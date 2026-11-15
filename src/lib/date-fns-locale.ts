import {
  de,
  enUS,
  es,
  fr,
  it,
  lt,
  nb,
  nl,
  pl,
  pt,
  ptBR,
  ru,
  tr,
  type Locale,
} from 'date-fns/locale'

/**
 * The date-fns locale for each language the app ships, for widgets that take
 * one (the day picker's month and weekday names, its button labels). Keyed by
 * the folder names under messages/.
 */
const LOCALES: Record<string, Locale> = {
  de,
  en: enUS,
  es,
  fr,
  it,
  lt,
  nb,
  nl,
  pl,
  'pt-BR': ptBR,
  'pt-PT': pt,
  ru,
  tr,
}

/** Falls back to English for a language date-fns has no locale wired for here. */
export function dateFnsLocale(locale: string): Locale {
  return LOCALES[locale] ?? LOCALES[locale.split('-')[0]] ?? enUS
}
