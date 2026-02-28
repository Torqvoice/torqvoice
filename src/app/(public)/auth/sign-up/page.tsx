import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { SignUpForm } from './sign-up-form'

export const dynamic = 'force-dynamic'

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string }>
}) {
  const params = await searchParams
  const inviteToken = params.invite

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

  return <SignUpForm inviteToken={inviteToken} emailVerificationRequired={emailVerificationRequired} />
}
