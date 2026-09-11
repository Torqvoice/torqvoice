import { redirect } from 'next/navigation'
import { safeRedirectPath } from '@/lib/safe-redirect'
import { headers } from 'next/headers'
import { db } from '@/lib/db'
import { auth } from '@/lib/auth'
import { SignUpForm } from './sign-up-form'
import { isDemoMode } from '@/lib/demo'
import { isCloudMode } from '@/lib/features'
import { isGoogleSignInEnabled } from '@/lib/auth-providers'
import { acceptInvitation } from '@/features/team/Actions/acceptInvitation'

export const dynamic = 'force-dynamic'

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string; redirect?: string; error?: string }>
}) {
  const params = await searchParams
  const inviteToken = params.invite
  const redirectTo = params.redirect ? safeRedirectPath(params.redirect) : undefined
  const oauthFailed = Boolean(params.error)

  // The three lookups do not depend on each other. This is the first page a
  // new visitor sees, so it should not pay for three round-trips in a row.
  const [session, regSetting, verificationSetting] = await Promise.all([
    auth.api.getSession({ headers: await headers() }),
    inviteToken || isDemoMode
      ? null
      : db.systemSetting.findUnique({
          where: { key: 'registration.disabled' },
          select: { value: true },
        }),
    db.systemSetting.findUnique({
      where: { key: 'email.verificationRequired' },
      select: { value: true },
    }),
  ])

  // If already authenticated, redirect to the target or home. A Google
  // sign-up with an invitation comes back here signed in and still holding
  // the token, so the invitation is accepted first; the email path does the
  // same from the form after signUp.email.
  if (session?.user?.id) {
    if (inviteToken) {
      await acceptInvitation({ token: inviteToken }).catch(() => null)
    }
    redirect(redirectTo || '/')
  }

  // If there's an invite token, skip the registration-disabled check
  if (!inviteToken) {
    if (isDemoMode) {
      redirect('/auth/sign-in')
    }
    if (regSetting?.value === 'true') {
      redirect('/auth/sign-in')
    }
  }

  const emailVerificationRequired = verificationSetting?.value === 'true'

  return (
    <SignUpForm
      inviteToken={inviteToken}
      emailVerificationRequired={emailVerificationRequired}
      redirectTo={redirectTo}
      cloudMode={isCloudMode()}
      googleEnabled={isGoogleSignInEnabled()}
      oauthFailed={oauthFailed}
    />
  )
}
