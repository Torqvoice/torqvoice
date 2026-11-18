import type { DayPickerProps } from 'react-day-picker'
import { de, enUS, es, fr, it, lt, nb, nl, pl, pt, ptBR, ru, tr } from 'react-day-picker/locale'

/**
 * The day picker's own locale for each language the app ships. These carry
 * the month and weekday names and also the words a screen reader hears:
 * "today", "selected", "choose the month", the arrows. A plain date-fns
 * locale has the names only, which left those words in English. Keyed by the
 * folder names under messages/.
 */
type DayPickerLocale = NonNullable<DayPickerProps['locale']>

const LOCALES: Record<string, DayPickerLocale> = {
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

/** Falls back to English for a language with no locale wired here. */
export function dayPickerLocale(locale: string): DayPickerLocale {
  return LOCALES[locale] ?? LOCALES[locale.split('-')[0]] ?? enUS
}
