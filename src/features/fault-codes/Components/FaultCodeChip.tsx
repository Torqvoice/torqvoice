'use client'

import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import type { FaultCodeView, MeaningSource } from '../Lib/types'

/**
 * A code as the app draws it everywhere: mono, boxed, the same on a
 * finding, in the search palette and on the code page. A button when it
 * opens something.
 */
export function FaultCodeChip({
  code,
  onClick,
  className,
  size = 'sm',
}: {
  code: string
  onClick?: () => void
  className?: string
  size?: 'sm' | 'lg'
}) {
  const t = useTranslations('faultCodes')
  const classes = cn(
    'inline-flex shrink-0 items-center rounded-md border bg-muted font-mono font-semibold tracking-wide text-foreground',
    size === 'lg' ? 'px-2 py-0.5 text-base' : 'px-1.5 py-px text-xs',
    onClick && 'cursor-pointer transition-colors hover:border-primary/40 hover:bg-primary/10',
    className
  )
  if (onClick) {
    return (
      <button
        type="button"
        className={classes}
        onClick={onClick}
        aria-label={t('chip.open', { code })}
      >
        {code}
      </button>
    )
  }
  return <span className={classes}>{code}</span>
}

/** "Generic", "Volkswagen", "From the scan report": where the meaning on screen comes from. */
export function MeaningSourceLabel({
  source,
  make,
  machineTranslated,
  className,
}: {
  source: MeaningSource | null
  make?: string | null
  machineTranslated?: boolean
  className?: string
}) {
  const t = useTranslations('faultCodes.source')
  if (!source) return null
  const label =
    source === 'manufacturer'
      ? make || t('manufacturer')
      : source === 'report'
        ? t('report')
        : t('generic')
  return (
    <span className={cn('text-[11px] text-muted-foreground', className)}>
      {label}
      {machineTranslated ? ` · ${t('machineTranslated')}` : null}
    </span>
  )
}

/** Stored, pending, permanent, history, as the scan tool said. */
export function FaultStatusBadge({ status }: { status: string | null | undefined }) {
  const t = useTranslations('faultCodes.status')
  if (!status || !['stored', 'pending', 'permanent', 'history'].includes(status)) return null
  return (
    <span className="inline-flex shrink-0 items-center rounded border px-1.5 py-px text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
      {t(status as 'stored' | 'pending' | 'permanent' | 'history')}
    </span>
  )
}

/** The meaning, or why there is none, in one line beside a chip. */
export function MeaningText({
  view,
  loading,
  className,
}: {
  view: FaultCodeView | undefined
  loading?: boolean
  className?: string
}) {
  const t = useTranslations('faultCodes')
  if (loading && !view) {
    return <span className={cn('skeleton inline-block h-3 w-40 rounded', className)} />
  }
  if (!view || view.state === 'unavailable') {
    return (
      <span className={cn('text-sm text-muted-foreground', className)}>{t('notAvailable')}</span>
    )
  }
  if (view.state === 'unknown' || !view.title) {
    return (
      <span className={cn('text-sm text-muted-foreground', className)}>
        {t(view.range === 'manufacturer' ? 'manufacturerUnknown' : 'noMeaning')}
      </span>
    )
  }
  return <span className={cn('text-sm', className)}>{view.title}</span>
}
