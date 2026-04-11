import { db } from '@/lib/db'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { PortalLanding } from '@/features/portal/Components/PortalLanding'
import { getCustomerSession } from '@/lib/customer-session'
import { redirect } from 'next/navigation'
import { resolvePortalOrg } from '@/lib/portal-slug'
import { getTranslations } from 'next-intl/server'
import { getOrgSmsProvider } from '@/lib/sms'
import {
  isValidPortalBackgroundType,
  type PortalBackgroundType,
} from '@/features/portal/portal-backgrounds'

export default async function PortalLoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const { orgId: orgParam } = await params
  const { error: authError } = await searchParams
  const t = await getTranslations('portal.login')

  // Resolve slug or id to real org
  const org = await resolvePortalOrg(orgParam)

  if (!org) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold">{t('notFound')}</h1>
          <p className="mt-2 text-muted-foreground">{t('portalNotExist')}</p>
        </div>
      </div>
    )
  }

  const orgId = org.id

  // Whether this workshop has an SMS provider configured. Controls visibility
  // of the SMS sign-in tab on the landing page.
  const smsEnabled = (await getOrgSmsProvider(orgId)) !== null

  // Fetch all the portal-relevant settings in one query.
  const settings = await db.appSetting.findMany({
    where: {
      organizationId: orgId,
      key: {
        in: [
          SETTING_KEYS.PORTAL_ENABLED,
          SETTING_KEYS.PORTAL_DESCRIPTION,
          SETTING_KEYS.PORTAL_HOURS,
          SETTING_KEYS.COMPANY_LOGO,
          SETTING_KEYS.WORKSHOP_ADDRESS,
          SETTING_KEYS.WORKSHOP_PHONE,
          SETTING_KEYS.WORKSHOP_EMAIL,
          SETTING_KEYS.PORTAL_BACKGROUND_TYPE,
          SETTING_KEYS.PORTAL_BACKGROUND_TEMPLATE,
          SETTING_KEYS.PORTAL_BACKGROUND_IMAGE,
        ],
      },
    },
    select: { key: true, value: true },
  })
  const get = (key: string) => settings.find((s) => s.key === key)?.value ?? null

  const rawBgType = get(SETTING_KEYS.PORTAL_BACKGROUND_TYPE)
  const backgroundType: PortalBackgroundType = isValidPortalBackgroundType(rawBgType)
    ? rawBgType
    : 'none'

  if (get(SETTING_KEYS.PORTAL_ENABLED) !== 'true') {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold">{t('portalNotAvailable')}</h1>
          <p className="mt-2 text-muted-foreground">{t('portalNotEnabled')}</p>
        </div>
      </div>
    )
  }

  // If already logged in, redirect to dashboard
  const session = await getCustomerSession()
  if (session && session.organizationId === orgId) {
    redirect(`/portal/${orgParam}/dashboard`)
  }

  return (
    <PortalLanding
      orgId={orgParam}
      orgName={org.name}
      // Use the public logo endpoint so unauthenticated visitors can load it.
      orgLogo={get(SETTING_KEYS.COMPANY_LOGO) ? `/api/public/logo/${orgParam}` : null}
      description={get(SETTING_KEYS.PORTAL_DESCRIPTION)}
      hours={get(SETTING_KEYS.PORTAL_HOURS)}
      address={get(SETTING_KEYS.WORKSHOP_ADDRESS)}
      phone={get(SETTING_KEYS.WORKSHOP_PHONE)}
      email={get(SETTING_KEYS.WORKSHOP_EMAIL)}
      authError={authError}
      backgroundType={backgroundType}
      backgroundTemplateId={get(SETTING_KEYS.PORTAL_BACKGROUND_TEMPLATE)}
      // Same public-endpoint pattern as the logo.
      backgroundImageUrl={
        get(SETTING_KEYS.PORTAL_BACKGROUND_IMAGE) ? `/api/public/portal-bg/${orgParam}` : null
      }
      smsEnabled={smsEnabled}
    />
  )
}
