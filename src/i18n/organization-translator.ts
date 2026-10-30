import { createTranslator } from 'next-intl'
import type { Locale } from './config'
import { resolveDocumentLocale } from './locale-from-request'

/**
 * A translator in the workshop's own language, for text made where there
 * is no request to read a language from: a backup alert the scheduler
 * sends at night, an email to the owners. The request's translator, where
 * there is one, speaks the language of whoever is looking, which is not
 * who these are for.
 */
export interface OrganizationTranslator {
  (key: string, values?: Record<string, string | number | Date>): string
  has(key: string): boolean
  locale: Locale
}

export async function organizationTranslator(
  organizationId: string,
  namespace: string
): Promise<OrganizationTranslator> {
  const locale = await resolveDocumentLocale(organizationId)
  const messages = (await import(`../../messages/${locale}/${namespace}.json`)).default
  const t = createTranslator({
    locale,
    messages: { [namespace]: messages },
    namespace,
  } as Parameters<typeof createTranslator>[0]) as unknown as {
    (key: string, values?: Record<string, string | number | Date>): string
    has(key: string): boolean
  }
  return Object.assign(
    (key: string, values?: Record<string, string | number | Date>) => t(key, values),
    { has: (key: string) => t.has(key), locale }
  )
}
