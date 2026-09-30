import { type Locale, locales } from '@/i18n/config'
import en from '../../../../messages/en/inspectionLibrary.json'

/**
 * The text of the built-in checklists and the defect catalogue, one file per
 * locale in `messages/<locale>/inspectionLibrary.json`.
 *
 * Kept out of the next-intl request messages on purpose: it is several hundred
 * strings that only the template library and the grading row need, so it is
 * loaded on demand instead of riding along with every page.
 */
export type InspectionLibrary = typeof en

export const EN_LIBRARY: InspectionLibrary = en

const isLocale = (value: string | null | undefined): value is Locale =>
  !!value && (locales as readonly string[]).includes(value)

export async function loadInspectionLibrary(
  locale: string | null | undefined
): Promise<InspectionLibrary> {
  if (!isLocale(locale) || locale === 'en') return EN_LIBRARY
  try {
    return (await import(`../../../../messages/${locale}/inspectionLibrary.json`)).default
  } catch {
    return EN_LIBRARY
  }
}

/** Every locale's library, for recognising built-in text whatever language it was installed in. */
export async function loadAllInspectionLibraries(): Promise<InspectionLibrary[]> {
  return Promise.all(locales.map((locale) => loadInspectionLibrary(locale)))
}

/** Looks a key up in one of the library's tables, falling back to English. */
export function libraryText(
  lib: InspectionLibrary,
  table: 'sections' | 'checks' | 'descriptions' | 'choices' | 'defects',
  key: string
): string {
  const own = (lib[table] as Record<string, string>)[key]
  if (own) return own
  return (EN_LIBRARY[table] as Record<string, string>)[key] ?? key
}
