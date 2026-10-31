'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { keepPreviousData, useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import { useFormatter, useTranslations } from 'next-intl'
import {
  ArrowLeft,
  Car,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileText,
  History,
  Loader2,
  Lock,
  Package,
  Search,
  User,
  Wrench,
  X,
} from 'lucide-react'
import type { ComponentType, KeyboardEvent } from 'react'
import { z } from 'zod'
import { AppCard } from '@/components/app-card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { handleGated } from '@/components/upgrade-gate'
import { getRestorePointOpening } from '@/features/integrations/Actions/getRestorePointOpening'
import { getRestorePointRow } from '@/features/integrations/Actions/getRestorePointRow'
import { listRestorePointRows } from '@/features/integrations/Actions/listRestorePointRows'
import { openRestorePoint } from '@/features/integrations/Actions/openRestorePoint'
import { useActionErrorText } from '@/features/integrations/Hooks/useBackupSnapshots'
import { EXPLORE_STAGES } from '@/features/integrations/Lib/backup-types'
import type { ExploreSource } from '@/features/integrations/Lib/explore-source'
import type { ActionResult } from '@/lib/with-auth'

const DATASETS = ['customers', 'vehicles', 'serviceRecords', 'quotes', 'inventoryParts'] as const
type Dataset = (typeof DATASETS)[number]

const DATASET_ICONS: Record<Dataset, ComponentType<{ className?: string }>> = {
  customers: User,
  vehicles: Car,
  serviceRecords: Wrench,
  quotes: ClipboardList,
  inventoryParts: Package,
}

const summarySchema = z.object({
  snapshotId: z.string(),
  exportedAt: z.string().nullable(),
  counts: z.object({
    customers: z.number(),
    vehicles: z.number(),
    serviceRecords: z.number(),
    quotes: z.number(),
    inventoryParts: z.number(),
  }),
})

const itemSchema = z.object({
  id: z.string(),
  title: z.string(),
  subtitle: z.string(),
  at: z.string().nullable(),
})
type ListItem = z.infer<typeof itemSchema>

const pageSchema = z.object({
  items: z.array(itemSchema),
  total: z.number(),
  page: z.number(),
  pages: z.number(),
})

const recordSchema = z
  .object({ item: itemSchema, row: z.record(z.string(), z.unknown()) })
  .nullable()
type Row = Record<string, unknown>

/** The server's word for a restore point that has to be opened again. */
const CLOSED = 'restorePointClosed'

/** Thrown when the restore point stayed closed after opening it once more. */
class RestorePointClosed extends Error {
  constructor() {
    super(CLOSED)
    this.name = 'RestorePointClosed'
  }
}

const SEARCH_DELAY_MS = 300

/** How often the page asks how far the open has got. */
const OPENING_POLL_MS = 600

/** The opening screen stays at least this long, so its steps can be read. */
const MIN_OPENING_MS = 3000

/** A step is never shown for less than this once the open is already done. */
const MIN_STEP_MS = 150

/** How long "Ready" stays before the rows take over. */
const READY_MS = 600

const stageSchema = z.object({ stage: z.enum(EXPLORE_STAGES).nullable() })

/** How far before the end of the list the next page is asked for. */
const PREFETCH_MARGIN = '400px'

/** Columns a nested table shows at most. */
const MAX_COLUMNS = 8

/** Text longer than this, or on several lines, gets a block of its own. */
const LONG_TEXT = 120

/** Rows drawn while the first page loads. */
const SKELETON_ROWS = ['one', 'two', 'three', 'four', 'five', 'six']

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/

/**
 * A stored upload address, in any shape uploads have had:
 * `/api/protected/files/<org>/<category>/<name>`, `/api/files/…` and `/uploads/<category>/<name>`.
 */
