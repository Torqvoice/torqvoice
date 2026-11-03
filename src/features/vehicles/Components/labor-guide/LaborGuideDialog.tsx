'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import Image from 'next/image'
import Link from 'next/link'
import {
  AlertCircle,
  BookOpen,
  CarFront,
  Droplets,
  Info,
  Loader2,
  RotateCw,
  Settings2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  getRepairData,
  unlockRepairDataItem,
} from '@/features/integrations/Actions/repairDataActions'
import type { FluidPartLine } from '@/features/integrations/Lib/fluid-stock'
import type { FluidSpec, LaborTime, RepairDataVariantRef } from '@/features/integrations/Lib/types'
import { cn } from '@/lib/utils'
import type { LaborGuideStock } from './FluidPartButton'
import { type FluidsView, FluidSpecsPanel } from './FluidSpecsPanel'
import { ConfidenceLegend, GuideMessage, useRegionName } from './guide-parts'
import { type LaborView, LaborTimesPanel } from './LaborTimesPanel'

type Kind = 'labor' | 'fluids'

type Load<V> =
  | { status: 'loading' }
  | { status: 'none' }
  | { status: 'failed'; message: string }
  | { status: 'found'; view: V }

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
  /** Adds a fluid as a part line. Without it the fluid cards are for reading only. */
  onAddPart?: (line: FluidPartLine) => void
  /** The workshop's stock, offered when it carries a fluid's grade or spec. */
  stock?: LaborGuideStock
}

/** The list with one item replaced by its unlocked value. */
function withItem<V extends { items: { id: string }[] }, T extends { id: string }>(
  state: Load<V>,
  value: T
): Load<V> {
  if (state.status !== 'found') return state
  return {
    status: 'found',
    view: { ...state.view, items: state.view.items.map((i) => (i.id === value.id ? value : i)) },
  }
}

/**
 * The list without a value the workshop's minimum confidence leaves out,
 * counted with the others it hides.
 */
function withoutItem<V extends { items: { id: string }[]; hidden: number }>(
  state: Load<V>,
  id: string
): Load<V> {
  if (state.status !== 'found') return state
  const items = state.view.items.filter((i) => i.id !== id)
  if (items.length === state.view.items.length) return state
  return { status: 'found', view: { ...state.view, items, hidden: state.view.hidden + 1 } }
}

/** How long a lookup runs before the dialog says it is still at it. */
const SLOW_AFTER_MS = 6000

/**
 * The shape of the list while it loads, so nothing jumps when it arrives.
 * A vehicle the source has little data for can take it half a minute to
 * answer, so after a few seconds a line says the lookup is still going.
 */
