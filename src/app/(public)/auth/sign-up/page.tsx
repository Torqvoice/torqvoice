import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { db } from '@/lib/db'
import { auth } from '@/lib/auth'
import { SignUpForm } from './sign-up-form'

export const dynamic = 'force-dynamic'

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string; redirect?: string }>
}) {
  const params = await searchParams
  const inviteToken = params.invite
  const redirectTo = params.redirect

  // If already authenticated, redirect to the target or home
  const session = await auth.api.getSession({ headers: await headers() })
  if (session?.user?.id) {
    redirect(redirectTo || '/')
  }

  // If there's an invite token, skip the registration-disabled check
  if (!inviteToken) {
    const regSetting = await db.systemSetting.findUnique({
      where: { key: 'registration.disabled' },
      select: { value: true },
    })

    if (regSetting?.value === 'true') {
      redirect('/auth/sign-in')
    }
  }

  const verificationSetting = await db.systemSetting.findUnique({
    where: { key: 'email.verificationRequired' },
    select: { value: true },
  })
  const emailVerificationRequired = verificationSetting?.value === 'true'

  return <SignUpForm inviteToken={inviteToken} emailVerificationRequired={emailVerificationRequired} redirectTo={redirectTo} />
}
