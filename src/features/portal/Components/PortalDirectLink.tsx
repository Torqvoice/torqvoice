'use client'

import { useTranslations } from 'next-intl'
import { Link2 } from 'lucide-react'

export function PortalDirectLink() {
  const t = useTranslations('portal.directLink')

  return (
    <div className="min-h-svh bg-muted/30">
      <div className="mx-auto max-w-xl px-4 py-24 sm:px-6 sm:py-32 text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <Link2 className="h-8 w-8 text-primary" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t('title')}</h1>
        <p className="mt-3 text-base text-muted-foreground sm:text-lg">{t('description')}</p>
        <p className="mt-2 text-sm text-muted-foreground">{t('hint')}</p>
      </div>
    </div>
  )
}
