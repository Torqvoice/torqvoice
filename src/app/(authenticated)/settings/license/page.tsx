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

  const [settings, organization] = await Promise.all([
    db.appSetting.findMany({
      where: {
        organizationId: authContext.organizationId,
        key: {
          in: [
            SETTING_KEYS.LICENSE_KEY,
            SETTING_KEYS.LICENSE_TOKEN,
            SETTING_KEYS.LICENSE_CHECKED_AT,
            SETTING_KEYS.INVOICE_ORG_NUMBER,
          ],
        },
      },
      select: { key: true, value: true },
    }),
    db.organization.findUnique({
      where: { id: authContext.organizationId },
      select: { name: true },
    }),
  ])

  const map = new Map(settings.map((s) => [s.key, s.value]))
  const registrationNumber = map.get(SETTING_KEYS.INVOICE_ORG_NUMBER) || ''
  // What the feature gate sees, not what the last validate call said. An
  // offline licence only holds while the organization number still matches.
  const verification = verifyLicenseToken(
    map.get(SETTING_KEYS.LICENSE_TOKEN),
    authContext.organizationId,
    { registrationNumber }
  )

  return (
    <LicenseSettings
      initialKey={map.get(SETTING_KEYS.LICENSE_KEY) || ''}
      initialStatus={verification.status}
      initialKind={verification.kind}
      initialLicensee={verification.licensee}
      initialMaxOrganizations={verification.maxOrganizations}
      initialExpiresAt={verification.expiresAt ?? ''}
      initialIssuedAt={verification.payload?.issuedAt ?? ''}
      initialCheckedAt={map.get(SETTING_KEYS.LICENSE_CHECKED_AT) || ''}
      organizationId={authContext.organizationId}
      workshopName={organization?.name ?? ''}
      registrationNumber={registrationNumber}
      // The app name and icon live on the super-admin page; anyone else is
      // told who to ask instead of being sent to a redirect.
      brandingHref={authContext.role === 'super_admin' ? '/admin/settings#app-branding' : null}
      demoMode={isDemoMode}
    />
  )
}
