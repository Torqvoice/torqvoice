import { getRequestConfig } from 'next-intl/server'
import { cookies, headers } from 'next/headers'
import { type Locale, defaultLocale, locales } from './config'
import { extractCustomerOrgParam, getBestLocaleFromHeader, resolveCustomerLocale } from './locale-from-request'
import { resolvePortalOrg } from '@/lib/portal-slug'

export default getRequestConfig(async () => {
  const headerStore = await headers()
  const acceptLanguage = headerStore.get('accept-language')
  const pathname = headerStore.get('x-pathname')

  let locale: Locale

  // Customer-facing routes (share/* and portal/*) apply the workshop's
  // forced locale when enabled, otherwise fall back to the customer's
  // Accept-Language — never the viewer's cookie (which may belong to
  // a team member testing the page).
  const customerOrgParam = extractCustomerOrgParam(pathname)
  if (customerOrgParam) {
    const org = await resolvePortalOrg(customerOrgParam)
    const orgId = org?.id ?? customerOrgParam
    locale = await resolveCustomerLocale(orgId, acceptLanguage)
  } else {
    const cookieStore = await cookies()
    const cookieLocale = cookieStore.get('locale')?.value
    if (locales.includes(cookieLocale as Locale)) {
      locale = cookieLocale as Locale
    } else {
      locale = getBestLocaleFromHeader(acceptLanguage) ?? defaultLocale
    }
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
  const billing = (await import(`../../messages/${locale}/billing.json`)).default
  const reminders = (await import(`../../messages/${locale}/reminders.json`)).default
  const audit = (await import(`../../messages/${locale}/audit.json`)).default
  const aiChat = (await import(`../../messages/${locale}/aiChat.json`)).default
  const laborPresets = (await import(`../../messages/${locale}/laborPresets.json`)).default
  const telegram = (await import(`../../messages/${locale}/telegram.json`)).default
  const telegramMessages = (await import(`../../messages/${locale}/telegramMessages.json`)).default
  const statusReport = (await import(`../../messages/${locale}/statusReport.json`)).default

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
      billing,
      reminders,
      audit,
      aiChat,
      laborPresets,
      telegram,
      telegramMessages,
      statusReport,
    },
  }
})
