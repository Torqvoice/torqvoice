import { db } from '@/lib/db'
import { SignInForm } from './sign-in-form'

export const dynamic = 'force-dynamic'

export default async function SignInPage() {
  const regSetting = await db.systemSetting.findUnique({
    where: { key: 'registration.disabled' },
    select: { value: true },
  })

  return (
    <SignInForm
      registrationDisabled={regSetting?.value === 'true'}
    />
  )
}
