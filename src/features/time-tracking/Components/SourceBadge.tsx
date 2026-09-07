'use client'

import { useTranslations } from 'next-intl'
import { PencilLine, Smartphone, Monitor, Keyboard } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Where an entry came from, and whether a person has touched it since.
 *
 * A figure the app measured and a figure somebody typed in look identical as
 * numbers; the badge is what stops a corrected sheet from passing as a
 * recorded one.
 */
export function SourceBadge({
  source,
  editedByName,
  className,
}: {
  source: string
  editedByName: string | null
  className?: string
}) {
  const t = useTranslations('timeTracking.source')
  const Icon = source === 'manual' ? Keyboard : source === 'web' ? Monitor : Smartphone
  const label = source === 'manual' ? t('manual') : source === 'web' ? t('web') : t('app')
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground',
        source === 'manual' &&
          'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
        className
      )}
      title={editedByName ? t('editedBy', { name: editedByName }) : label}
    >
      <Icon className="size-3" />
      {label}
      {editedByName && source !== 'manual' && <PencilLine className="size-3" />}
    </span>
  )
}
