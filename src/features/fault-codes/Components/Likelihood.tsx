'use client'

import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'

/** High, medium or low as a small bar of three, with the word for screen readers. */
export function Likelihood({ level }: { level: 'low' | 'medium' | 'high' }) {
  const t = useTranslations('faultCodes.detail.likelihood')
  const filled = level === 'high' ? 3 : level === 'medium' ? 2 : 1
  return (
    <span className="mt-1.5 flex shrink-0 items-center gap-0.5" title={t(level)}>
      {[1, 2, 3].map((i) => (
        <span
          key={i}
          className={cn('h-1.5 w-3 rounded-full', i <= filled ? 'bg-primary' : 'bg-muted')}
        />
      ))}
      <span className="sr-only">{t(level)}</span>
    </span>
  )
}