function LoadingState({
  kind,
  label,
  slowLabel,
}: {
  kind: Kind
  label: string
  slowLabel: string
}) {
  const rows = [68, 52, 74, 46, 60, 70, 40, 56, 64]
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), SLOW_AFTER_MS)
    return () => clearTimeout(timer)
  }, [])
  return (
    <div className="flex h-full min-h-0 flex-col" aria-busy>
      <span className="sr-only" role="status">
        {slow ? slowLabel : label}
      </span>
      {slow && (
        <div className="flex items-center gap-2 border-b bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground sm:px-6">
          <Loader2 className="size-3.5 shrink-0 animate-spin" />
          {slowLabel}
        </div>
      )}
      <div className="grid min-h-0 flex-1 md:grid-cols-[13.5rem_minmax(0,1fr)]">
        {kind === 'labor' && (
          <div className="hidden space-y-2 border-r bg-muted/20 p-3 md:block">
            {[80, 64, 72, 56, 68, 60, 76, 52].map((w, i) => (
              <Skeleton key={i} className="h-6" style={{ width: `${w}%` }} />
            ))}
          </div>
        )}
        <div className={cn('min-h-0', kind === 'fluids' && 'md:col-span-2')}>
          {kind === 'labor' ? (
            <>
              <div className="border-b px-4 py-3 sm:px-5">
                <Skeleton className="h-10 w-full" />
              </div>
              <div className="divide-y">
                {rows.map((w, i) => (
                  <div key={i} className="flex items-center gap-4 px-4 py-3 sm:px-5">
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3.5" style={{ width: `${w}%` }} />
                      <Skeleton className="h-3 w-20" />
                    </div>
                    <Skeleton className="h-4 w-12" />
                    <Skeleton className="size-8 rounded-full" />
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="space-y-3 rounded-xl border p-4">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-7 w-24" />
                  <Skeleton className="h-5 w-40" />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * The labor guide for one vehicle: book times to add as labor lines, and
 * fluid capacities to read, for the engine the guide picks or the person
 * chooses. A key that lists everything but unlocks values one at a time gets
 * a button per row that asks for that one value.
 */
export function LaborGuideDialog({
  open,
  onOpenChange,
  vehicleId,
  vehicleLabel,
  available,
  onAdd,
  onAddPart,
  stock,
}: LaborGuideDialogProps) {
  const t = useTranslations('service.laborGuide')
  const both = available.labor && available.fluids
  const [tab, setTab] = useState<Kind>(available.labor ? 'labor' : 'fluids')
  const [labor, setLabor] = useState<Load<LaborView>>({ status: 'loading' })
  const [fluids, setFluids] = useState<Load<FluidsView>>({ status: 'loading' })
  const [unlocking, setUnlocking] = useState<Set<string>>(new Set())
  const [unlockError, setUnlockError] = useState<string | null>(null)
  const [added, setAdded] = useState<Set<string>>(new Set())
  const [addedParts, setAddedParts] = useState<Set<string>>(new Set())

  const load = useCallback(
    async (kind: Kind, variant?: RepairDataVariantRef) => {
      const set = (kind === 'labor' ? setLabor : setFluids) as (next: Load<unknown>) => void
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
    [vehicleId, t]
  )

  // Each tab asks once, the first time it is shown. Remembered in a ref, not
  // read from state, so a second run of the effect (React's development
  // check) cannot spend another call.
  const asked = useRef(new Set<Kind>())
  useEffect(() => {
    if (!open || asked.current.has(tab)) return
    asked.current.add(tab)
    void load(tab)
  }, [open, tab, load])

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
    // Below the workshop's minimum confidence once shown: the row goes, and
    // the line above the list counts it with the others the setting hides.
    if (outcome?.status === 'hidden') {
      if (kind === 'labor') setLabor((prev) => withoutItem(prev, item))
      return
    }
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

  const current = tab === 'labor' ? labor : fluids
  const view = current.status === 'found' ? current.view : null
  const anyView =
    (labor.status === 'found' && labor.view) || (fluids.status === 'found' && fluids.view) || null
  const region = useRegionName(anyView?.region ?? null)
  const settingsHref = `/settings/integrations/${anyView?.connector ?? ''}`
  const anyLocked =
    (labor.status === 'found' && labor.view.items.some((i) => i.locked)) ||
    (fluids.status === 'found' && fluids.view.items.some((i) => i.locked))

  const unlockingOf = (kind: Kind) =>
    new Set(
      [...unlocking].filter((k) => k.startsWith(`${kind}:`)).map((k) => k.slice(kind.length + 1))
    )

  const body = (kind: Kind) => {
    const state = kind === 'labor' ? labor : fluids
    if (state.status === 'loading')
      return <LoadingState kind={kind} label={t('loading')} slowLabel={t('stillLooking')} />
    if (state.status === 'none')
      return kind === 'labor' ? (
        <GuideMessage icon={CarFront} title={t('notFoundTitle')}>
          {t('notFound')}
        </GuideMessage>
      ) : (
        <GuideMessage icon={Droplets} title={t('fluidsNotFoundTitle')}>
          {t('fluidsNotFound')}
        </GuideMessage>
      )
    if (state.status === 'failed')
      return (
        <GuideMessage
          icon={AlertCircle}
          tone="destructive"
          title={t('failedTitle')}
          action={
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                if (kind === 'labor') setAdded(new Set())
                void load(kind)
              }}
            >
              <RotateCw className="size-3.5" />
              {t('retry')}
            </Button>
          }
        >
          {state.message}
        </GuideMessage>
      )
    if (kind === 'labor' && labor.status === 'found')
      return (
        <LaborTimesPanel
          view={labor.view}
          settingsHref={settingsHref}
          added={added}
          unlocking={unlockingOf('labor')}
          onAdd={(job, hours) => {
            onAdd({ description: job.name, hours })
            setAdded((prev) => new Set(prev).add(job.id))
          }}
          onUnlock={(job) =>
            void unlock('labor', labor.view.variants[labor.view.selected].ref, job.id)
          }
        />
      )
    if (kind === 'fluids' && fluids.status === 'found')
      return (
        <FluidSpecsPanel
          view={fluids.view}
          settingsHref={settingsHref}
          unlocking={unlockingOf('fluids')}
          onUnlock={(spec) =>
            void unlock('fluids', fluids.view.variants[fluids.view.selected].ref, spec.id)
          }
          stock={stock}
          addedParts={addedParts}
          onAddPart={
            onAddPart
              ? (spec, line) => {
                  onAddPart(line)
                  setAddedParts((prev) => new Set(prev).add(spec.id))
                }
              : undefined
          }
        />
      )
    return null
  }

  const count = (state: Load<{ items: unknown[] }>) =>
    state.status === 'found' ? (
      <span className="ml-1.5 rounded-full bg-muted px-1.5 py-px text-[10px] font-medium tabular-nums text-muted-foreground group-data-[state=active]:bg-primary/10 group-data-[state=active]:text-primary">
        {state.view.items.length}
      </span>
    ) : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(46rem,92dvh)] max-h-[92dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as Kind)}
          className="flex min-h-0 flex-1 flex-col gap-0"
        >
          <div className="border-b px-4 pt-5 pb-4 sm:px-6">
            <div className="flex items-center gap-3 pr-8">
              {anyView?.logo ? (
                <Image
                  src={anyView.logo}
                  alt=""
                  width={40}
                  height={40}
                  className="size-10 shrink-0 rounded-xl"
                  unoptimized
                />
              ) : (
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border bg-muted/40">
                  <BookOpen className="size-5 text-muted-foreground" />
                </div>
              )}
              <div className="min-w-0">
                <DialogTitle className="text-base leading-tight">{t('title')}</DialogTitle>
                <DialogDescription className="mt-0.5 truncate">
                  {vehicleLabel || t('description')}
                </DialogDescription>
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              {both ? (
                <TabsList>
                  <TabsTrigger value="labor" className="group px-3">
                    {t('tabLabor')}
                    {count(labor)}
                  </TabsTrigger>
                  <TabsTrigger value="fluids" className="group px-3">
                    {t('tabFluids')}
                    {count(fluids)}
                  </TabsTrigger>
                </TabsList>
              ) : (
                <span />
              )}
              {view && view.variants.length > 1 && (
                <Select
                  value={String(view.selected)}
                  onValueChange={(v) => {
                    if (tab === 'labor') setAdded(new Set())
                    else setAddedParts(new Set())
                    void load(tab, view.variants[Number(v)].ref)
                  }}
                >
                  <SelectTrigger
                    aria-label={t('engine')}
                    className="h-9 w-full gap-2 sm:w-auto sm:min-w-64 sm:max-w-80"
                  >
                    <span className="shrink-0 text-xs text-muted-foreground">{t('engine')}</span>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent align="end">
                    {view.variants.map((v, i) => (
                      <SelectItem
                        key={`${v.ref.engineId}-${v.ref.drivetrain}-${i}`}
                        value={String(i)}
                      >
                        {v.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          {/* Both stay mounted, so a search or category survives a look at the other tab. */}
          <TabsContent value="labor" forceMount className="min-h-0 flex-1">
            {available.labor && (tab === 'labor' || labor.status !== 'loading') && body('labor')}
          </TabsContent>
          <TabsContent value="fluids" forceMount className="min-h-0 flex-1">
            {available.fluids &&
              (tab === 'fluids' || fluids.status !== 'loading') &&
              body('fluids')}
          </TabsContent>
        </Tabs>

        {unlockError && (
          <p
            role="alert"
            className="border-t bg-destructive/5 px-4 py-2 text-xs text-destructive sm:px-6"
          >
            {unlockError}
          </p>
        )}

        <footer className="flex flex-col gap-3 border-t bg-muted/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {anyView && (
              <span className="truncate">
                {t('attribution', { source: anyView.source })}
                {region && <> · {t('market', { region })}</>}
              </span>
            )}
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 font-medium text-foreground/80 underline-offset-4 hover:text-foreground hover:underline"
                >
                  <Info className="size-3.5" />
                  {t('about')}
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-80 space-y-3">
                <p className="text-sm font-medium">{t('aboutTitle')}</p>
                <ConfidenceLegend />
                <p className="border-t pt-3 text-xs text-muted-foreground">{t('estimateNote')}</p>
                {anyLocked && <p className="text-xs text-muted-foreground">{t('lockedNote')}</p>}
              </PopoverContent>
            </Popover>
            {anyView && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link
                    href={settingsHref}
                    aria-label={t('settings')}
                    className="inline-flex size-6 items-center justify-center rounded-md hover:bg-muted hover:text-foreground"
                  >
                    <Settings2 className="size-3.5" />
                  </Link>
                </TooltipTrigger>
                <TooltipContent>{t('settings')}</TooltipContent>
              </Tooltip>
            )}
          </div>
          <div className="flex items-center justify-end gap-3">
            {(added.size > 0 || addedParts.size > 0) && (
              <span className="text-xs text-muted-foreground" aria-live="polite">
                {[
                  added.size > 0 ? t('addedCount', { count: added.size }) : null,
                  addedParts.size > 0 ? t('partsAddedCount', { count: addedParts.size }) : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            )}
            <Button type="button" size="sm" onClick={() => onOpenChange(false)}>
              {t('done')}
            </Button>
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  )
}
