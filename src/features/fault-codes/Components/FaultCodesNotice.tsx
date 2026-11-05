'use client'

import { useTranslations } from 'next-intl'
import { Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Says fault codes are new and still growing, so a code that is not here yet
 * reads as "coming" rather than "broken", and that only the standard OBD
 * codes are covered for now. Visible text rather than a tooltip, because a
 * tooltip never opens on a phone.
 */
export function FaultCodesNotice({ className }: { className?: string }) {
  const t = useTranslations('faultCodes.notice')
  return (
    <div
      role="note"
      className={cn(
        'flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3',
        className
      )}
    >
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Sparkles className="size-3.5" aria-hidden />
      </span>
      <div className="min-w-0 space-y-0.5 text-sm">
        <p className="font-medium">{t('title')}</p>
        <p className="text-muted-foreground">{t('body')}</p>
      </div>
    </div>
  )
}
