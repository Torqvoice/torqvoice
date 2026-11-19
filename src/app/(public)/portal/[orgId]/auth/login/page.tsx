import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { PortalLanding } from '@/features/portal/Components/PortalLanding'
import { PortalLoginForm } from '@/features/portal/Components/PortalLoginForm'
import { PortalPlainScreen } from '@/features/portal/Components/PortalPlainScreen'
import { PortalButton, PortalNotice } from '@/features/portal/Components/Ui'
import { findDemoPortalCustomer } from '@/features/portal/Lib/demoCustomer'
import { isPortalLive } from '@/features/portal/Lib/portalLive'
import { signInErrorMessageKey } from '@/features/portal/Lib/signInLink'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { getCustomerSession } from '@/lib/customer-session'
import { db } from '@/lib/db'
import { normalizeCountryCode } from '@/lib/portal-phone'
import { resolvePortalOrg } from '@/lib/portal-slug'
import { getOrgSmsProvider } from '@/lib/sms'
import { titleFrom } from '@/lib/page-title'

export function generateMetadata() {
  return titleFrom('portal.login', 'verifyCode')
}

export default async function PortalLoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const { orgId: orgParam } = await params
  const { error: errorCode } = await searchParams
  const t = await getTranslations('portal.login')
  // Only a code the sign-in routes send is shown, in the customer's language;
  // any other text in the address is ignored.
  const errorKey = signInErrorMessageKey(errorCode)
  const authError = errorKey ? t(`errors.${errorKey}`) : undefined

  // Resolve slug or id to real org
  const org = await resolvePortalOrg(orgParam)
  if (!org) return <PortalPlainScreen title={t('notFound')} body={t('portalNotExist')} />

  const orgId = org.id
  if (!(await isPortalLive(orgId))) {
    return <PortalPlainScreen title={t('portalNotAvailable')} body={t('portalNotEnabled')} />
  }

  // If already logged in, redirect to dashboard
  const session = await getCustomerSession()
  if (session && session.organizationId === orgId) {
    redirect(`/portal/${orgParam}/dashboard`)
  }

  // Null everywhere but the demo, which sends no link or code to sign in with.
  const demoCustomer = await findDemoPortalCustomer(orgId)

  const [settings, smsProvider] = await Promise.all([
    db.appSetting.findMany({
      where: {
        organizationId: orgId,
        key: {
          in: [
            SETTING_KEYS.PORTAL_DESCRIPTION,
            SETTING_KEYS.PORTAL_HOURS,
            SETTING_KEYS.WORKSHOP_DEFAULT_COUNTRY_CODE,
          ],
        },
      },
      select: { key: true, value: true },
    }),
    // Whether this workshop can send texts decides if SMS sign-in is offered.
    getOrgSmsProvider(orgId),
  ])
  const get = (key: string) => settings.find((s) => s.key === key)?.value ?? null

  return (
    <PortalLanding
      orgParam={orgParam}
      organizationId={orgId}
      orgName={org.name}
      description={get(SETTING_KEYS.PORTAL_DESCRIPTION)}
      hoursText={get(SETTING_KEYS.PORTAL_HOURS)}
    >
      {demoCustomer ? (
        <form
          method="post"
          action={`/portal/${orgParam}/auth/demo`}
          className="flex flex-col gap-5"
        >
          {authError && (
            <PortalNotice tone="danger" role="alert">
              {authError}
            </PortalNotice>
          )}
          <p className="p-muted text-base leading-normal">
            {t('demoNotice', { customer: demoCustomer.name })}
          </p>
          <PortalButton type="submit" variant="accent" size="lg" block>
            {t('demoButton')}
          </PortalButton>
        </form>
      ) : (
        <PortalLoginForm
          orgId={orgParam}
          error={authError}
          smsEnabled={smsProvider !== null}
          defaultCountryCode={normalizeCountryCode(get(SETTING_KEYS.WORKSHOP_DEFAULT_COUNTRY_CODE))}
        />
      )}
    </PortalLanding>
  )
}
