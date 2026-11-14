import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  checkSignInLink,
  SIGN_IN_LINK_COOKIE,
  SIGN_IN_LINK_ERRORS,
} from '@/features/portal/Lib/signInLink'
import { resolvePortalOrg } from '@/lib/portal-slug'

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
  const toLogin = (error: string): never =>
    redirect(`${loginUrl}?error=${encodeURIComponent(error)}`)

  const org = await resolvePortalOrg(orgParam)
  if (!org) redirect(loginUrl)

  const token = (await cookies()).get(SIGN_IN_LINK_COOKIE)?.value
  // No link in this browser: someone came here by address, not from a mail.
  if (!token) redirect(loginUrl)

  const link = await checkSignInLink(org.id, token)
  if (!link.ok) return toLogin(SIGN_IN_LINK_ERRORS[link.problem])

  const t = await getTranslations('portal.login')

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/30 px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>{t('confirmTitle', { workshop: org.name })}</CardTitle>
          <CardDescription>{t('confirmDescription', { email: link.email })}</CardDescription>
        </CardHeader>
        <CardContent>
          <form method="post" action={`/portal/${orgParam}/auth/verify`}>
            <Button type="submit" size="lg" className="w-full">
              {t('confirmButton')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