const UPLOAD_URL = /^\/(?:api\/(?:protected\/)?files\/[^/]+|uploads)\/([^/]+)\/([^/?#]+)$/

const IMAGE_EXT = /\.(jpe?g|png|webp|avif|gif)$/i

function isIdKey(key: string) {
  return key === 'id' || key.endsWith('Id')
}

function isEmpty(value: unknown): boolean {
  if (value == null || value === '') return true
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === 'object') return Object.keys(value).length === 0
  return false
}

function isRow(value: unknown): value is Row {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/** `serviceDate` reads as "Service date". */
function humanize(key: string): string {
  const words = key
    .replace(/^_+/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/**
 * A record split into its own fields and the sets of nested rows under it
 * (parts, labour, payments, photos…), the way the record view draws them.
 */
function splitRow(row: Row): { fields: [string, unknown][]; sections: [string, Row[]][] } {
  const fields: [string, unknown][] = []
  const sections: [string, Row[]][] = []
  for (const [key, value] of Object.entries(row)) {
    if (isEmpty(value)) continue
    if (Array.isArray(value) && value.every(isRow)) sections.push([key, value])
    else if (isRow(value) && 'id' in value) sections.push([key, [value]])
    else fields.push([key, value])
  }
  // Their own ids last: they mean little to a reader.
  fields.sort(([a], [b]) => Number(isIdKey(a)) - Number(isIdKey(b)))
  return { fields, sections }
}

/** Element id of a section inside the record sheet. */
function sectionId(name: string) {
  return `restore-point-section-${name}`
}

/**
 * Looking inside a restore point, read-only: opens it (the server pulls the
 * data file out of the backup and keeps it for a quarter of an hour), then
 * lists customers, vehicles, work orders, quotes and parts as they were, and
 * opens one record with everything nested under it, photos and documents
 * included. The tabs and the search stay put while the rows scroll in a
 * region of their own, which loads fifty more as the end comes near. When
 * the server has closed the restore point in the meantime it is opened again
 * once, quietly; after that the page asks.
 */
export function RestorePointExplorer({
  snapshotId,
  source,
  backHref,
}: {
  snapshotId: string
  source: ExploreSource
  backHref: string
}) {
  const t = useTranslations('settings.data.restoreExplorer')
  const format = useFormatter()
  const queryClient = useQueryClient()
  const actionErrorText = useActionErrorText()
  const [dataset, setDataset] = useState<Dataset>('customers')
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<{ dataset: Dataset; item: ListItem } | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const searchRef = useRef<HTMLInputElement | null>(null)
  /** Set when "next record" ran past the loaded rows and waits for the next page. */
  const advanceWhenLoaded = useRef(false)

  const sourceKey = source.kind === 'platform' ? 'platform' : source.connectorId
  const baseKey = ['restore-point', snapshotId, sourceKey] as const
  const openKey = [...baseKey, 'open'] as const

  // The owner-only refusal says "restore"; here nothing is restored.
  const errorText = (error: string | undefined) =>
    error === 'restoreOwnerOnly' ? t('ownerOnly') : actionErrorText(error)

  const refused = (res: ActionResult<unknown>): never => {
    handleGated(res)
    throw new Error(errorText(res.error))
  }

  const opened = useQuery({
    queryKey: openKey,
    queryFn: async () => {
      const res = await openRestorePoint({ source, snapshotId })
      if (!res.success) return refused(res)
      return summarySchema.parse(res.data)
    },
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
    retry: false,
  })

  // While the open runs, the server says which step it is on.
  const progress = useQuery({
    queryKey: [...openKey, 'progress'],
    queryFn: async () => {
      const res = await getRestorePointOpening({ snapshotId })
      return res.success ? stageSchema.parse(res.data).stage : null
    },
    enabled: opened.isPending,
    refetchInterval: opened.isPending ? OPENING_POLL_MS : false,
    refetchOnWindowFocus: false,
    retry: false,
    gcTime: 0,
  })

  // The step on screen only ever moves forward. While the open runs it follows
  // the server; once the open is done, the steps still to come are walked
  // through across what is left of the minimum, so an open that returns at
  // once (the restore point was already open) does not flash past unread.
  const openingStartedAt = useRef(Date.now())
  const shownStepRef = useRef(0)
  const [shownStep, setShownStep] = useState(0)
  const [holdingOpening, setHoldingOpening] = useState(true)
  const advanceTo = (step: number) => {
    if (step <= shownStepRef.current) return
    shownStepRef.current = step
    setShownStep(step)
  }
  useEffect(() => {
    if (opened.isPending && progress.data) advanceTo(EXPLORE_STAGES.indexOf(progress.data))
  }, [opened.isPending, progress.data])
  useEffect(() => {
    if (opened.status === 'pending') {
      openingStartedAt.current = Date.now()
      shownStepRef.current = 0
      setShownStep(0)
      setHoldingOpening(true)
      return
    }
    if (opened.status !== 'success') return
    const left = Math.max(0, MIN_OPENING_MS - (Date.now() - openingStartedAt.current))
    const from = shownStepRef.current
    const remaining = EXPLORE_STAGES.length - from
    const pace = Math.max(MIN_STEP_MS, left / Math.max(1, remaining))
    const timers: ReturnType<typeof setTimeout>[] = []
    for (let i = 1; i <= remaining; i++) {
      timers.push(setTimeout(() => advanceTo(from + i), pace * i))
    }
    timers.push(setTimeout(() => setHoldingOpening(false), pace * remaining + READY_MS))
    return () => {
      for (const id of timers) clearTimeout(id)
    }
  }, [opened.status])
  const showOpening = opened.isPending || (opened.isSuccess && holdingOpening)

  /** Runs an action, opening the restore point again once if the server closed it. */
  const withReopen = async <T,>(run: () => Promise<ActionResult<T>>): Promise<T | undefined> => {
    let res = await run()
    if (!res.success && res.error === CLOSED) {
      const again = await openRestorePoint({ source, snapshotId })
      if (again.success) {
        queryClient.setQueryData(openKey, summarySchema.parse(again.data))
        res = await run()
      }
    }
    if (!res.success) {
      if (res.error === CLOSED) throw new RestorePointClosed()
      return refused(res)
    }
    return res.data
  }

  useEffect(() => {
    const next = search.trim()
    if (next === query) return
    const id = setTimeout(() => setQuery(next), SEARCH_DELAY_MS)
    return () => clearTimeout(id)
  }, [search, query])

  const list = useInfiniteQuery({
    queryKey: [...baseKey, 'rows', dataset, query],
    queryFn: async ({ pageParam }) =>
      pageSchema.parse(
        await withReopen(() =>
          listRestorePointRows({ snapshotId, dataset, query, page: pageParam })
        )
      ),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.pages ? last.page + 1 : undefined),
    enabled: opened.isSuccess,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
    retry: false,
  })

  const items = useMemo(() => list.data?.pages.flatMap((p) => p.items) ?? [], [list.data])
  const total = list.data?.pages[0]?.total ?? 0
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = list

  // A new list starts at the top.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
  }, [dataset, query])

  // The next fifty rows arrive before the reader reaches the end.
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel || !hasNextPage) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !isFetchingNextPage) void fetchNextPage()
      },
      { root: scrollRef.current, rootMargin: PREFETCH_MARGIN }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  const record = useQuery({
    queryKey: [...baseKey, 'row', selected?.dataset, selected?.item.id],
    queryFn: async () => {
      if (!selected) return null
      return recordSchema.parse(
        (await withReopen(() =>
          getRestorePointRow({ snapshotId, dataset: selected.dataset, id: selected.item.id })
        )) ?? null
      )
    },
    enabled: opened.isSuccess && Boolean(selected),
    refetchOnWindowFocus: false,
    retry: false,
  })

  const closed =
    list.error instanceof RestorePointClosed || record.error instanceof RestorePointClosed

  const openAgain = () => queryClient.resetQueries({ queryKey: baseKey })

  const switchDataset = (next: string) => {
    setDataset(next as Dataset)
    setSearch('')
    setQuery('')
  }

  const clearSearch = () => {
    setSearch('')
    setQuery('')
    searchRef.current?.focus()
  }

  // Moving between records from inside the sheet, with the arrow keys too.
  const selectedIndex = selected ? items.findIndex((i) => i.id === selected.item.id) : -1
  const atLoadedEnd = selectedIndex >= 0 && selectedIndex + 1 >= items.length
  const canPrevious = selectedIndex > 0
  const canNext = selectedIndex >= 0 && (!atLoadedEnd || Boolean(hasNextPage))
  const goPrevious = () => {
    if (canPrevious) setSelected({ dataset, item: items[selectedIndex - 1] })
  }
  const goNext = () => {
    if (!canNext) return
    if (!atLoadedEnd) {
      setSelected({ dataset, item: items[selectedIndex + 1] })
    } else if (!isFetchingNextPage) {
      advanceWhenLoaded.current = true
      void fetchNextPage()
    }
  }
  useEffect(() => {
    if (!advanceWhenLoaded.current || !selected) return
    const i = items.findIndex((x) => x.id === selected.item.id)
    if (i >= 0 && i + 1 < items.length) {
      advanceWhenLoaded.current = false
      setSelected({ dataset, item: items[i + 1] })
    } else if (!hasNextPage && !isFetchingNextPage) {
      advanceWhenLoaded.current = false
    }
  }, [items, selected, dataset, hasNextPage, isFetchingNextPage])

  const closeRecord = () => {
    advanceWhenLoaded.current = false
    setSelected(null)
  }

  const onSheetKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      goNext()
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      goPrevious()
    }
  }

  const summary = opened.data
  const shortId = snapshotId.slice(0, 8)
  const title = summary?.exportedAt
    ? t('title', {
        date: format.dateTime(new Date(summary.exportedAt), {
          dateStyle: 'medium',
          timeStyle: 'short',
        }),
      })
    : t('titleShort', { id: shortId })

  const fileHref = (category: string, name: string) =>
    `/api/protected/backup/explore/${snapshotId}/file?category=${encodeURIComponent(category)}&name=${encodeURIComponent(name)}`

  const Icon = DATASET_ICONS[dataset]
  const SelectedIcon = selected ? DATASET_ICONS[selected.dataset] : Icon
  const sections = record.data ? splitRow(record.data.row).sections : []
  const waitingForNext = atLoadedEnd && isFetchingNextPage

  return (
    <div className="space-y-4">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t('back')}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground">{t('readOnly')}</p>
        </div>
        <Badge variant="outline" className="gap-1 self-start">
          <Lock className="h-3 w-3" />
          {t('readOnlyBadge')}
        </Badge>
      </div>

      {showOpening ? (
        <OpeningProgress step={shownStep} />
      ) : opened.isError ? (
        <div className="space-y-3 rounded-lg border border-destructive/30 p-6 text-sm">
          <p className="font-medium">{t('openFailed')}</p>
          <p className="text-destructive">{opened.error.message}</p>
          <Button variant="outline" size="sm" onClick={openAgain}>
            {t('tryAgain')}
          </Button>
        </div>
      ) : (
        <>
          {closed && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
              <span>{t('closed')}</span>
              <Button variant="outline" size="sm" onClick={openAgain}>
                {t('openAgain')}
              </Button>
            </div>
          )}

          <AppCard
            icon={History}
            title={t(`datasets.${dataset}`)}
            badge={list.data ? format.number(total) : undefined}
            contentClassName="p-0"
            subheader={
              <div className="space-y-3">
                <Tabs value={dataset} onValueChange={switchDataset}>
                  <TabsList className="h-auto! flex-wrap justify-start">
                    {DATASETS.map((d) => {
                      const TabIcon = DATASET_ICONS[d]
                      return (
                        <TabsTrigger key={d} value={d} className="h-8 flex-none">
                          <TabIcon className="h-3.5 w-3.5" />
                          {t(`datasets.${d}`)}
                          <span className="rounded-sm bg-foreground/5 px-1 text-[11px] tabular-nums text-muted-foreground">
                            {format.number(summary?.counts[d] ?? 0)}
                          </span>
                        </TabsTrigger>
                      )
                    })}
                  </TabsList>
                </Tabs>
                <div className="relative max-w-md">
                  <Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    ref={searchRef}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => e.key === 'Escape' && search && clearSearch()}
                    placeholder={t('searchPlaceholder')}
                    className="pr-8 pl-8"
                    maxLength={100}
                  />
                  {search && (
                    <button
                      type="button"
                      onClick={clearSearch}
                      aria-label={t('clearSearch')}
                      className="absolute top-1/2 right-1.5 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            }
            footer={
              list.data && total > 0 ? (
                <div className="flex min-h-7 items-center justify-between gap-2">
                  <span className="tabular-nums">
                    {t('showing', {
                      shown: format.number(Math.min(items.length, total)),
                      total: format.number(total),
                    })}
                  </span>
                  {hasNextPage && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2"
                      onClick={() => void fetchNextPage()}
                      disabled={isFetchingNextPage}
                    >
                      {isFetchingNextPage ? (
                        <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <ChevronDown className="mr-1 h-3.5 w-3.5" />
                      )}
                      {t('loadMore')}
                    </Button>
                  )}
                </div>
              ) : undefined
            }
          >
            <div
              ref={scrollRef}
              className="max-h-[max(22rem,calc(100dvh-26rem))] overflow-y-auto overscroll-contain"
            >
              {list.isPending ? (
                <RowSkeletons />
              ) : list.isError ? (
                closed ? null : (
                  <p className="px-5 py-6 text-sm text-destructive">
                    {t('loadFailed')}: {list.error.message}
                  </p>
                )
              ) : items.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-5 py-12 text-center">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    {query ? <Search className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                  </span>
                  <p className="text-sm text-muted-foreground">
                    {query ? t('noMatches', { query }) : t('empty')}
                  </p>
                  {query && (
                    <Button variant="ghost" size="sm" onClick={clearSearch}>
                      {t('clearSearch')}
                    </Button>
                  )}
                </div>
              ) : (
                <>
                  <ul
                    className={`divide-y transition-opacity ${list.isPlaceholderData ? 'opacity-60' : ''}`}
                  >
                    {items.map((item) => {
                      const active = selected?.item.id === item.id
                      return (
                        <li key={item.id}>
                          <button
                            type="button"
                            onClick={() => setSelected({ dataset, item })}
                            data-active={active || undefined}
                            className="group/row flex w-full items-center gap-3 px-5 py-2.5 text-left transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none data-active:bg-primary/5"
                          >
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground transition-colors group-hover/row:bg-primary/10 group-hover/row:text-primary group-data-active/row:bg-primary/10 group-data-active/row:text-primary">
                              <Icon className="h-4 w-4" />
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">
                                {item.title || item.id}
                              </p>
                              {item.subtitle && (
                                <p className="truncate text-xs text-muted-foreground">
                                  {item.subtitle}
                                </p>
                              )}
                            </div>
                            {item.at && !Number.isNaN(Date.parse(item.at)) && (
                              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                                {format.dateTime(new Date(item.at), { dateStyle: 'medium' })}
                              </span>
                            )}
                            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-all group-hover/row:translate-x-0.5 group-hover/row:text-muted-foreground" />
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                  <div ref={sentinelRef} aria-hidden className="h-px" />
                  {isFetchingNextPage && (
                    <p className="flex items-center justify-center gap-2 border-t py-3 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      {t('loading')}
                    </p>
                  )}
                </>
              )}
            </div>
          </AppCard>
        </>
      )}

      <Sheet open={Boolean(selected)} onOpenChange={(o) => !o && closeRecord()}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 p-0 sm:max-w-3xl"
          onKeyDown={onSheetKeyDown}
        >
          <SheetHeader className="border-b pr-12">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <SelectedIcon className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <SheetTitle className="truncate">
                  {selected ? selected.item.title || selected.item.id : ''}
                </SheetTitle>
                <SheetDescription className="truncate">
                  {selected?.item.subtitle || (selected ? t(`datasets.${selected.dataset}`) : '')}
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>

          {record.data && sections.length > 0 && <SectionNav sections={sections} />}

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {record.isPending ? (
              <RecordSkeleton />
            ) : record.isError ? (
              closed ? (
                <p className="text-sm text-amber-700 dark:text-amber-400">{t('closed')}</p>
              ) : (
                <p className="text-sm text-destructive">
                  {t('record.loadFailed')}: {record.error.message}
                </p>
              )
            ) : record.data ? (
              <RecordView row={record.data.row} fileHref={fileHref} />
            ) : (
              <p className="text-sm text-muted-foreground">{t('record.notFound')}</p>
            )}
          </div>

          {selected && selectedIndex >= 0 && (
            <div className="flex shrink-0 items-center justify-between gap-2 border-t bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
              <span className="tabular-nums">
                {t('record.position', {
                  index: format.number(selectedIndex + 1),
                  total: format.number(total),
                })}
              </span>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2"
                  onClick={goPrevious}
                  disabled={!canPrevious}
                >
                  <ChevronLeft className="mr-1 h-3.5 w-3.5" />
                  {t('record.previous')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2"
                  onClick={goNext}
                  disabled={!canNext || waitingForNext}
                >
                  {t('record.next')}
                  {waitingForNext ? (
                    <Loader2 className="ml-1 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ChevronRight className="ml-1 h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}

/**
 * The steps of opening a restore point: done ones ticked, the current one
 * pulsing, the rest waiting. `step` indexes EXPLORE_STAGES; one past the end
 * means everything is done.
 */
function OpeningProgress({ step }: { step: number }) {
  const t = useTranslations('settings.data.restoreExplorer')
  const done = step >= EXPLORE_STAGES.length
  const current = done ? EXPLORE_STAGES.length : step
  return (
    <div className="rounded-lg border p-6">
      <div className="flex items-center gap-3">
        {done ? (
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Check className="h-3 w-3" />
          </span>
        ) : (
          <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary" />
        )}
        <div>
          <p className="text-sm font-medium">{done ? t('openingReady') : `${t('opening')}…`}</p>
          <p className="text-xs text-muted-foreground">{t('openingHint')}</p>
        </div>
      </div>
      <ol className="mt-5 space-y-2.5 pl-1">
        {EXPLORE_STAGES.map((step, i) => {
          const state = i < current ? 'done' : i === current ? 'current' : 'waiting'
          return (
            <li
              key={step}
              className={`flex items-center gap-3 text-sm transition-colors ${
                state === 'waiting' ? 'text-muted-foreground/60' : ''
              }`}
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                  state === 'done'
                    ? 'bg-primary text-primary-foreground'
                    : state === 'current'
                      ? 'ring-2 ring-primary/60 ring-inset'
                      : 'ring-1 ring-border ring-inset'
                }`}
              >
                {state === 'done' ? (
                  <Check className="h-3 w-3" />
                ) : state === 'current' ? (
                  <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
                ) : null}
              </span>
              <span className={state === 'current' ? 'font-medium' : ''}>
                {t(`openingSteps.${step}`)}
              </span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function RowSkeletons() {
  return (
    <ul className="divide-y">
      {SKELETON_ROWS.map((row, i) => (
        <li key={row} className="flex items-center gap-3 px-5 py-3">
          <Skeleton className="h-8 w-8 rounded-md" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className={`h-3.5 ${i % 2 ? 'w-1/3' : 'w-2/5'}`} />
            <Skeleton className={`h-3 ${i % 3 ? 'w-1/2' : 'w-1/4'}`} />
          </div>
          <Skeleton className="h-3 w-16" />
        </li>
      ))}
    </ul>
  )
}

function RecordSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-4 w-20" />
        <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-[minmax(9rem,auto)_1fr]">
          {SKELETON_ROWS.map((row) => (
            <div key={row} className="contents">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-3.5 w-2/3" />
            </div>
          ))}
        </div>
      </div>
      <Skeleton className="h-24 w-full" />
    </div>
  )
}

/** Chips that jump to the details or to one set of nested rows. */
function SectionNav({ sections }: { sections: [string, Row[]][] }) {
  const t = useTranslations('settings.data.restoreExplorer')
  const format = useFormatter()
  const jump = (id: string) =>
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b px-4 py-2">
      <span className="mr-1 text-xs text-muted-foreground">{t('record.jumpTo')}</span>
      <Button
        variant="outline"
        size="sm"
        className="h-6 rounded-full px-2.5 text-xs"
        onClick={() => jump(sectionId('fields'))}
      >
        {t('record.fields')}
      </Button>
      {sections.map(([key, rows]) => (
        <Button
          key={key}
          variant="outline"
          size="sm"
          className="h-6 gap-1 rounded-full px-2.5 text-xs"
          onClick={() => jump(sectionId(key))}
        >
          {t.has(`sections.${key}`) ? t(`sections.${key}`) : humanize(key)}
          <span className="tabular-nums text-muted-foreground">{format.number(rows.length)}</span>
        </Button>
      ))}
    </div>
  )
}

type FileHref = (category: string, name: string) => string

/**
 * One record as the backup holds it: its own fields as a list, then each set
 * of nested rows (parts, labour, payments, photos…) as a small table.
 */
function RecordView({ row, fileHref }: { row: Row; fileHref: FileHref }) {
  const t = useTranslations('settings.data.restoreExplorer')
  const { fields, sections } = splitRow(row)

  return (
    <div className="space-y-6">
      <section id={sectionId('fields')} className="scroll-mt-4 space-y-2">
        <h3 className="text-sm font-medium">{t('record.fields')}</h3>
        <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-[minmax(9rem,auto)_1fr]">
          {fields.map(([key, value]) => (
            <div key={key} className="contents">
              <dt className="text-muted-foreground">{humanize(key)}</dt>
              <dd className={`min-w-0 break-words ${isIdKey(key) ? 'text-muted-foreground' : ''}`}>
                <Value value={value} idKey={isIdKey(key)} fileHref={fileHref} />
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {sections.map(([key, rows]) => (
        <NestedRows key={key} name={key} rows={rows} fileHref={fileHref} />
      ))}
    </div>
  )
}

/** The scalar columns of a set of nested rows that hold anything, ids left out. */
function columnsOf(rows: Row[]): string[] {
  const columns: string[] = []
  for (const row of rows) {
    for (const [key, value] of Object.entries(row)) {
      if (columns.includes(key) || isIdKey(key) || key === 'updatedAt' || isEmpty(value)) continue
      if (isRow(value)) continue
      if (Array.isArray(value) && !value.every((v) => typeof v === 'string')) continue
      columns.push(key)
    }
  }
  return columns.slice(0, MAX_COLUMNS)
}

function NestedRows({ name, rows, fileHref }: { name: string; rows: Row[]; fileHref: FileHref }) {
  const t = useTranslations('settings.data.restoreExplorer')
  const format = useFormatter()
  const columns = columnsOf(rows)
  const title = t.has(`sections.${name}`) ? t(`sections.${name}`) : humanize(name)

  return (
    <section id={sectionId(name)} className="scroll-mt-4 space-y-2">
      <h3 className="flex items-center gap-2 text-sm font-medium">
        {title}
        <span className="text-xs font-normal tabular-nums text-muted-foreground">
          {format.number(rows.length)}
        </span>
      </h3>
      {columns.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t('record.noColumns')}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((c) => (
                  <TableHead key={c}>{humanize(c)}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, i) => (
                <TableRow key={typeof row.id === 'string' ? row.id : i}>
                  {columns.map((c) => (
                    <TableCell key={c} className="max-w-64 align-top text-xs whitespace-normal">
                      {isEmpty(row[c]) ? (
                        <span className="text-muted-foreground">-</span>
                      ) : (
                        <Value value={row[c]} compact fileHref={fileHref} />
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  )
}

/** One value, read the way a person would: dates as dates, uploads as files. */
function Value({
  value,
  idKey = false,
  compact = false,
  fileHref,
}: {
  value: unknown
  idKey?: boolean
  compact?: boolean
  fileHref: FileHref
}) {
  const t = useTranslations('settings.data.restoreExplorer')
  const format = useFormatter()

  if (typeof value === 'boolean') return <>{value ? t('record.yes') : t('record.no')}</>
  if (typeof value === 'number') return <span className="tabular-nums">{String(value)}</span>
  if (typeof value === 'string') {
    const upload = UPLOAD_URL.exec(value)
    if (upload) {
      return <FileValue href={fileHref(upload[1], upload[2])} name={upload[2]} compact={compact} />
    }
    if (ISO_DATE.test(value) && !Number.isNaN(Date.parse(value))) {
      return (
        <span className="tabular-nums">
          {format.dateTime(new Date(value), { dateStyle: 'medium', timeStyle: 'short' })}
        </span>
      )
    }
    if (idKey) return <span className="font-mono text-xs">{value}</span>
    if (!compact && (value.length > LONG_TEXT || value.includes('\n'))) {
      return (
        <pre className="max-h-64 overflow-y-auto rounded-md bg-muted/50 p-2 font-sans text-xs whitespace-pre-wrap break-words">
          {value}
        </pre>
      )
    }
    return <>{value}</>
  }
  if (Array.isArray(value)) {
    return (
      <div className="flex flex-wrap gap-2">
        {value.map((v, i) => (
          <Value key={i} value={v} compact={compact} fileHref={fileHref} />
        ))}
      </div>
    )
  }
  return (
    <pre className="max-h-64 overflow-auto rounded-md bg-muted/50 p-2 text-xs">
      {JSON.stringify(value, null, 2)}
    </pre>
  )
}

/** A photo as a small thumbnail, anything else as a link with its file name. */
function FileValue({ href, name, compact }: { href: string; name: string; compact: boolean }) {
  const [broken, setBroken] = useState(false)
  if (IMAGE_EXT.test(name) && !broken) {
    return (
      <a href={href} target="_blank" rel="noreferrer" title={name} className="inline-block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={href}
          alt={name}
          loading="lazy"
          onError={() => setBroken(true)}
          className={`rounded border object-cover ${compact ? 'h-10 w-10' : 'h-20 w-20'}`}
        />
      </a>
    )
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex max-w-full items-center gap-1 text-primary underline-offset-2 hover:underline"
    >
      <FileText className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{name}</span>
    </a>
  )
}
