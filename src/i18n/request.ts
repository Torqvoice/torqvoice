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
    },
  }
})
