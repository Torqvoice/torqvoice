import { type Locale, defaultLocale, locales } from '@/i18n/config'
import type { db, TxClient } from '@/lib/db'
import { SETTING_KEYS } from '../Schema/settingsSchema'

/**
 * Gives a new workshop its language: the one its creator is using when they
 * set it up. Invoices, quotes and mails are printed in the workshop's
 * language, so without one saved they had nothing to follow and came out in
 * English.
 */
export async function saveInitialWorkshopLocale(
  client: typeof db | TxClient,
  organizationId: string,
  userId: string,
  locale: string
) {
  const value: Locale = locales.includes(locale as Locale) ? (locale as Locale) : defaultLocale
  await client.appSetting.upsert({
    where: { organizationId_key: { organizationId, key: SETTING_KEYS.WORKSHOP_LOCALE } },
    create: { organizationId, key: SETTING_KEYS.WORKSHOP_LOCALE, value, userId },
    update: {},
  })
}
