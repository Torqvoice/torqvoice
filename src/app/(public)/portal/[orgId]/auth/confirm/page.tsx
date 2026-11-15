import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { PortalLanding } from '@/features/portal/Components/PortalLanding'
import { PortalButton } from '@/features/portal/Components/Ui'
import {
  checkSignInLink,
  SIGN_IN_LINK_COOKIE,
  type SignInErrorCode,
} from '@/features/portal/Lib/signInLink'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { db } from '@/lib/db'
import { resolvePortalOrg } from '@/lib/portal-slug'
import { titleFrom } from '@/lib/page-title'

export function generateMetadata() {
  return titleFrom('portal.login', 'verifyCode')
}

export const dynamic = 'force-dynamic'

/**
 * Where the emailed sign-in link lands. The link itself spends nothing; the
 * button here posts to the verify route, which does. A plain form, so it
 * works before any script has loaded.
 */
export default async function PortalConfirmSignInPage({
  params,
}: {
  params: Promise<{ orgId: string }>
}) {
  const { orgId: orgParam } = await params
  const loginUrl = `/portal/${orgParam}/auth/login`
  const toLogin = (error: SignInErrorCode): never => redirect(`${loginUrl}?error=${error}`)

  const org = await resolvePortalOrg(orgParam)
  if (!org) redirect(loginUrl)

  const token = (await cookies()).get(SIGN_IN_LINK_COOKIE)?.value
  // No link in this browser: someone came here by address, not from a mail.
  if (!token) redirect(loginUrl)

  const link = await checkSignInLink(org.id, token)
  if (!link.ok) return toLogin(link.problem)

  const [t, tFrame, settings] = await Promise.all([
    getTranslations('portal.login'),
    getTranslations('portal.signIn'),
    db.appSetting.findMany({
      where: {
        organizationId: org.id,
        key: { in: [SETTING_KEYS.PORTAL_DESCRIPTION, SETTING_KEYS.PORTAL_HOURS] },
      },
      select: { key: true, value: true },
    }),
  ])
  const get = (key: string) => settings.find((s) => s.key === key)?.value ?? null

  return (
    <PortalLanding
      orgParam={orgParam}
      organizationId={org.id}
      orgName={org.name}
      description={get(SETTING_KEYS.PORTAL_DESCRIPTION)}
      hoursText={get(SETTING_KEYS.PORTAL_HOURS)}
      eyebrow={tFrame('confirmEyebrow')}
      heading={t('confirmTitle', { workshop: org.name })}
    >
      <p className="p-muted text-base leading-normal">
        {t('confirmDescription', { email: link.email })}
      </p>
      <form method="post" action={`/portal/${orgParam}/auth/verify`}>
        {/* Which link this page was drawn for; see the verify route. */}
        <input type="hidden" name="link" value={link.id} />
        <PortalButton type="submit" variant="accent" size="lg" block>
          {t('confirmButton')}
        </PortalButton>
      </form>
    </PortalLanding>
  )
}
