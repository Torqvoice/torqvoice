'use client'

import { useEffect, useState } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { Check, Copy, Droplets, Loader2, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { RepairDataView } from '@/features/integrations/Actions/repairDataActions'
import type { FluidPartLine } from '@/features/integrations/Lib/fluid-stock'
import type { FluidUnits } from '@/features/integrations/Lib/repair-prefs'
import type { FluidSpec } from '@/features/integrations/Lib/types'
import { FluidPartButton, type LaborGuideStock } from './FluidPartButton'
import { ConfidenceMark, GuideMessage, GuideNotices } from './guide-parts'

export type FluidsView = Omit<RepairDataView<'fluids'>, 'items'> & { items: FluidSpec[] }

interface FluidSpecsPanelProps {
  view: FluidsView
  settingsHref: string
  unlocking: ReadonlySet<string>
  onUnlock: (spec: FluidSpec) => void
  /** Adds a fluid as a part line; without it the cards are for reading only. */
  onAddPart?: (spec: FluidSpec, line: FluidPartLine) => void
  /** Fluids already added from this dialog. */
  addedParts?: ReadonlySet<string>
  stock?: LaborGuideStock
}

/** The figure to lead with and the one beside it, in the units the workshop chose. */
function inUnits(
  metric: string | null,
  us: string | null,
  units: FluidUnits
): { lead: string | null; aside: string | null } {
  if (units === 'metric') return { lead: metric ?? us, aside: null }
  if (units === 'us') return { lead: us ?? metric, aside: null }
  return metric ? { lead: metric, aside: us } : { lead: us, aside: null }
}

/**
 * What each system takes for one engine: a card per system with the
 * capacity up front, the fluid and its spec, and how often it is changed.
 */
export function FluidSpecsPanel({
  view,
  settingsHref,
  unlocking,
  onUnlock,
  onAddPart,
  addedParts,
  stock,
}: FluidSpecsPanelProps) {
  const t = useTranslations('service.laborGuide')
  const format = useFormatter()
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(null), 1500)
    return () => clearTimeout(timer)
  }, [copied])

  const num = (n: number) => format.number(n, { maximumFractionDigits: 2 })
  const volume = (liters: number | null, quarts: number | null) =>
    inUnits(
      liters !== null ? t('liters', { value: num(liters) }) : null,
      quarts !== null ? t('quarts', { value: num(quarts) }) : null,
      view.prefs.units
    )
  const distance = (km: number | null, miles: number | null) =>
    inUnits(
      km !== null ? t('km', { value: num(km) }) : null,
      miles !== null ? t('miles', { value: num(miles) }) : null,
      view.prefs.units
    )
  const joined = (v: { lead: string | null; aside: string | null }) =>
    [v.lead, v.aside].filter(Boolean).join(' / ')

  const copy = (id: string, spec: string) => {
    void navigator.clipboard?.writeText(spec).then(() => setCopied(id))
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <GuideNotices
        view={{ match: view.match, hidden: 0 }}
        multipleEngines={view.variants.length > 1}
        settingsHref={settingsHref}
      />
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {view.items.length === 0 ? (
          <GuideMessage icon={Droplets} title={t('noFluids')} />
        ) : (
          <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
            {view.items.map((f) => {
              const busy = unlocking.has(f.id)
              const capacity = volume(f.capacityLiters, f.capacityQuarts)
              const drain = volume(f.drainRefillLiters, f.drainRefillQuarts)
              const interval = distance(f.intervalKm, f.intervalMiles)
              const showDrain = drain.lead && joined(drain) !== joined(capacity)
              return (
                <article key={f.id} className="flex flex-col rounded-xl border bg-card p-4">
                  <header className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold">{f.system}</h3>
                      {!f.locked && f.fluid && (
                        <p className="mt-0.5 text-xs text-muted-foreground">{f.fluid}</p>
                      )}
                    </div>
                    {!f.locked && <ConfidenceMark confidence={f.confidence} className="shrink-0" />}
                  </header>

                  {f.locked ? (
                    <div className="mt-4 flex flex-1 items-center justify-between gap-3 rounded-lg border border-dashed px-3 py-3">
                      <span className="text-xs text-muted-foreground">{t('lockedValue')}</span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => onUnlock(f)}
                        className="h-7 gap-1.5 text-xs"
                      >
                        {busy ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Lock className="size-3.5" />
                        )}
                        {t('show')}
                      </Button>
                    </div>
                  ) : (
                    <>
                      {capacity.lead && (
                        <div className="mt-4">
                          <p className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
                            {t('capacity')}
                          </p>
                          <p className="mt-0.5 flex items-baseline gap-2">
                            <span className="text-2xl font-semibold tracking-tight tabular-nums">
                              {capacity.lead}
                            </span>
                            {capacity.aside && (
                              <span className="text-sm tabular-nums text-muted-foreground">
                                {capacity.aside}
                              </span>
                            )}
                          </p>
                        </div>
                      )}

                      {f.spec && (
                        <button
                          type="button"
                          onClick={() => copy(f.id, f.spec ?? '')}
                          aria-label={t('copySpec', { spec: f.spec })}
                          className="group mt-3 inline-flex max-w-full items-center gap-2 self-start rounded-md bg-muted px-2 py-1 text-left font-mono text-xs transition-colors hover:bg-muted/70"
                        >
                          <span className="truncate">{f.spec}</span>
                          {copied === f.id ? (
                            <Check className="size-3 shrink-0 text-emerald-600 dark:text-emerald-400" />
                          ) : (
                            <Copy className="size-3 shrink-0 text-muted-foreground opacity-60 group-hover:opacity-100" />
                          )}
                        </button>
                      )}

                      {(showDrain || interval.lead) && (
                        <dl className="mt-4 grid grid-cols-2 gap-3 border-t pt-3 text-xs">
                          {showDrain && (
                            <div>
                              <dt className="text-muted-foreground">{t('drainRefill')}</dt>
                              <dd className="mt-0.5 font-medium tabular-nums">{joined(drain)}</dd>
                            </div>
                          )}
                          {interval.lead && (
                            <div>
                              <dt className="text-muted-foreground">{t('interval')}</dt>
                              <dd className="mt-0.5 font-medium tabular-nums">
                                {joined(interval)}
                              </dd>
                            </div>
                          )}
                        </dl>
                      )}

                      {f.notes && (
                        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                          {f.notes}
                        </p>
                      )}

                      {onAddPart && (
                        <div className="mt-auto pt-4">
                          <FluidPartButton
                            fluid={f}
                            units={view.prefs.units}
                            stock={stock}
                            added={addedParts?.has(f.id) ?? false}
                            onAdd={(line) => onAddPart(f, line)}
                          />
                        </div>
                      )}
                    </>
                  )}
                </article>
              )
            })}
          </div>
        )}
      </div>
      {copied && (
        <span className="sr-only" aria-live="polite">
          {t('copied')}
        </span>
      )}
    </div>
  )
}
