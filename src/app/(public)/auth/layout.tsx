import { db } from '@/lib/db'
import { isCloudMode } from '@/lib/features'
import { AuthLogoProvider } from '@/components/auth-logo-provider'

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  // A workshop's own logo replaces the brand mark only on a self-hosted
  // install, where one workshop owns the server. The setting is stored per
  // organisation, so on the cloud instance the first row that happens to
  // match would put some customer's logo on everybody's sign-in page.
  const logoSetting = isCloudMode()
    ? null
    : await db.appSetting.findFirst({
        where: { key: 'workshop.logo' },
        select: { id: true },
      })

  return <AuthLogoProvider hasCustomLogo={!!logoSetting}>{children}</AuthLogoProvider>
}
