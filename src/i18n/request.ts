import { getRequestConfig } from 'next-intl/server'
import { cookies } from 'next/headers'
import { type Locale, defaultLocale, locales } from './config'

export default getRequestConfig(async () => {
  const cookieStore = await cookies()
  const cookieLocale = cookieStore.get('locale')?.value
  const locale: Locale = locales.includes(cookieLocale as Locale)
    ? (cookieLocale as Locale)
    : defaultLocale

  const common = (await import(`../../messages/${locale}/common.json`)).default
  const auth = (await import(`../../messages/${locale}/auth.json`)).default
  const dashboard = (await import(`../../messages/${locale}/dashboard.json`)).default
  const navigation = (await import(`../../messages/${locale}/navigation.json`)).default
  const customers = (await import(`../../messages/${locale}/customers.json`)).default

  return {
    locale,
    messages: {
      common,
      auth,
      dashboard,
      navigation,
      customers,
    },
  }
})
