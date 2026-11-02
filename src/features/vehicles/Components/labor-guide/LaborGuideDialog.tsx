'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { Check, Loader2, Lock, Plus, Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  getRepairData,
  type RepairDataView,
  unlockRepairDataItem,
} from '@/features/integrations/Actions/repairDataActions'
import type {
  FluidSpec,
  LaborTime,
  RepairDataConfidence,
  RepairDataVariantRef,
} from '@/features/integrations/Lib/types'
import { cn } from '@/lib/utils'

type Kind = 'labor' | 'fluids'

type Load<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'none' }
  | { status: 'failed'; message: string }
  | { status: 'found'; view: Omit<RepairDataView<Kind>, 'items'> & { items: T[] } }

export interface LaborGuideJob {
  description: string
  hours: number
}

interface LaborGuideDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  vehicleId: string
  /** "2018 Ford F-150", under the title. */
  vehicleLabel?: string
  available: Record<Kind, boolean>
  onAdd: (job: LaborGuideJob) => void
}

/** "fuel-system" as "Fuel system", "hvac" as "HVAC". The source's own words, in English. */
function categoryLabel(category: string): string {
  if (category.length <= 4 && !category.includes('-')) return category.toUpperCase()
  const words = category.replace(/[-_]+/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** The list with one item replaced by its unlocked value. */
function withItem<T extends { id: string }>(state: Load<T>, value: T): Load<T> {
  if (state.status !== 'found') return state
  return {
    status: 'found',
    view: { ...state.view, items: state.view.items.map((i) => (i.id === value.id ? value : i)) },
  }
}

const CONFIDENCE_CLASS: Record<RepairDataConfidence, string> = {
  oem: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  high: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  medium: 'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400',
  estimated: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400',
}

function ConfidenceBadge({ confidence }: { confidence: RepairDataConfidence | null }) {
  const t = useTranslations('service.laborGuide.confidence')
  if (!confidence) return null
  return (
    <Badge
      variant="outline"
      className={CONFIDENCE_CLASS[confidence]}
      title={t(`${confidence}Help`)}
    >
      {t(confidence)}
    </Badge>
  )
}

/**
 * The labor guide for one vehicle: book times to add as labor lines, and
 * fluid capacities to read. A key that lists everything but unlocks values
 * one at a time gets a button per row that asks for that one value.
 */
export function LaborGuideDialog({
  open,
  onOpenChange,
  vehicleId,
  vehicleLabel,
  available,
  onAdd,
}: LaborGuideDialogProps) {
  const t = useTranslations('service.laborGuide')
  const format = useFormatter()
  const [tab, setTab] = useState<Kind>(available.labor ? 'labor' : 'fluids')
  const [labor, setLabor] = useState<Load<LaborTime>>({ status: 'idle' })
  const [fluids, setFluids] = useState<Load<FluidSpec>>({ status: 'idle' })
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [hideEstimates, setHideEstimates] = useState(false)
  const [unlocking, setUnlocking] = useState<Set<string>>(new Set())
  const [unlockError, setUnlockError] = useState<string | null>(null)
  const [added, setAdded] = useState<Set<string>>(new Set())

  const setterFor = useCallback(
    (kind: Kind) =>
      (kind === 'labor' ? setLabor : setFluids) as (next: Load<LaborTime | FluidSpec>) => void,
    []
  )

  const load = useCallback(
    async (kind: Kind, variant?: RepairDataVariantRef) => {
      const set = setterFor(kind)
      set({ status: 'loading' })
      const res = await getRepairData({ vehicleId, kind, variant })
      if (!res.success || !res.data) {
        set({ status: 'failed', message: res.error ?? t('failed') })
        return
      }
      const outcome = res.data
      if (outcome.status === 'found') set({ status: 'found', view: outcome.value })
      else if (outcome.status === 'none') set({ status: 'none' })
      else set({ status: 'failed', message: outcome.message })
    },
    [vehicleId, setterFor, t]
  )

  // Each tab asks once, the first time it is shown. Remembered in a ref, not
  // read from state, so a second run of the effect (React's development
  // check) cannot spend another of a free key's ten daily calls.
  const asked = useRef(new Set<Kind>())
  useEffect(() => {
    if (!open || asked.current.has(tab)) return
    asked.current.add(tab)
    void load(tab)
  }, [open, tab, load])

  const pickVariant = (kind: Kind, ref: RepairDataVariantRef) => {
    if (kind === 'labor') setAdded(new Set())
    void load(kind, ref)
  }

  const reset = () => {
    setSearch('')
    setCategory('all')
    setUnlockError(null)
    setAdded(new Set())
  }

  const unlock = async (kind: Kind, variant: RepairDataVariantRef, item: string) => {
    setUnlocking((prev) => new Set(prev).add(`${kind}:${item}`))
    setUnlockError(null)
    const res = await unlockRepairDataItem({ vehicleId, kind, variant, item })
    setUnlocking((prev) => {
      const next = new Set(prev)
      next.delete(`${kind}:${item}`)
      return next
    })
    const outcome = res.success ? res.data : null
    if (!outcome || outcome.status !== 'found') {
      setUnlockError(
        outcome?.status === 'failed' ? outcome.message : (res.error ?? t('unlockFailed'))
      )
      return
    }
    // From the latest state, so two values asked for at once both land.
    const value = outcome.value
    if (kind === 'labor') setLabor((prev) => withItem(prev, value as LaborTime))
    else setFluids((prev) => withItem(prev, value as FluidSpec))
  }

  const laborView = labor.status === 'found' ? labor.view : null
  const categories = useMemo(
    () => (laborView ? [...new Set(laborView.items.map((i) => i.category))].sort() : []),
    [laborView]
  )
  const jobs = useMemo(() => {
    if (!laborView) return []
    const q = search.trim().toLowerCase()
    return laborView.items
      .filter((j) => category === 'all' || j.category === category)
      .filter((j) => !q || j.name.toLowerCase().includes(q) || j.category.includes(q))
      .filter((j) => !hideEstimates || j.confidence !== 'estimated')
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [laborView, search, category, hideEstimates])

  const hours = (n: number) => format.number(n, { maximumFractionDigits: 2 })

  const addJob = (job: LaborTime) => {
    if (job.hours === null) return
    onAdd({ description: job.name, hours: job.hours })
    setAdded((prev) => new Set(prev).add(job.id))
  }

  const variantPicker = (kind: Kind, state: Load<LaborTime | FluidSpec>) => {
    if (state.status !== 'found' || state.view.variants.length < 2) return null
    const { view } = state
    return (
      <div className="flex items-center gap-2">
        <Label className="shrink-0 text-xs text-muted-foreground">{t('engine')}</Label>
        <Select
          value={String(view.selected)}
          onValueChange={(v) => pickVariant(kind, view.variants[Number(v)].ref)}
        >
          <SelectTrigger className="h-8 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {view.variants.map((v, i) => (
              <SelectItem key={`${v.ref.engineId}-${v.ref.drivetrain}-${i}`} value={String(i)}>
                {v.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    )
  }

  const status = (state: Load<unknown>) => {
    if (state.status === 'loading' || state.status === 'idle')
      return (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {t('loading')}
        </div>
      )
    if (state.status === 'none')
      return <p className="py-10 text-center text-sm text-muted-foreground">{t('notFound')}</p>
    if (state.status === 'failed')
      return (
        <div className="space-y-3 py-8 text-center">
          <p className="text-sm text-destructive">{state.message}</p>
          <Button type="button" size="sm" variant="outline" onClick={() => void load(tab)}>
            {t('retry')}
          </Button>
        </div>
      )
    return null
  }

  const source = laborView?.source ?? (fluids.status === 'found' ? fluids.view.source : null)
  const anyLocked =
    (laborView?.items.some((i) => i.locked) ?? false) ||
    (fluids.status === 'found' && fluids.view.items.some((i) => i.locked))

  const laborTab = (
    <div className="space-y-3">
      {status(labor)}
      {laborView && (
        <>
          {variantPicker('labor', labor)}
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t('search')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="sm:w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('allCategories')}</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>
                    {categoryLabel(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Switch checked={hideEstimates} onCheckedChange={setHideEstimates} />
            {t('hideEstimates')}
          </label>
          <div className="max-h-[50vh] space-y-0.5 overflow-y-auto">
            {jobs.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">{t('noMatch')}</p>
            )}
            {jobs.map((job) => {
              const busy = unlocking.has(`labor:${job.id}`)
              const isAdded = added.has(job.id)
              const variant = laborView.variants[laborView.selected].ref
              return (
                <div
                  key={job.id}
                  className="flex items-center gap-3 rounded-md px-2.5 py-2 hover:bg-accent"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{job.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {categoryLabel(job.category)}
                    </div>
                  </div>
                  {job.locked ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void unlock('labor', variant, job.id)}
                    >
                      {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Lock />}
                      {t('showHours')}
                    </Button>
                  ) : (
                    <>
                      <ConfidenceBadge confidence={job.confidence} />
                      <div className="w-20 shrink-0 text-right">
                        <div className="text-sm font-medium tabular-nums">
                          {t('hours', { hours: hours(job.hours ?? 0) })}
                        </div>
                        {job.low !== null && job.high !== null && job.low !== job.high && (
                          <div className="text-xs tabular-nums text-muted-foreground">
                            {t('range', { low: hours(job.low), high: hours(job.high) })}
                          </div>
                        )}
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant={isAdded ? 'ghost' : 'outline'}
                        onClick={() => addJob(job)}
                        aria-label={t('addJob', { job: job.name })}
                      >
                        {isAdded ? <Check /> : <Plus />}
                        {isAdded ? t('added') : t('add')}
                      </Button>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )

  const fluidsView = fluids.status === 'found' ? fluids.view : null
  const volume = (liters: number | null, quarts: number | null) => {
    const parts = []
    if (liters !== null) parts.push(t('liters', { value: hours(liters) }))
    if (quarts !== null) parts.push(t('quarts', { value: hours(quarts) }))
    return parts.join(' / ')
  }
  const fluidsTab = (
    <div className="space-y-3">
      {status(fluids)}
      {fluidsView && (
        <>
          {variantPicker('fluids', fluids)}
          <div className="max-h-[50vh] space-y-1 overflow-y-auto">
            {fluidsView.items.map((f) => {
              const busy = unlocking.has(`fluids:${f.id}`)
              const variant = fluidsView.variants[fluidsView.selected].ref
              const capacity = volume(f.capacityLiters, f.capacityQuarts)
              const drain = volume(f.drainRefillLiters, f.drainRefillQuarts)
              return (
                <div key={f.id} className="rounded-md border px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium">{f.system}</span>
                    {f.locked ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => void unlock('fluids', variant, f.id)}
                      >
                        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Lock />}
                        {t('show')}
                      </Button>
                    ) : (
                      <ConfidenceBadge confidence={f.confidence} />
                    )}
                  </div>
                  {!f.locked && (
                    <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
                      {(f.fluid || f.spec) && (
                        <>
                          <dt className="text-muted-foreground">{t('fluid')}</dt>
                          <dd>{[f.fluid, f.spec].filter(Boolean).join(', ')}</dd>
                        </>
                      )}
                      {capacity && (
                        <>
                          <dt className="text-muted-foreground">{t('capacity')}</dt>
                          <dd className="tabular-nums">{capacity}</dd>
                        </>
                      )}
                      {drain && drain !== capacity && (
                        <>
                          <dt className="text-muted-foreground">{t('drainRefill')}</dt>
                          <dd className="tabular-nums">{drain}</dd>
                        </>
                      )}
                      {(f.intervalKm !== null || f.intervalMiles !== null) && (
                        <>
                          <dt className="text-muted-foreground">{t('interval')}</dt>
                          <dd className="tabular-nums">
                            {[
                              f.intervalKm !== null
                                ? t('km', { value: hours(f.intervalKm) })
                                : null,
                              f.intervalMiles !== null
                                ? t('miles', { value: hours(f.intervalMiles) })
                                : null,
                            ]
                              .filter(Boolean)
                              .join(' / ')}
                          </dd>
                        </>
                      )}
                      {f.notes && (
                        <>
                          <dt className="text-muted-foreground">{t('notes')}</dt>
                          <dd>{f.notes}</dd>
                        </>
                      )}
                    </dl>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v)
        if (!v) reset()
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{vehicleLabel || t('description')}</DialogDescription>
        </DialogHeader>

        {available.labor && available.fluids ? (
          <Tabs value={tab} onValueChange={(v) => setTab(v as Kind)}>
            <TabsList>
              <TabsTrigger value="labor">{t('tabLabor')}</TabsTrigger>
              <TabsTrigger value="fluids">{t('tabFluids')}</TabsTrigger>
            </TabsList>
            <TabsContent value="labor">{laborTab}</TabsContent>
            <TabsContent value="fluids">{fluidsTab}</TabsContent>
          </Tabs>
        ) : available.labor ? (
          laborTab
        ) : (
          fluidsTab
        )}

        {unlockError && <p className="text-xs text-destructive">{unlockError}</p>}

        {source && (
          <div className={cn('space-y-1 border-t pt-3 text-xs text-muted-foreground')}>
            <p>{t('attribution', { source })}</p>
            <p>{t('estimateNote')}</p>
            {anyLocked && <p>{t('lockedNote')}</p>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
