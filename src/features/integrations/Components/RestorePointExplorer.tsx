'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { useFormatter, useTranslations } from 'next-intl'
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  FileText,
  History,
  Loader2,
  Search,
} from 'lucide-react'
import { z } from 'zod'
import { AppCard } from '@/components/app-card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
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
import { getRestorePointRow } from '@/features/integrations/Actions/getRestorePointRow'
import { listRestorePointRows } from '@/features/integrations/Actions/listRestorePointRows'
import { openRestorePoint } from '@/features/integrations/Actions/openRestorePoint'
import { useActionErrorText } from '@/features/integrations/Hooks/useBackupSnapshots'
import type { ExploreSource } from '@/features/integrations/Lib/explore-source'
import type { ActionResult } from '@/lib/with-auth'

const DATASETS = ['customers', 'vehicles', 'serviceRecords', 'quotes', 'inventoryParts'] as const
type Dataset = (typeof DATASETS)[number]

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

/** Columns a nested table shows at most. */
const MAX_COLUMNS = 8

/** Text longer than this, or on several lines, gets a block of its own. */
const LONG_TEXT = 120

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
 * Looking inside a restore point, read-only: opens it (the server pulls the
 * data file out of the backup and keeps it for a quarter of an hour), then
 * lists customers, vehicles, work orders, quotes and parts as they were, and
 * opens one record with everything nested under it, photos and documents
 * included. When the server has closed the restore point in the meantime it
 * is opened again once, quietly; after that the page asks.
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
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<{ dataset: Dataset; item: ListItem } | null>(null)

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
    const id = setTimeout(() => {
      setQuery(next)
      setPage(1)
    }, SEARCH_DELAY_MS)
    return () => clearTimeout(id)
  }, [search, query])

  const list = useQuery({
    queryKey: [...baseKey, 'rows', dataset, query, page],
    queryFn: async () =>
      pageSchema.parse(
        await withReopen(() => listRestorePointRows({ snapshotId, dataset, query, page }))
      ),
    enabled: opened.isSuccess,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
    retry: false,
  })

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
    setPage(1)
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

  return (
    <div className="space-y-4">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t('back')}
      </Link>

      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{t('readOnly')}</p>
      </div>

      {opened.isPending ? (
        <div className="flex items-center gap-3 rounded-lg border p-6 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 shrink-0 animate-spin" />
          {t('opening')}
        </div>
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
            badge={list.data ? format.number(list.data.total) : undefined}
            contentClassName="p-0"
            subheader={
              <div className="space-y-3">
                <Tabs value={dataset} onValueChange={switchDataset}>
                  <div className="overflow-x-auto">
                    <TabsList>
                      {DATASETS.map((d) => (
                        <TabsTrigger key={d} value={d}>
                          {t(`datasets.${d}`)}
                          <span className="text-xs tabular-nums text-muted-foreground">
                            {format.number(summary?.counts[d] ?? 0)}
                          </span>
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </div>
                </Tabs>
                <div className="relative max-w-sm">
                  <Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t('searchPlaceholder')}
                    className="pl-8"
                    maxLength={100}
                  />
                </div>
              </div>
            }
            footer={
              list.data && list.data.pages > 1 ? (
                <div className="flex items-center justify-between gap-2">
                  <span>{t('pageOf', { page: list.data.page, pages: list.data.pages })}</span>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={list.data.page <= 1 || list.isFetching}
                    >
                      <ChevronLeft className="mr-1 h-3.5 w-3.5" />
                      {t('previous')}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2"
                      onClick={() => setPage((p) => p + 1)}
                      disabled={list.data.page >= list.data.pages || list.isFetching}
                    >
                      {t('next')}
                      <ChevronRight className="ml-1 h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ) : undefined
            }
          >
            {list.isPending ? (
              <p className="flex items-center gap-2 px-5 py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('loading')}
              </p>
            ) : list.isError ? (
              closed ? null : (
                <p className="px-5 py-6 text-sm text-destructive">
                  {t('loadFailed')}: {list.error.message}
                </p>
              )
            ) : list.data.items.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted-foreground">
                {query ? t('noMatches', { query }) : t('empty')}
              </p>
            ) : (
              <ul className={`divide-y ${list.isFetching ? 'opacity-60' : ''}`}>
                {list.data.items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => setSelected({ dataset, item })}
                      className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-muted/50"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{item.title || item.id}</p>
                        {item.subtitle && (
                          <p className="truncate text-xs text-muted-foreground">{item.subtitle}</p>
                        )}
                      </div>
                      {item.at && !Number.isNaN(Date.parse(item.at)) && (
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                          {format.dateTime(new Date(item.at), { dateStyle: 'medium' })}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </AppCard>
        </>
      )}

      <Sheet open={Boolean(selected)} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-3xl">
          <SheetHeader className="border-b pr-12">
            <SheetTitle className="truncate">
              {selected ? selected.item.title || selected.item.id : ''}
            </SheetTitle>
            <SheetDescription>
              {selected?.item.subtitle || (selected ? t(`datasets.${selected.dataset}`) : '')}
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {record.isPending ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('record.loading')}
              </p>
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
        </SheetContent>
      </Sheet>
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

  return (
    <div className="space-y-6">
      <section className="space-y-2">
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
    <section className="space-y-2">
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
