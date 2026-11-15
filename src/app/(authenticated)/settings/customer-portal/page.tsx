import { redirect } from 'next/navigation'
import { CustomerPortalSettings } from '@/features/portal/Components/CustomerPortalSettings'
import { normalizeAccent, resolvePortalTheme } from '@/features/portal/Lib/theme'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { isTireHotelEnabled } from '@/features/tire-hotel/Lib/tireHotelSettings'
import { getAppBaseUrl } from '@/lib/app-url'
import { db } from '@/lib/db'
import { getFeatures, isCloudMode } from '@/lib/features'
import { getLayoutData } from '@/lib/get-layout-data'
import { FeatureLocked } from '../feature-locked-message'

export default async function CustomerPortalSettingsPage() {
  const data = await getLayoutData()

  if (data.status === 'unauthenticated') redirect('/auth/sign-in')
  if (data.status === 'no-organization') redirect('/onboarding')

  const features = await getFeatures(data.organizationId)

  const locked = !features.customerPortal

  const [settings, org, tireHotel] = await Promise.all([
    db.appSetting.findMany({
      where: {
        organizationId: data.organizationId,
        key: {
          in: [
            SETTING_KEYS.PORTAL_ENABLED,
            SETTING_KEYS.PORTAL_DESCRIPTION,
            SETTING_KEYS.PORTAL_HOURS,
            SETTING_KEYS.PORTAL_THEME,
            SETTING_KEYS.PORTAL_ACCENT,
            SETTING_KEYS.PORTAL_COVER,
            SETTING_KEYS.PORTAL_MESSAGES,
            SETTING_KEYS.PORTAL_SHOW_TIRES,
            SETTING_KEYS.OPENING_HOURS,
          ],
        },
      },
      select: { key: true, value: true },
    }),
    db.organization.findUnique({
      where: { id: data.organizationId },
      select: { portalSlug: true },
    }),
    isTireHotelEnabled(data.organizationId).catch(() => false),
  ])

  const value = (key: string) => settings.find((s) => s.key === key)?.value ?? ''

  // The portal reads its hours from the workshop calendar. Hours typed on the
  // old version of this page still show on the sign-in page for a workshop
  // that never set its calendar (features/portal/Lib/openingHours.server.ts),
  // so the page says so instead of hiding a text nobody can find.
  const typedHours = value(SETTING_KEYS.PORTAL_HOURS).trim()
  const calendarHoursSet = value(SETTING_KEYS.OPENING_HOURS).trim() !== ''

  const content = (
    <CustomerPortalSettings
      orgId={data.organizationId}
      appUrl={getAppBaseUrl()}
      tireHotel={tireHotel}
      typedHours={typedHours && !calendarHoursSet ? typedHours : null}
      initial={{
        enabled: value(SETTING_KEYS.PORTAL_ENABLED) === 'true',
        slug: org?.portalSlug ?? '',
        description: value(SETTING_KEYS.PORTAL_DESCRIPTION),
        // Daylight for a workshop that never chose.
        theme: resolvePortalTheme(value(SETTING_KEYS.PORTAL_THEME)),
        accent: normalizeAccent(value(SETTING_KEYS.PORTAL_ACCENT)) ?? '',
        cover: value(SETTING_KEYS.PORTAL_COVER).trim(),
        messages: value(SETTING_KEYS.PORTAL_MESSAGES) !== 'false',
        showTires: value(SETTING_KEYS.PORTAL_SHOW_TIRES) !== 'false',
      }}
    />
  )

  return locked ? (
    <FeatureLocked
      feature="Customer Portal"
      description="Give your customers a self-service portal to view invoices, quotes, inspections, and request service."
      isCloud={isCloudMode()}
    >
      {content}
    </FeatureLocked>
  ) : (
    content
  )
}
