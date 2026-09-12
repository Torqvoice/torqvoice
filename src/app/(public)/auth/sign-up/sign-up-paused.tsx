import Link from 'next/link'
import { PauseCircle } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { AuthCard, AuthShell } from '@/components/auth/auth-shell'
import { Button } from '@/components/ui/button'

/**
 * What the sign-up page shows while registration is switched off.
 *
 * The switch is `registration.disabled`, set from the app's own admin page or
 * from torqvoice.com when the cloud is paused for capacity. Invitations still
 * open the form, so a paused workshop can keep bringing colleagues in.
 */
export async function SignUpPaused({ cloudMode }: { cloudMode: boolean }) {
  const t = await getTranslations('auth.signUp.paused')

  return (
    <AuthShell pitch={cloudMode}>
      <AuthCard>
        <div className="flex flex-col items-center py-4 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <PauseCircle className="h-6 w-6 text-primary" />
          </div>
          <h1 className="mt-4 text-xl font-semibold">{t('title')}</h1>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            {cloudMode ? t('descriptionCloud') : t('descriptionSelfHosted')}
          </p>
          <Button asChild className="mt-6" variant="outline">
            <Link href="/auth/sign-in">{t('signIn')}</Link>
          </Button>
        </div>
      </AuthCard>
    </AuthShell>
  )
}
