import { getLayoutData } from '@/lib/get-layout-data'
import { getFeatures, isCloudMode } from '@/lib/features'
import { FeatureLockedMessage } from '../feature-locked-message'
import { CustomerPortalSettings } from '@/features/portal/Components/CustomerPortalSettings'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import {
  isValidPortalBackgroundType,
  type PortalBackgroundType,
} from '@/features/portal/portal-backgrounds'

export default async function CustomerPortalSettingsPage() {
  const data = await getLayoutData()

  if (data.status === 'unauthenticated') redirect('/auth/sign-in')
  if (data.status === 'no-organization') redirect('/onboarding')

  const features = await getFeatures(data.organizationId)

  if (!features.customerPortal) {
    return (
      <FeatureLockedMessage
        feature="Customer Portal"
        description="Give your customers a self-service portal to view invoices, quotes, inspections, and request service."
        isCloud={isCloudMode()}
      />
    )
  }

  const [settings, org] = await Promise.all([
    db.appSetting.findMany({
      where: {
        organizationId: data.organizationId,
        key: {
          in: [
            SETTING_KEYS.PORTAL_ENABLED,
            SETTING_KEYS.PORTAL_DESCRIPTION,
            SETTING_KEYS.PORTAL_HOURS,
            SETTING_KEYS.PORTAL_BACKGROUND_TYPE,
            SETTING_KEYS.PORTAL_BACKGROUND_TEMPLATE,
            SETTING_KEYS.PORTAL_BACKGROUND_IMAGE,
          ],
        },
      },
      select: { key: true, value: true },
    }),
    db.organization.findUnique({
      where: { id: data.organizationId },
      select: { portalSlug: true },
    }),
  ])

  const settingMap = new Map(settings.map((s) => [s.key, s.value]))

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

  const rawBgType = settingMap.get(SETTING_KEYS.PORTAL_BACKGROUND_TYPE)
  const backgroundType: PortalBackgroundType = isValidPortalBackgroundType(rawBgType)
    ? rawBgType
    : 'none'

  return (
    <CustomerPortalSettings
      enabled={settingMap.get(SETTING_KEYS.PORTAL_ENABLED) === 'true'}
      orgId={data.organizationId}
      portalSlug={org?.portalSlug ?? null}
      appUrl={appUrl}
      description={settingMap.get(SETTING_KEYS.PORTAL_DESCRIPTION) ?? ''}
      hours={settingMap.get(SETTING_KEYS.PORTAL_HOURS) ?? ''}
      backgroundType={backgroundType}
      backgroundTemplate={settingMap.get(SETTING_KEYS.PORTAL_BACKGROUND_TEMPLATE) ?? ''}
      backgroundImage={settingMap.get(SETTING_KEYS.PORTAL_BACKGROUND_IMAGE) ?? ''}
    />
  )
}
