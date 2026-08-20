'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { AppCard } from '@/components/app-card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { mmToThirtySeconds } from '@/features/tire-hotel/Lib/tireConstants'
import {
  forecastSet,
  replacementDemand,
  demandTotals,
  type SetForecast,
} from '@/features/tire-hotel/Lib/forecast'
import type { getSetsForForecast } from '@/features/tire-hotel/Actions/tireSetActions'
import { ChevronDown, ChevronRight, Package, TriangleAlert } from 'lucide-react'
import { DocsLink } from '@/components/docs-link'

type ForecastRow = NonNullable<
  Awaited<ReturnType<typeof getSetsForForecast>>['data']
>['sets'][number]

/**
 * What the shop can expect to sell next season, from tires it has measured.
 *
 * A tire hotel is the only party that puts a gauge on the same four tires
 * twice a year, so this is the one purchasing question it can answer from its
 * own records rather than from a supplier's guess.
 *
 * Two halves, kept apart on purpose. Sets already at the limit are measured
 * fact. Sets a season away are an extrapolation from one customer's driving
 * over one interval, which is a signal worth having and not a number to build
 * a purchase order on by itself.
 */
export function ForecastClient({
  sets,
  total,
  shown,
  imperial,
  thresholds,
}: {
  sets: ForecastRow[]
  /** Live sets the shop holds, which may be more than were read. */
  total: number
  shown: number
  imperial: boolean
  thresholds: { summerReplace: number; winterReplace: number }
}) {
  const t = useTranslations('tireHotel')
  const [open, setOpen] = useState<string | null>(null)

  const { demand, totals, unknown } = useMemo(() => {
    const forecasts = sets.map((set) => forecastSet(set, thresholds))
    const grouped = replacementDemand(forecasts)
    return {
      demand: grouped,
      totals: demandTotals(grouped),
      unknown: forecasts.filter((f) => f.verdict === 'unknown').length,
    }
  }, [sets, thresholds])

  const depth = (mm: number | null) => {
    if (mm == null) return '-'
    return imperial ? `${mmToThirtySeconds(mm).toFixed(1)}/32"` : `${mm.toFixed(1)} mm`
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold">{t('forecast.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('forecast.subtitle')}</p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/tire-hotel">{t('forecast.backToList')}</Link>
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Figure label={t('forecast.tires')} value={totals.tires} />
        <Figure label={t('forecast.atLimit')} value={totals.atLimit} tone="amber" />
        <Figure label={t('forecast.expected')} value={totals.expected} />
      </div>

      {demand.length === 0 ? (
        <AppCard icon={Package} title={t('forecast.orderTitle')}>
          <p className="text-sm text-muted-foreground">{t('forecast.empty')}</p>
        </AppCard>
      ) : (
        <AppCard
          icon={Package}
          title={t('forecast.orderTitle')}
          badge={t('forecast.sizes', { count: totals.sizes })}
          contentClassName="p-0"
        >
          <ul className="divide-y">
            {demand.map((group) => {
              const isOpen = open === group.size
              return (
                <li key={group.size}>
                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? null : group.size)}
                    aria-expanded={isOpen}
                    className="flex w-full min-w-0 items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/60"
                  >
                    {isOpen ? (
                      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-mono text-sm font-medium">
                        {group.size}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {group.now.length > 0 &&
                          t('forecast.nowCount', { count: group.now.length })}
                        {group.now.length > 0 && group.next.length > 0 && ' · '}
                        {group.next.length > 0 &&
                          t('forecast.nextCount', { count: group.next.length })}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-lg font-semibold tabular-nums">
                        {group.tires}
                      </span>
                      <span className="block text-[11px] text-muted-foreground">
                        {t('forecast.tiresShort')}
                      </span>
                    </span>
                  </button>

                  {isOpen && (
                    <ul className="divide-y border-t bg-muted/30">
                      {[...group.now, ...group.next].map((row) => (
                        <SetRow key={row.set.id} row={row} depth={depth} />
                      ))}
                    </ul>
                  )}
                </li>
              )
            })}
          </ul>
        </AppCard>
      )}

      {/* Said plainly rather than buried: a buyer who does not know how many
          sets were left out cannot tell whether this list is the whole
          picture or a corner of it. */}
      <div className="flex gap-2.5 rounded-lg border border-dashed p-3">
        <TriangleAlert className="h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 space-y-1 text-xs text-muted-foreground">
          <p>{t('forecast.caveat')}</p>
          {unknown > 0 && <p>{t('forecast.unmeasured', { count: unknown })}</p>}
          {/* A cap nobody is told about reads as "we looked at everything". */}
          {shown < total && <p>{t('forecast.capped', { shown, total })}</p>}
          <DocsLink href="/docs/features/tire-hotel" variant="hint" />
        </div>
      </div>
    </div>
  )
}

function Figure({ label, value, tone }: { label: string; value: number; tone?: 'amber' }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn('text-2xl font-semibold tabular-nums', tone === 'amber' && 'text-amber-600')}
      >
        {value}
      </p>
    </div>
  )
}

function SetRow({
  row,
  depth,
}: {
  row: SetForecast<ForecastRow>
  depth: (mm: number | null) => string
}) {
  const t = useTranslations('tireHotel')
  const { set } = row

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm">
      <Link
        href={`/tire-hotel/${set.id}`}
        className="min-w-0 flex-1 truncate font-medium text-primary hover:underline"
      >
        {set.customer?.name ?? set.reference ?? set.id}
      </Link>
      {set.vehicle?.licensePlate && (
        <span className="shrink-0 font-mono text-xs text-muted-foreground">
          {set.vehicle.licensePlate}
        </span>
      )}
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
        {t('forecast.lowest', { value: depth(row.lowest) })}
      </span>
      {row.verdict === 'now' ? (
        <Badge
          variant="outline"
          className="shrink-0 border-amber-500/20 bg-amber-500/10 text-[10px] text-amber-600"
        >
          {t('forecast.now')}
        </Badge>
      ) : (
        <Badge variant="outline" className="shrink-0 text-[10px]">
          {row.rate !== null ? t('forecast.rate', { value: depth(row.rate) }) : t('forecast.next')}
        </Badge>
      )}
    </li>
  )
}
