'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { Check, Loader2, Lock, Plus, Search, SearchX, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { RepairDataView } from '@/features/integrations/Actions/repairDataActions'
import { adjustsHours, hoursToAdd } from '@/features/integrations/Lib/repair-prefs'
import type { LaborTime } from '@/features/integrations/Lib/types'
import { cn } from '@/lib/utils'
import { categoryLabel, ConfidenceMark, GuideMessage, GuideNotices, Highlight } from './guide-parts'

export type LaborView = Omit<RepairDataView<'labor'>, 'items'> & { items: LaborTime[] }

interface LaborTimesPanelProps {
  view: LaborView
  settingsHref: string
  added: ReadonlySet<string>
  unlocking: ReadonlySet<string>
  onAdd: (job: LaborTime, hours: number) => void
  onUnlock: (job: LaborTime) => void
}

/**
 * Every job the guide lists for one engine: a category rail beside the list
 * on a wide screen and a row of chips above it on a narrow one, a search
 * that marks what it matched, and per job the hours it adds, how sure the
 * source is of them, and a button that adds it as a labor line.
 */
export function LaborTimesPanel({
  view,
  settingsHref,
  added,
  unlocking,
  onAdd,
  onUnlock,
}: LaborTimesPanelProps) {
  const t = useTranslations('service.laborGuide')
  const format = useFormatter()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Straight into the search on a desktop; on a phone the keyboard would
  // cover the list before anyone asked for it.
  useEffect(() => {
    if (window.matchMedia?.('(min-width: 768px)').matches) searchRef.current?.focus()
  }, [])

  const counts = useMemo(() => {
    const out = new Map<string, number>()
    for (const job of view.items) out.set(job.category, (out.get(job.category) ?? 0) + 1)
    return out
  }, [view.items])
  const categories = useMemo(
    () => [...counts.keys()].sort((a, b) => categoryLabel(a).localeCompare(categoryLabel(b))),
    [counts]
  )
  // A category the newly picked engine does not have falls back to all of them.
  const active = category && counts.has(category) ? category : null

  const q = query.trim().toLowerCase()
  const groups = useMemo(() => {
    const matches = view.items
      .filter((j) => !active || j.category === active)
      .filter(
        (j) =>
          !q ||
          j.name.toLowerCase().includes(q) ||
          categoryLabel(j.category).toLowerCase().includes(q)
      )
      .sort((a, b) => a.name.localeCompare(b.name))
    const byCategory = new Map<string, LaborTime[]>()
    for (const job of matches) {
      const list = byCategory.get(job.category) ?? []
      list.push(job)
      byCategory.set(job.category, list)
    }
    return [...byCategory.entries()]
      .sort(([a], [b]) => categoryLabel(a).localeCompare(categoryLabel(b)))
      .map(([key, jobs]) => ({ key, jobs }))
  }, [view.items, active, q])
  const shown = groups.reduce((n, g) => n + g.jobs.length, 0)

  const pick = (next: string | null) => {
    setCategory(next)
    if (listRef.current) listRef.current.scrollTop = 0
  }

  const hours = (n: number) => t('hours', { hours: format.number(n, { maximumFractionDigits: 2 }) })
  const showBook = adjustsHours(view.prefs)

  const railItem = (key: string | null, label: string, count: number) => (
    <button
      key={key ?? 'all'}
      type="button"
      onClick={() => pick(key)}
      aria-current={active === key ? 'true' : undefined}
      className={cn(
        'flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors',
        active === key
          ? 'bg-accent font-medium text-accent-foreground'
          : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
      )}
    >
      <span className="truncate">{label}</span>
      <span className="shrink-0 text-xs tabular-nums opacity-70">{count}</span>
    </button>
  )

  const chip = (key: string | null, label: string) => (
    <button
      key={key ?? 'all'}
      type="button"
      onClick={() => pick(key)}
      aria-pressed={active === key}
      className={cn(
        'shrink-0 rounded-full border px-3 py-1 text-xs transition-colors',
        active === key
          ? 'border-primary bg-primary text-primary-foreground'
          : 'bg-background text-muted-foreground hover:text-foreground'
      )}
    >
      {label}
    </button>
  )

  return (
    <div className="grid h-full min-h-0 md:grid-cols-[13.5rem_minmax(0,1fr)]">
      <nav
        aria-label={t('categories')}
        className="hidden min-h-0 overflow-y-auto overscroll-contain border-r bg-muted/20 p-3 md:block"
      >
        <div className="space-y-0.5">
          {railItem(null, t('allJobs'), view.items.length)}
          <div className="my-2 border-t" />
          {categories.map((c) => railItem(c, categoryLabel(c), counts.get(c) ?? 0))}
        </div>
      </nav>

      <div className="flex min-h-0 flex-col">
        <div className="space-y-3 border-b px-4 py-3 sm:px-5">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('search')}
              aria-label={t('search')}
              className="h-10 pr-9 pl-9 [&::-webkit-search-cancel-button]:hidden"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery('')
                  searchRef.current?.focus()
                }}
                aria-label={t('clearSearch')}
                className="absolute top-1/2 right-2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
          <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] sm:-mx-5 sm:px-5 md:hidden">
            {chip(null, t('allJobs'))}
            {categories.map((c) => chip(c, categoryLabel(c)))}
          </div>
        </div>

        <GuideNotices
          view={view}
          multipleEngines={view.variants.length > 1}
          settingsHref={settingsHref}
        />

        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {shown === 0 ? (
            <GuideMessage
              icon={SearchX}
              title={q ? t('noMatch', { query: query.trim() }) : t('noJobs')}
              action={
                q || active ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setQuery('')
                      pick(null)
                    }}
                  >
                    {t('showAll')}
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              <p
                className="px-4 pt-3 pb-1 text-xs text-muted-foreground sm:px-5"
                aria-live="polite"
              >
                {t('jobCount', { count: shown })}
              </p>
              {groups.map((group) => (
                <section key={group.key} aria-label={categoryLabel(group.key)}>
                  {!active && (
                    <h3 className="sticky top-0 z-10 border-b bg-background/95 px-4 py-1.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:px-5">
                      {categoryLabel(group.key)}
                    </h3>
                  )}
                  <ul className="divide-y">
                    {group.jobs.map((job) => {
                      const busy = unlocking.has(job.id)
                      const isAdded = added.has(job.id)
                      const adds = hoursToAdd(job, view.prefs)
                      const range =
                        job.low !== null && job.high !== null && job.low !== job.high
                          ? t('range', {
                              low: format.number(job.low, { maximumFractionDigits: 2 }),
                              high: format.number(job.high, { maximumFractionDigits: 2 }),
                            })
                          : null
                      return (
                        <li
                          key={job.id}
                          className={cn(
                            'flex items-center gap-3 px-4 py-2.5 transition-colors sm:gap-4 sm:px-5',
                            isAdded ? 'bg-primary/[0.04]' : 'hover:bg-muted/40'
                          )}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">
                              <Highlight text={job.name} query={query} />
                            </p>
                            {!job.locked && (
                              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                                <ConfidenceMark confidence={job.confidence} />
                                {range && (
                                  <span className="text-xs tabular-nums text-muted-foreground">
                                    {range}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>

                          {job.locked || adds === null ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              disabled={busy}
                              onClick={() => onUnlock(job)}
                              className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                            >
                              {busy ? (
                                <Loader2 className="size-3.5 animate-spin" />
                              ) : (
                                <Lock className="size-3.5" />
                              )}
                              {t('showHours')}
                            </Button>
                          ) : (
                            <>
                              <div className="w-20 shrink-0 text-right">
                                <p className="text-sm font-semibold tabular-nums">{hours(adds)}</p>
                                {showBook && job.hours !== null && job.hours !== adds && (
                                  <p className="text-[11px] tabular-nums text-muted-foreground">
                                    {t('bookTime', {
                                      hours: format.number(job.hours, {
                                        maximumFractionDigits: 2,
                                      }),
                                    })}
                                  </p>
                                )}
                              </div>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    type="button"
                                    size="icon"
                                    variant={isAdded ? 'secondary' : 'outline'}
                                    disabled={isAdded}
                                    onClick={() => onAdd(job, adds)}
                                    aria-label={
                                      isAdded
                                        ? t('addedJob', { job: job.name })
                                        : t('addJob', { job: job.name })
                                    }
                                    className={cn(
                                      'size-8 shrink-0 rounded-full',
                                      isAdded && 'text-primary disabled:opacity-100'
                                    )}
                                  >
                                    {isAdded ? (
                                      <Check className="size-4" />
                                    ) : (
                                      <Plus className="size-4" />
                                    )}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>{isAdded ? t('added') : t('add')}</TooltipContent>
                              </Tooltip>
                            </>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </section>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
