import { getCachedSession } from '@/lib/cached-session'
import { db } from '@/lib/db'
import { redirect } from 'next/navigation'
import { AccountSettings } from './account-settings'
import { listMyDevices } from '@/features/settings/Actions/sessionActions'
import { getMySignature } from '@/features/signatures/Actions/signatureActions'
import { hasPassword } from '@/lib/reauth.server'

export default async function AccountSettingsPage() {
  const session = await getCachedSession()
  if (!session) redirect('/auth/sign-in')

  const [user, verificationSetting, devices, signature, withPassword] = await Promise.all([
    db.user.findUnique({
      where: { id: session.user.id },
      select: { twoFactorEnabled: true, emailVerified: true },
    }),
    db.systemSetting.findUnique({
      where: { key: 'email.verificationRequired' },
      select: { value: true },
    }),
    listMyDevices(),
    getMySignature(),
    // Someone who signed up with Google has none: they are offered "set a
    // password", since "change" has no current one to check.
    hasPassword(session.user.id),
  ])

  return (
    <AccountSettings
      twoFactorEnabled={user?.twoFactorEnabled ?? false}
      emailVerified={user?.emailVerified ?? false}
      emailVerificationRequired={verificationSetting?.value === 'true'}
      hasPassword={withPassword}
      devices={devices}
      signature={signature.success ? (signature.data ?? null) : null}
    />
  )
}
