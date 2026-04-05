import { db } from '@/lib/db'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { type Locale, defaultLocale, locales } from './config'

/**
 * Extracts the org URL param (slug or UUID) from a customer-facing pathname.
 * Returns null if the path is not a customer-facing route.
 */
export function extractCustomerOrgParam(pathname: string | null | undefined): string | null {
  if (!pathname) return null

  // /portal/[orgId]/...
  const portalMatch = pathname.match(/^\/portal\/([^/]+)/)
  if (portalMatch) return portalMatch[1]

  // /share/{invoice,quote,inspection,status-report,terms}/[orgId]/...
  const shareMatch = pathname.match(/^\/share\/(?:invoice|quote|inspection|status-report|terms)\/([^/]+)/)
  if (shareMatch) return shareMatch[1]

  return null
}

export function getBestLocaleFromHeader(acceptLanguage: string | null): Locale | undefined {
  if (!acceptLanguage) return undefined

  const entries = acceptLanguage
    .split(',')
    .map((part) => {
      const [lang, q] = part.trim().split(';q=')
      return { lang: lang.trim(), q: q ? parseFloat(q) : 1 }
    })
    .sort((a, b) => b.q - a.q)

  for (const { lang } of entries) {
    // Exact match (e.g. "pt-BR")
    if (locales.includes(lang as Locale)) return lang as Locale

    // Prefix match: "de-AT" → "de"
    const prefix = lang.split('-')[0]
    if (locales.includes(prefix as Locale)) return prefix as Locale

    // Reverse prefix: "pt" → "pt-BR"
    const match = locales.find((l) => l.startsWith(prefix + '-'))
    if (match) return match
  }

  return undefined
}

/**
 * Resolves the locale to use for customer-facing share PDFs.
 *
 * Order:
 *   1. If the workshop has `workshop.forceCustomerLocale = true`, use `workshop.locale`.
 *   2. Otherwise, the customer's browser `Accept-Language` header.
 *   3. Otherwise, the default locale.
 *
 * No cookie is read — these routes are downloaded by customers who won't have
 * a workshop-scoped `locale` cookie.
 */
export async function resolveCustomerLocale(
  organizationId: string,
  acceptLanguageHeader: string | null,
): Promise<Locale> {
  const settings = await db.appSetting.findMany({
    where: {
      organizationId,
      key: { in: [SETTING_KEYS.FORCE_CUSTOMER_LOCALE, SETTING_KEYS.WORKSHOP_LOCALE] },
    },
    select: { key: true, value: true },
  })

  const forced = settings.find((s) => s.key === SETTING_KEYS.FORCE_CUSTOMER_LOCALE)?.value === 'true'
  if (forced) {
    const workshopLocale = settings.find((s) => s.key === SETTING_KEYS.WORKSHOP_LOCALE)?.value
    if (workshopLocale && locales.includes(workshopLocale as Locale)) {
      return workshopLocale as Locale
    }
  }

  return getBestLocaleFromHeader(acceptLanguageHeader) ?? defaultLocale
}
