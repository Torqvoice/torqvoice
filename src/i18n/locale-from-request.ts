import { cookies, headers } from 'next/headers'
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
  const shareMatch = pathname.match(
    /^\/share\/(?:invoice|quote|inspection|status-report|terms)\/([^/]+)/
  )
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

function isLocale(value: string | null | undefined): value is Locale {
  return !!value && locales.includes(value as Locale)
}

/** The workshop's saved language, and whether customer pages must use it. */
async function workshopLocaleSettings(
  organizationId: string
): Promise<{ forced: boolean; saved: Locale | undefined }> {
  const settings = await db.appSetting.findMany({
    where: {
      organizationId,
      key: { in: [SETTING_KEYS.FORCE_CUSTOMER_LOCALE, SETTING_KEYS.WORKSHOP_LOCALE] },
    },
    select: { key: true, value: true },
  })
  const saved = settings.find((s) => s.key === SETTING_KEYS.WORKSHOP_LOCALE)?.value
  return {
    forced: settings.find((s) => s.key === SETTING_KEYS.FORCE_CUSTOMER_LOCALE)?.value === 'true',
    saved: isLocale(saved) ? saved : undefined,
  }
}

/**
 * The language the person making this request reads the app in: their own
 * choice from the user menu, else their browser's. The same order the app's
 * screens use. Undefined outside a request, such as in a scheduled job.
 */
async function requesterLocale(): Promise<Locale | undefined> {
  try {
    const [cookieStore, headerStore] = await Promise.all([cookies(), headers()])
    const chosen = cookieStore.get('locale')?.value
    if (isLocale(chosen)) return chosen
    return getBestLocaleFromHeader(headerStore.get('accept-language'))
  } catch {
    return undefined
  }
}

/**
 * Resolves the locale to use for customer-facing pages and the PDFs on them.
 *
 * Order:
 *   1. If the workshop has `workshop.forceCustomerLocale = true`, use `workshop.locale`.
 *   2. Otherwise, the customer's browser `Accept-Language` header.
 *   3. Otherwise, the workshop's language, then the default locale.
 *
 * No cookie is read — these routes are downloaded by customers who won't have
 * a workshop-scoped `locale` cookie.
 */
export async function resolveCustomerLocale(
  organizationId: string,
  acceptLanguageHeader: string | null
): Promise<Locale> {
  const { forced, saved } = await workshopLocaleSettings(organizationId)
  if (forced && saved) return saved
  return getBestLocaleFromHeader(acceptLanguageHeader) ?? saved ?? defaultLocale
}

/**
 * The language of a document the workshop makes for a customer: an invoice,
 * quote, work order or inspection downloaded in the app or sent by mail.
 *
 * Always the workshop's language, whatever language the person making it
 * reads the app in, so the user menu's language picker changes screens and
 * never what a customer receives. A workshop with no saved language (it was
 * only written from Settings → Localization before workshops got one at
 * creation) gets the language of whoever makes the document, then English.
 */
export async function resolveDocumentLocale(organizationId: string): Promise<Locale> {
  const { saved } = await workshopLocaleSettings(organizationId)
  return saved ?? (await requesterLocale()) ?? defaultLocale
}
