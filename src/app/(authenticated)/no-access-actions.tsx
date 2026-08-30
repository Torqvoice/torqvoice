'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { signOut } from '@/lib/auth-client'

/** The one thing this account can still do. */
export function NoAccessSignOut() {
  const router = useRouter()
  const t = useTranslations('navigation.sidebar')

  return (
    <Button
      type="button"
      variant="outline"
      onClick={async () => {
        await signOut()
        router.push('/auth/sign-in')
      }}
    >
      {t('signOut')}
    </Button>
  )
}
