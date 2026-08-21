'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { MessageCircle } from 'lucide-react'

/** Shown when the plan allows WhatsApp but nobody has connected a number yet. */
export function WhatsappNotConfiguredMessage() {
  const t = useTranslations('whatsapp.messages.notConfigured')

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-16 text-center">
      <MessageCircle className="h-8 w-8 text-muted-foreground" />
      <p className="font-medium">{t('title')}</p>
      <p className="max-w-md text-sm text-muted-foreground">{t('description')}</p>
      <Button asChild>
        <Link href="/settings/providers?tab=whatsapp">{t('action')}</Link>
      </Button>
    </div>
  )
}
