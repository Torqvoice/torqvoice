'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import {
  AlertOctagon,
  Check,
  ChevronDown,
  ExternalLink,
  Flame,
  Loader2,
  Plus,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Star,
} from 'lucide-react'
import { AppCard } from '@/components/app-card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  getVehicleSafety,
  type VehicleSafetyView,
} from '@/features/integrations/Actions/vehicleSafetyActions'
import { createFinding } from '@/features/vehicles/Actions/findingActions'
import type { SafetyRecall } from '@/features/integrations/Lib/types'
import { humanizeComponent } from '@/integrations/nhtsa/mapping'
import { useFormatDate } from '@/lib/use-format-date'
import { cn } from '@/lib/utils'

interface VehicleSafetyPanelProps {
  vehicleId: string
  make: string
  model: string
  year: number
  /** Observations already on the vehicle, so a recall added once shows as added. */
  existingFindings?: string[]
}

/**
 * What the safety authority knows about this model year, on the vehicle
 * page: open recalls, what owners complain about most, and the crash
 * rating. Reads the weekly cache, so it is instant for a model the workshop
 * has seen before and a few seconds the first time.
 *
 * Built to be acted on rather than read: a recall becomes an observation on
 * the vehicle with one click, so it reaches the job list and the customer.
 */
export function VehicleSafetyPanel({
  vehicleId,
  make,
  model,
  year,
  existingFindings = [],
}: VehicleSafetyPanelProps) {
  const t = useTranslations('vehicles.safety')
  const router = useRouter()
  const { formatDate } = useFormatDate()
  const [view, setView] = useState<VehicleSafetyView | null | undefined>(undefined)
  const [failed, setFailed] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [showRecalls, setShowRecalls] = useState(true)
  const [showAllComponents, setShowAllComponents] = useState(false)
  const [openComponent, setOpenComponent] = useState<string | null>(null)
  const [added, setAdded] = useState<Set<string>>(() => new Set())
  const [adding, setAdding] = useState<string | null>(null)

  const load = useCallback(
    async (refresh: boolean) => {
      if (refresh) setRefreshing(true)
      try {
        const res = await getVehicleSafety(vehicleId, { refresh })
        if (!res.success) {
          setFailed(true)
          if (refresh) toast.error(res.error || t('errorLoad'))
          return
        }
        setFailed(false)
        setView(res.data ?? null)
        if (refresh) toast.success(t('refreshed'))
      } catch {
        setFailed(true)
        if (refresh) toast.error(t('errorLoad'))
      } finally {
        setRefreshing(false)
      }
    },
    [vehicleId, t]
  )

  useEffect(() => {
    load(false)
  }, [load])

  const report = view?.report ?? null
  const recalls = report?.recalls ?? []
  const openRecalls = recalls.length
  const urgent = recalls.some((r) => r.parkIt || r.parkOutside)
  const modelLabel = report?.matched
    ? `${report.matched.year} ${titleCase(report.matched.make)} ${titleCase(report.matched.model)}`
    : `${year} ${make} ${model}`

  const alreadyAdded = useMemo(() => {
    const set = new Set(added)
    for (const r of recalls) {
      if (existingFindings.some((f) => f.includes(r.campaign))) set.add(r.campaign)
    }
    return set
  }, [added, recalls, existingFindings])

  const addFinding = async (recall: SafetyRecall) => {
    setAdding(recall.campaign)
    try {
      const res = await createFinding({
        vehicleId,
        description: t('findingDescription', {
          campaign: recall.campaign,
          component: humanizeComponent(recall.component),
        }),
        severity: recall.parkIt || recall.parkOutside ? 'urgent' : 'needs_work',
        notes: [recall.summary, recall.remedy ? `${t('remedy')}: ${recall.remedy}` : null]
          .filter(Boolean)
          .join('\n\n'),
      })
      if (!res.success) {
        toast.error(res.error || t('errorLoad'))
        return
      }
      setAdded((s) => new Set(s).add(recall.campaign))
      toast.success(t('findingAdded'))
      router.refresh()
    } finally {
      setAdding(null)
    }
  }

  // The card disappears rather than apologising when the source cannot
  // answer at all: a vehicle without make, model and year has nothing to
  // ask about, and a failed first load is not worth a panel of its own.
  if (view === null || (failed && view === undefined)) return null

  const Icon = openRecalls > 0 ? ShieldAlert : ShieldCheck
  const iconTone = openRecalls > 0 ? (urgent ? 'text-red-600' : 'text-amber-600') : undefined

  return (
    <AppCard
      icon={Icon}
      title={<span className={cn(iconTone)}>{t('title')}</span>}
      badge={openRecalls || undefined}
      description={
        !report
          ? t('loading')
          : !expanded && report.matched
            ? [
                t('summaryRecalls', { count: openRecalls }),
                t('summaryComplaints', { count: report.complaints.total }),
                report.rating?.overall
                  ? t('stars', { count: report.rating.overall })
                  : t('notRated'),
              ].join(' · ')
            : view?.stale
              ? t('stale', { date: formatDate(new Date(view.fetchedAt)) })
              : t('from', {
                  source: view?.source ?? '',
                  model: modelLabel,
                  date: formatDate(new Date(view?.fetchedAt ?? Date.now())),
                })
      }
      action={
        <div className="flex items-center gap-1">
          {report && expanded && (
            <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" asChild>
              <a href={report.url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3.5 w-3.5" />
                {t('openSite', { source: view?.source ?? '' })}
              </a>
            </Button>
          )}
          {expanded && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => load(true)}
                  disabled={refreshing || view === undefined}
                  aria-label={t('refresh')}
                >
                  {refreshing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('refresh')}</TooltipContent>
            </Tooltip>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={() => setExpanded((e) => !e)}
            aria-expanded={expanded}
            disabled={view === undefined}
          >
            {expanded ? t('collapse') : t('expand')}
            <ChevronDown
              className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-180')}
            />
          </Button>
        </div>
      }
      contentClassName="p-0"
    >
      {!expanded ? null : view === undefined ? (
        <div className="grid gap-3 p-4 sm:grid-cols-3">
          <Skeleton className="h-16 rounded-lg" />
          <Skeleton className="h-16 rounded-lg" />
          <Skeleton className="h-16 rounded-lg" />
        </div>
      ) : !report?.matched ? (
        <div className="px-4 py-5 text-sm text-muted-foreground">
          <p>{t('notKnown', { source: view?.source ?? '', model: modelLabel })}</p>
          <p className="mt-1 text-xs">{t('notKnownHint')}</p>
        </div>
      ) : (
        <div className="divide-y">
          {/* Three numbers at a glance. */}
          <div className="grid gap-px bg-border sm:grid-cols-3">
            <Stat
              label={t('recalls')}
              value={openRecalls}
              tone={openRecalls > 0 ? (urgent ? 'danger' : 'warn') : 'good'}
              hint={openRecalls === 0 ? t('recallsNone') : urgent ? t('parkIt') : undefined}
            />
            <Stat
              label={t('complaints')}
              value={report.complaints.total}
              tone={report.complaints.total === 0 ? 'good' : 'neutral'}
              hint={
                report.complaints.total === 0
                  ? t('complaintsNone')
                  : [
                      report.complaints.crashes > 0
                        ? t('crashes', { count: report.complaints.crashes })
                        : null,
                      report.complaints.fires > 0
                        ? t('fires', { count: report.complaints.fires })
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · ') || undefined
              }
            />
            <div className="bg-card px-4 py-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {t('rating')}
              </p>
              {report.rating?.overall ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      className="mt-1 flex items-center gap-1"
                      aria-label={t('stars', { count: report.rating.overall })}
                    >
                      {[1, 2, 3, 4, 5].map((n) => (
                        <Star
                          key={n}
                          className={cn(
                            'h-4 w-4',
                            n <= (report.rating?.overall ?? 0)
                              ? 'fill-amber-400 text-amber-400'
                              : 'text-muted-foreground/30'
                          )}
                        />
                      ))}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs text-xs">
                    <p>{report.rating.description}</p>
                    <p className="mt-1 text-muted-foreground">
                      {[
                        report.rating.frontal ? `${t('frontal')} ${report.rating.frontal}` : null,
                        report.rating.side ? `${t('side')} ${report.rating.side}` : null,
                        report.rating.rollover
                          ? `${t('rollover')} ${report.rating.rollover}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </TooltipContent>
                </Tooltip>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">{t('notRated')}</p>
              )}
              {report.rating?.overall && (
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {report.rating.description}
                </p>
              )}
            </div>
          </div>

          {/* What owners report: the workshop's diagnostic prior. Each bar
              opens the newest complaints in that category, so the number
              can be read as what people actually wrote. */}
          {report.complaints.byComponent.length > 0 && (
            <div className="px-4 py-3">
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <h4 className="text-sm font-medium">{t('ownersReport')}</h4>
                <span className="text-xs text-muted-foreground">
                  {t('ofComplaints', { total: report.complaints.total })}
                </span>
              </div>
              <ul className="space-y-1">
                {(showAllComponents
                  ? report.complaints.byComponent
                  : report.complaints.byComponent.slice(0, 4)
                ).map((g) => {
                  const top = report.complaints.byComponent[0]?.share || 1
                  const open = openComponent === g.component
                  return (
                    <li key={g.component}>
                      <button
                        type="button"
                        className={cn(
                          'grid w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 rounded-md px-1.5 py-1 text-left text-sm hover:bg-muted/50',
                          open && 'bg-muted/50'
                        )}
                        onClick={() => setOpenComponent(open ? null : g.component)}
                        aria-expanded={open}
                      >
                        <div className="min-w-0">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="truncate">{humanizeComponent(g.component)}</span>
                            <span className="shrink-0 tabular-nums text-xs text-muted-foreground">
                              {Math.round(g.share * 100)}%
                            </span>
                          </div>
                          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-primary/70"
                              style={{ width: `${Math.max(4, (g.share / top) * 100)}%` }}
                            />
                          </div>
                        </div>
                        <span className="w-10 text-right tabular-nums text-xs text-muted-foreground">
                          {g.count}
                        </span>
                        <ChevronDown
                          className={cn(
                            'h-3.5 w-3.5 text-muted-foreground transition-transform',
                            open && 'rotate-180'
                          )}
                        />
                      </button>
                      {open && (
                        <div className="mb-2 ml-1.5 mt-1 border-l-2 border-primary/30 pl-3">
                          {g.examples && g.examples.length > 0 ? (
                            <ul className="space-y-2">
                              {g.examples.map((e, i) => (
                                <li key={`${e.date ?? ''}-${i}`} className="text-sm">
                                  <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                                    {e.date && <span>{formatDate(new Date(e.date))}</span>}
                                    {e.crash && (
                                      <Badge
                                        variant="outline"
                                        className="border-red-500/40 text-[10px] text-red-600"
                                      >
                                        {t('crash')}
                                      </Badge>
                                    )}
                                    {e.fire && (
                                      <Badge
                                        variant="outline"
                                        className="border-red-500/40 text-[10px] text-red-600"
                                      >
                                        {t('fire')}
                                      </Badge>
                                    )}
                                  </p>
                                  <p className="mt-0.5 text-muted-foreground">{e.summary}</p>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-xs text-muted-foreground">{t('noExamples')}</p>
                          )}
                          <a
                            href={`${report.url}#complaints`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                          >
                            <ExternalLink className="h-3 w-3" />
                            {t('readAll', { count: g.count, source: view?.source ?? '' })}
                          </a>
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
              {report.complaints.byComponent.length > 4 && (
                <button
                  type="button"
                  className="mt-2 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => setShowAllComponents((s) => !s)}
                >
                  {showAllComponents ? t('less') : t('more')}
                </button>
              )}
            </div>
          )}

          {/* Recalls, each one click from the job list. */}
          {openRecalls > 0 && (
            <div>
              <button
                type="button"
                className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm font-medium hover:bg-muted/40"
                onClick={() => setShowRecalls((s) => !s)}
                aria-expanded={showRecalls}
              >
                <span className="flex items-center gap-2">
                  <AlertOctagon
                    className={cn('h-4 w-4', urgent ? 'text-red-600' : 'text-amber-600')}
                  />
                  {showRecalls ? t('hideRecalls') : t('showRecalls', { count: openRecalls })}
                </span>
                <ChevronDown
                  className={cn(
                    'h-4 w-4 text-muted-foreground transition-transform',
                    showRecalls && 'rotate-180'
                  )}
                />
              </button>
              {showRecalls && (
                <ul className="divide-y border-t">
                  {recalls.map((r) => (
                    <RecallRow
                      key={r.campaign}
                      recall={r}
                      added={alreadyAdded.has(r.campaign)}
                      adding={adding === r.campaign}
                      onAdd={() => addFinding(r)}
                      formatDate={formatDate}
                      t={t}
                    />
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </AppCard>
  )
}

function Stat({
  label,
  value,
  tone,
  hint,
}: {
  label: string
  value: number
  tone: 'good' | 'warn' | 'danger' | 'neutral'
  hint?: string
}) {
  const color =
    tone === 'danger'
      ? 'text-red-600'
      : tone === 'warn'
        ? 'text-amber-600'
        : tone === 'good'
          ? 'text-emerald-600'
          : ''
  return (
    <div className="bg-card px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className={cn('mt-0.5 text-2xl font-semibold tabular-nums leading-tight', color)}>
        {value.toLocaleString()}
      </p>
      {hint && <p className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

function RecallRow({
  recall,
  added,
  adding,
  onAdd,
  formatDate,
  t,
}: {
  recall: SafetyRecall
  added: boolean
  adding: boolean
  onAdd: () => void
  formatDate: (d: Date) => string
  t: ReturnType<typeof useTranslations<'vehicles.safety'>>
}) {
  const [open, setOpen] = useState(false)
  const flagged = recall.parkIt || recall.parkOutside
  return (
    <li className="px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="text-sm font-medium">{humanizeComponent(recall.component)}</p>
            {recall.parkIt && (
              <Badge variant="destructive" className="gap-1 text-[10px]">
                <AlertOctagon className="h-3 w-3" />
                {t('parkIt')}
              </Badge>
            )}
            {recall.parkOutside && (
              <Badge variant="destructive" className="gap-1 text-[10px]">
                <Flame className="h-3 w-3" />
                {t('parkOutside')}
              </Badge>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {[
              recall.reported ? formatDate(new Date(recall.reported)) : null,
              recall.campaign,
              recall.manufacturer,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <Button
          variant={added ? 'ghost' : 'outline'}
          size="sm"
          className="h-7 shrink-0 gap-1.5 text-xs"
          onClick={onAdd}
          disabled={added || adding}
        >
          {adding ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : added ? (
            <Check className="h-3.5 w-3.5 text-emerald-600" />
          ) : (
            <Plus className="h-3.5 w-3.5" />
          )}
          {added ? t('findingAdded') : t('addFinding')}
        </Button>
      </div>
      <p className={cn('mt-2 text-sm text-muted-foreground', !open && 'line-clamp-2')}>
        {recall.summary}
      </p>
      {open && (
        <div className="mt-2 space-y-2 text-sm">
          {recall.consequence && (
            <p>
              <span className={cn('font-medium', flagged && 'text-red-600')}>
                {t('consequence')}:{' '}
              </span>
              <span className="text-muted-foreground">{recall.consequence}</span>
            </p>
          )}
          {recall.remedy && (
            <p>
              <span className="font-medium">{t('remedy')}: </span>
              <span className="text-muted-foreground">{recall.remedy}</span>
            </p>
          )}
        </div>
      )}
      <button
        type="button"
        className="mt-1 text-xs text-muted-foreground hover:text-foreground"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? t('less') : t('more')}
      </button>
    </li>
  )
}

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split(/(\s+|-)/)
    .map((w) =>
      w.length <= 3 && /^[a-z0-9]+$/.test(w)
        ? w.toUpperCase()
        : w.charAt(0).toUpperCase() + w.slice(1)
    )
    .join('')
}
