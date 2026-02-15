import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { SignUpForm } from './sign-up-form'

export const dynamic = 'force-dynamic'

export default async function SignUpPage() {
  const regSetting = await db.systemSetting.findUnique({
    where: { key: 'registration.disabled' },
    select: { value: true },
  })

  if (regSetting?.value === 'true') {
    redirect('/auth/sign-in')
  }

  return <SignUpForm />
}
