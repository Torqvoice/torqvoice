'use client'

import type { ReactNode } from 'react'
import { useMemo } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import { AlertTriangle, Info } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { RepairDataView } from '@/features/integrations/Actions/repairDataActions'
import type { RepairDataConfidence } from '@/features/integrations/Lib/types'
import { cn } from '@/lib/utils'

/** "fuel-system" as "Fuel system", "hvac" as "HVAC": the source's own words, in English. */
export function categoryLabel(category: string): string {
  if (category.length <= 4 && !category.includes('-')) return category.toUpperCase()
  const words = category.replace(/[-_]+/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

export const CONFIDENCE_ORDER: RepairDataConfidence[] = ['oem', 'high', 'medium', 'estimated']

const DOT: Record<RepairDataConfidence, string> = {
  oem: 'bg-emerald-500 ring-2 ring-emerald-500/25',
  high: 'bg-emerald-500',
  medium: 'bg-blue-500',
  estimated: 'bg-amber-500',
}

/** A coloured dot and the level's name, with what it means on hover. */
export function ConfidenceMark({
  confidence,
  className,
}: {
  confidence: RepairDataConfidence | null
  className?: string
}) {
  const t = useTranslations('service.laborGuide.confidence')
  if (!confidence) return null
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            'inline-flex cursor-default items-center gap-1.5 text-xs text-muted-foreground',
            className
          )}
        >
          <span aria-hidden className={cn('size-1.5 shrink-0 rounded-full', DOT[confidence])} />
          {t(confidence)}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-60">{t(`${confidence}Help`)}</TooltipContent>
    </Tooltip>
  )
}

/** The legend for the footer's "how sure" popover. */
export function ConfidenceLegend() {
  const t = useTranslations('service.laborGuide.confidence')
  return (
    <ul className="space-y-2.5">
      {CONFIDENCE_ORDER.map((c) => (
        <li key={c} className="flex gap-2.5">
          <span aria-hidden className={cn('mt-1.5 size-1.5 shrink-0 rounded-full', DOT[c])} />
          <div className="text-xs">
            <p className="font-medium text-foreground">{t(c)}</p>
            <p className="text-muted-foreground">{t(`${c}Help`)}</p>
          </div>
        </li>
      ))}
    </ul>
  )
}

/** The part of a name that matches the search, marked. */
export function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim()
  if (!q) return <>{text}</>
  const at = text.toLowerCase().indexOf(q.toLowerCase())
  if (at < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, at)}
      <mark className="rounded-sm bg-primary/15 px-0.5 text-foreground">
        {text.slice(at, at + q.length)}
      </mark>
      {text.slice(at + q.length)}
    </>
  )
}

/** "United States" for "US", in the reader's language. */
export function useRegionName(region: string | null): string | null {
  const locale = useLocale()
  return useMemo(() => {
    if (!region) return null
    try {
      return new Intl.DisplayNames([locale], { type: 'region' }).of(region) ?? region
    } catch {
      return region
    }
  }, [locale, region])
}

/** A centred state for the whole panel: nothing found, a failure, an empty list. */
export function GuideMessage({
  icon: Icon,
  tone = 'muted',
  title,
  children,
  action,
}: {
  icon: LucideIcon
  tone?: 'muted' | 'destructive'
  title: string
  children?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 py-12 text-center">
      <div
        className={cn(
          'mb-4 flex size-12 items-center justify-center rounded-full',
          tone === 'destructive'
            ? 'bg-destructive/10 text-destructive'
            : 'bg-muted text-muted-foreground'
        )}
      >
        <Icon className="size-5" />
      </div>
      <p className="text-sm font-medium">{title}</p>
      {children && (
        <div className="mt-1.5 max-w-sm text-sm text-pretty text-muted-foreground">{children}</div>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

/**
 * What the person should know before trusting the list: the engine may not
 * be this vehicle's, or the workshop's settings hide some values.
 */
export function GuideNotices({
  view,
  multipleEngines,
  settingsHref,
}: {
  view: Pick<RepairDataView<'labor'>, 'match' | 'hidden'>
  multipleEngines: boolean
  settingsHref: string
}) {
  const t = useTranslations('service.laborGuide')
  const engine =
    view.match === 'none'
      ? { tone: 'warn' as const, text: t('matchNone') }
      : multipleEngines && view.match === 'fuel'
        ? { tone: 'info' as const, text: t('matchFuel') }
        : multipleEngines && view.match === 'unknown'
          ? { tone: 'info' as const, text: t('matchUnknown') }
          : null
  if (!engine && view.hidden === 0) return null
  return (
    <div className="space-y-2 px-4 pt-3 sm:px-5">
      {engine && (
        <div
          role={engine.tone === 'warn' ? 'alert' : undefined}
          className={cn(
            'flex gap-2.5 rounded-lg border px-3 py-2.5 text-xs leading-relaxed',
            engine.tone === 'warn'
              ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
              : 'bg-muted/40 text-muted-foreground'
          )}
        >
          {engine.tone === 'warn' ? (
            <AlertTriangle className="mt-px size-3.5 shrink-0" />
          ) : (
            <Info className="mt-px size-3.5 shrink-0" />
          )}
          <p>{engine.text}</p>
        </div>
      )}
      {view.hidden > 0 && (
        <p className="text-xs text-muted-foreground">
          {t('hiddenByConfidence', { count: view.hidden })}{' '}
          <Link
            href={settingsHref}
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            {t('changeSettings')}
          </Link>
        </p>
      )}
    </div>
  )
}
