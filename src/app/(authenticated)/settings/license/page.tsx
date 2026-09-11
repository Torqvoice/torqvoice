import { getAuthContext } from '@/lib/get-auth-context'
import { db } from '@/lib/db'
import { redirect } from 'next/navigation'
import { isCloudMode } from '@/lib/features'
import { LicenseSettings } from '@/features/settings/Components/license-settings'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { isDemoMode } from '@/lib/demo'
import { verifyLicenseToken } from '@/lib/license/token'

export default async function LicensePage() {
  if (isCloudMode()) {
    redirect('/settings')
  }

  const authContext = await getAuthContext()
  if (!authContext) redirect('/auth/sign-in')

  const settings = await db.appSetting.findMany({
    where: {
      organizationId: authContext.organizationId,
      key: {
        in: [SETTING_KEYS.LICENSE_KEY, SETTING_KEYS.LICENSE_TOKEN, SETTING_KEYS.LICENSE_CHECKED_AT],
      },
    },
    select: { key: true, value: true },
  })

  const map = new Map(settings.map((s) => [s.key, s.value]))
  // What the feature gate sees, not what the last validate call said.
  const verification = verifyLicenseToken(
    map.get(SETTING_KEYS.LICENSE_TOKEN),
    authContext.organizationId
  )

  return (
    <LicenseSettings
      initialKey={map.get(SETTING_KEYS.LICENSE_KEY) || ''}
      initialStatus={verification.status}
      initialExpiresAt={verification.payload?.expiresAt ?? ''}
      initialIssuedAt={verification.payload?.issuedAt ?? ''}
      initialCheckedAt={map.get(SETTING_KEYS.LICENSE_CHECKED_AT) || ''}
      demoMode={isDemoMode}
    />
  )
}
