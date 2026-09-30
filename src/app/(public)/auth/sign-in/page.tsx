import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { safeRedirectPath } from '@/lib/safe-redirect'
import { db } from '@/lib/db'
import { auth } from '@/lib/auth'
import { SignInForm } from './sign-in-form'
import { isDemoMode } from '@/lib/demo'
import { isCloudMode } from '@/lib/features'
import { isGoogleSignInEnabled } from '@/lib/auth-providers'

export const dynamic = 'force-dynamic'

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>
}) {
  const params = await searchParams
  const redirectTo = params.redirect ? safeRedirectPath(params.redirect) : undefined

  const [session, regSetting] = await Promise.all([
    auth.api.getSession({ headers: await headers() }),
    isDemoMode
      ? null
      : db.systemSetting.findUnique({
          where: { key: 'registration.disabled' },
          select: { value: true },
        }),
  ])

  // Someone who already has a session gets sent on, the same as sign-up does.
  // Without this the marketing site's Login link lands a signed-in customer
  // on a form they have no use for, while Start free takes them straight in.
  if (session?.user?.id) {
    redirect(redirectTo || '/')
  }

  return (
    <SignInForm
      registrationDisabled={isDemoMode || regSetting?.value === 'true'}
      demoMode={isDemoMode}
      cloudMode={isCloudMode()}
      googleEnabled={isGoogleSignInEnabled()}
    />
  )
}
