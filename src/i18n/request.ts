import { getRequestConfig } from 'next-intl/server'
import { cookies, headers } from 'next/headers'
import { type Locale, defaultLocale, locales } from './config'

function getBestLocaleFromHeader(acceptLanguage: string | null): Locale | undefined {
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

export default getRequestConfig(async () => {
  const cookieStore = await cookies()
  const cookieLocale = cookieStore.get('locale')?.value

  let locale: Locale
  if (locales.includes(cookieLocale as Locale)) {
    locale = cookieLocale as Locale
  } else {
    const headerStore = await headers()
    const acceptLanguage = headerStore.get('accept-language')
    locale = getBestLocaleFromHeader(acceptLanguage) ?? defaultLocale
  }

  const common = (await import(`../../messages/${locale}/common.json`)).default
  const auth = (await import(`../../messages/${locale}/auth.json`)).default
  const dashboard = (await import(`../../messages/${locale}/dashboard.json`)).default
  const navigation = (await import(`../../messages/${locale}/navigation.json`)).default
  const customers = (await import(`../../messages/${locale}/customers.json`)).default
  const messages = (await import(`../../messages/${locale}/messages.json`)).default
  const vehicles = (await import(`../../messages/${locale}/vehicles.json`)).default
  const workOrders = (await import(`../../messages/${locale}/workOrders.json`)).default
  const workBoard = (await import(`../../messages/${locale}/workBoard.json`)).default
  const service = (await import(`../../messages/${locale}/service.json`)).default
  const share = (await import(`../../messages/${locale}/share.json`)).default
  const pdf = (await import(`../../messages/${locale}/pdf.json`)).default
  const portal = (await import(`../../messages/${locale}/portal.json`)).default
  const calendar = (await import(`../../messages/${locale}/calendar.json`)).default
  const inventory = (await import(`../../messages/${locale}/inventory.json`)).default
  const reports = (await import(`../../messages/${locale}/reports.json`)).default
  const settings = (await import(`../../messages/${locale}/settings.json`)).default
  const admin = (await import(`../../messages/${locale}/admin.json`)).default
  const notifications = (await import(`../../messages/${locale}/notifications.json`)).default
  const quotes = (await import(`../../messages/${locale}/quotes.json`)).default

  return {
    locale,
    messages: {
      common,
      auth,
      dashboard,
      navigation,
      customers,
      messages,
      vehicles,
      workOrders,
      workBoard,
      service,
      share,
      pdf,
      portal,
      calendar,
      inventory,
      reports,
      settings,
      admin,
      notifications,
      quotes,
    },
  }
})
