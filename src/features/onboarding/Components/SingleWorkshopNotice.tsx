'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Building2, LogOut } from 'lucide-react'
import { signOut } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'
import { AuthLogo } from '@/components/auth-logo'

/**
 * Shown instead of the workshop form when this install already has its one
 * workshop and holds no licence for more. The person is signed in and has
 * nowhere to go until the owner invites them, so the only action is to
 * sign out and come back through the invitation.
 */
export function SingleWorkshopNotice({ email }: { email: string }) {
  const t = useTranslations('onboarding.singleWorkshop')
  const tc = useTranslations('common')
  const router = useRouter()

  const handleSignOut = async () => {
    await signOut()
    router.push('/auth/sign-in')
    router.refresh()
  }

  return (
    <div className="glass relative z-10 w-full max-w-md rounded-2xl p-8 shadow-2xl">
      <div className="mb-6 text-center">
        <div className="mb-4 inline-flex items-center gap-2">
          <AuthLogo alt={tc('brandName')} />
        </div>
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <Building2 className="h-6 w-6 text-primary" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t('description', { email })}</p>
      </div>
      <Button type="button" variant="outline" className="w-full" onClick={handleSignOut}>
        <LogOut className="mr-2 h-4 w-4" />
        {t('signOut')}
      </Button>
    </div>
  )
}
