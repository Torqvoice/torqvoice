import 'server-only'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import type { SettingsPageKey } from '@/features/settings/Lib/settingsPages'
import { getCachedMembership, getCachedSession } from '@/lib/cached-session'
import { db } from '@/lib/db'

/**
 * The tab title of a page, so every page says what it is (WCAG 2.4.2) instead
 * of the root default. The root layout's template appends the app name, and
 * the portal's layout appends the workshop's, so a page names only itself.
 *
 * The words are the ones the page header already uses: a breadcrumb key from
 * `navigation.breadcrumbs`, a settings page's menu title, or, for a screen with
 * no crumb (public pages, the portal), its own heading in the namespace that
 * owns it. The request locale is already the right one everywhere: the signed
 * in person's language in the app, the workshop's or the customer's on share
 * and portal pages (src/i18n/request.ts).
 */

/** Crumbs a marine workshop words differently, as the page header does. */
const MARINE_CRUMBS: Record<string, string> = {
  vehicles: 'vessels',
  allVehicles: 'allVessels',
  vehicleDetails: 'vesselDetails',
}

/**
 * Whether the signed-in workshop services boats. Session and membership are
 * the request-cached reads the layout makes anyway, so this adds one indexed
 * setting lookup, and only on the pages whose crumb has a marine form. A title
 * is never worth a broken page: anything that fails reads as automotive.
 */
async function isMarineWorkshop(): Promise<boolean> {
  try {
    const session = await getCachedSession()
    if (!session?.user?.id) return false
    const membership = await getCachedMembership(session.user.id)
    if (!membership) return false
    const row = await db.appSetting.findUnique({
      where: {
        organizationId_key: {
          organizationId: membership.organizationId,
          key: SETTING_KEYS.SERVICE_TYPE,
        },
      },
      select: { value: true },
    })
    return row?.value === 'marine'
  } catch {
    return false
  }
}

/** A title from any message: `titleFrom('portal.quotes', 'title')`. */
export async function titleFrom(
  namespace: string,
  key: string,
  values?: Record<string, string | number>
): Promise<Metadata> {
  const t = await getTranslations(namespace)
  return { title: t(key, values) }
}

/** A signed-in page, named by its `navigation.breadcrumbs` key. */
export async function pageTitle(key: string): Promise<Metadata> {
  const crumb = MARINE_CRUMBS[key] && (await isMarineWorkshop()) ? MARINE_CRUMBS[key] : key
  return titleFrom('navigation.breadcrumbs', crumb)
}

/** A settings page, named as the settings menu names it. */
export async function settingsPageTitle(key: SettingsPageKey | (string & {})): Promise<Metadata> {
  return titleFrom('settings', `nav.items.${key}.title`)
}
