import { db } from '@/lib/db'
import { SignInForm } from './sign-in-form'
import { isDemoMode } from '@/lib/demo'
import { isCloudMode } from '@/lib/features'

export const dynamic = 'force-dynamic'

export default async function SignInPage() {
  const regSetting = isDemoMode
    ? null
    : await db.systemSetting.findUnique({
        where: { key: 'registration.disabled' },
        select: { value: true },
      })

  return (
    <SignInForm
      registrationDisabled={isDemoMode || regSetting?.value === 'true'}
      demoMode={isDemoMode}
      cloudMode={isCloudMode()}
    />
  )
}
