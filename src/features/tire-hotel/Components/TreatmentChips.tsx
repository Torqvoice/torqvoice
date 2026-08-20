'use client'

import { useTranslations } from 'next-intl'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TREATMENT_ICON_MAP } from './TreatmentPicker'
import { pendingTreatments, treatmentProgress, type TreatmentType } from '../Lib/treatments'

/**
 * Outstanding prep, as icons, for a table row.
 *
 * Icons rather than words because the column has to stay narrow, and the
 * tooltip carries the name for anyone who has not learned them yet. A set
 * with nothing left shows a single tick instead of an empty cell, so "done"
 * and "nothing was ever asked for" stay tellable apart.
 */
export function TreatmentChips({
  treatments,
  className,
}: {
  treatments: { type: string; status: string }[]
  className?: string
}) {
  const t = useTranslations('tireHotel')
  const pending = pendingTreatments(treatments)
  const progress = treatmentProgress(treatments)

  if (treatments.length === 0) {
    return <span className={cn('text-xs text-muted-foreground', className)}>-</span>
  }

  if (pending.length === 0) {
    return (
      <span
        className={cn('flex items-center gap-1 text-xs text-emerald-600', className)}
        title={t('treatments.allComplete')}
      >
        <Check className="h-3.5 w-3.5" />
        <span className="hidden lg:inline">{t('treatments.ready')}</span>
      </span>
    )
  }

  return (
    <span
      className={cn('flex items-center gap-1', className)}
      title={pending.map((p) => t(`treatments.types.${p.type}`)).join(', ')}
      aria-label={t('treatments.pendingCount', { count: progress.pending })}
    >
      {pending.slice(0, 3).map((treatment) => {
        const Icon = TREATMENT_ICON_MAP[treatment.type as TreatmentType]
        return Icon ? (
          <Icon key={treatment.type} className="h-3.5 w-3.5 shrink-0 text-amber-600" />
        ) : null
      })}
      {pending.length > 3 && (
        <span className="text-[10px] font-medium text-amber-600 tabular-nums">
          +{pending.length - 3}
        </span>
      )}
    </span>
  )
}
