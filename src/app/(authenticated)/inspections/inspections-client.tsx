'use client'

import { useRememberedSort } from '@/hooks/use-remembered-sort'
import { useTableKeyboardNav } from '@/hooks/use-table-keyboard-nav'
import { interactiveRow } from '@/lib/interactive-row'
import { useDebouncedSearch } from '@/hooks/use-debounced-search'

import { useState, useCallback, useTransition } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useFormatDate } from '@/lib/use-format-date'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { DataTablePagination } from '@/components/data-table-pagination'
import { TableContextMenuHint } from '@/components/table-context-menu-hint'
import { TableCellLink } from '@/components/table-cell-link'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Car,
  ExternalLink,
  Loader2,
  Plus,
  Search,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { NewInspectionDialog } from '@/features/inspections/Components/NewInspectionDialog'
import {
  CONDITION_TOKENS,
  countConditions,
  type Condition,
  type SeverityScale,
} from '@/features/inspections/Lib/conditions'
import { useConditionLabels } from '@/features/inspections/Lib/useConditionLabels'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

interface InspectionRecord {
  id: string
  status: string
  mileage: number | null
  createdAt: Date
  completedAt: Date | null
  severityScale: string | null
  vehicle: { id: string; make: string; model: string; year: number; licensePlate: string | null }
  template: { id: string; name: string; severityScale: string | null }
  items: { id: string; condition: string }[]
}

interface PaginatedData {
  records: InspectionRecord[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  statusCounts: Record<string, number>
}

interface TemplateOption {
  id: string
  name: string
  isDefault: boolean
}

const statusTabs = [
  { key: 'all', labelKey: 'tabAll' },
  { key: 'in_progress', labelKey: 'tabInProgress' },
  { key: 'completed', labelKey: 'tabCompleted' },
] as const

const statusColors: Record<string, string> = {
  in_progress: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  completed: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
}

/**
 * The rail is a breakdown of the grades given, not a completion meter: a full
 * rail with an amber run means every check was graded and some came back as
 * minor defects. Read cold that is easy to mistake for "half done", so the
 * hover spells out what each colour stands for and how many checks it covers.
 */
function InspectionProgress({
  items,
  scale,
}: {
  items: { condition: string }[]
  scale: SeverityScale
}) {
  const t = useTranslations('inspections.list')
  const { label: gradeLabel } = useConditionLabels(scale)
  const counts = countConditions(items)
  if (items.length === 0) return null

  const summary = t('progressTooltip', { graded: counts.inspected, total: counts.total })
  const legend = (
    [
      ['pass', counts.pass],
      ['attention', counts.attention],
      ['fail', counts.fail],
      ['dangerous', counts.dangerous],
      ['not_inspected', counts.notInspected],
    ] as const
  ).filter(([, value]) => value > 0)

  return (
    <Tooltip>
      {/* asChild + span: the mobile list renders this inside a card <button>,
          and a nested <button> is invalid HTML that breaks hydration. */}
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          aria-label={summary}
          className="group flex cursor-help items-center gap-1.5 rounded-sm focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none"
        >
          <div className="ring-offset-background group-hover:ring-foreground/25 flex h-2 w-20 overflow-hidden rounded-full bg-gray-200 ring-offset-1 transition-shadow group-hover:ring-2 dark:bg-gray-700">
            {(['pass', 'attention', 'fail', 'dangerous'] as const).map((c) => {
              const pct = (counts[c] / items.length) * 100
              if (pct === 0) return null
              return (
                <div key={c} className={CONDITION_TOKENS[c].bar} style={{ width: `${pct}%` }} />
              )
            })}
          </div>
          <span className="text-muted-foreground group-hover:text-foreground text-xs">
            {counts.inspected}/{counts.total}
          </span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="px-3 py-2">
        <p className="font-medium">{summary}</p>
        <ul className="mt-1.5 space-y-1">
          {legend.map(([condition, value]) => (
            <li key={condition} className="flex items-center gap-2">
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${
                  condition === 'not_inspected'
                    ? 'bg-background/40'
                    : CONDITION_TOKENS[condition].bar
                }`}
                aria-hidden="true"
              />
              <span className="flex-1">{gradeLabel(condition as Condition)}</span>
              <span className="tabular-nums">{value}</span>
            </li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  )
}

export function InspectionsClient({
  data,
  templates,
  search,
  statusFilter,
  sortBy = '',
  sortOrder = 'desc',
}: {
  data: PaginatedData
  templates: TemplateOption[]
  search: string
  statusFilter: string
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}) {
  const router = useRouter()
  const { formatDate } = useFormatDate()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const tableNav = useTableKeyboardNav()
  useRememberedSort('inspections')
  const [showNewDialog, setShowNewDialog] = useState(false)
  const tcm = useTranslations('common.contextMenu')
  const t = useTranslations('inspections.list')

  const navigate = useCallback(
    (params: Record<string, string | number | undefined>) => {
      const newParams = new URLSearchParams(searchParams.toString())
      for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === '') {
          newParams.delete(key)
        } else {
          newParams.set(key, String(value))
        }
      }
      if (!('page' in params)) newParams.delete('page')
      startTransition(() => {
        router.push(`${pathname}?${newParams.toString()}`)
      })
    },
    [router, pathname, searchParams]
  )

  // Live search: filters as you type, no Enter required. Submitting the
  // form (Enter) commits immediately, bypassing the debounce.
  const {
    value: searchInput,
    setValue: setSearchInput,
    commitNow: handleSearch,
  } = useDebouncedSearch(search, (term) => navigate({ search: term }))

  const handleSort = useCallback(
    (column: string) => {
      const newOrder = sortBy === column && sortOrder === 'asc' ? 'desc' : 'asc'
      navigate({ sortBy: column, sortOrder: newOrder })
    },
    [navigate, sortBy, sortOrder]
  )

  const SortIcon = ({ column }: { column: string }) => {
    if (sortBy !== column) return <ArrowUpDown className="ml-1 h-3 w-3 opacity-50" />
    return sortOrder === 'asc' ? (
      <ArrowUp className="ml-1 h-3 w-3" />
    ) : (
      <ArrowDown className="ml-1 h-3 w-3" />
    )
  }

  return (
    <div className="space-y-4">
      {/* Status filters: one scrollable row on phones, wrapped above sm. */}
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
        {statusTabs.map((tab) => {
          const isActive = statusFilter === tab.key
          const count = tab.key === 'all' ? undefined : data.statusCounts[tab.key] || 0
          return (
            <Button
              key={tab.key}
              variant={isActive ? 'default' : 'outline'}
              size="sm"
              className="h-9 shrink-0 sm:h-8"
              onClick={() => navigate({ status: tab.key === 'all' ? undefined : tab.key })}
            >
              {t(tab.labelKey)}
              {count !== undefined && (
                <Badge variant="secondary" className="ml-1.5 h-5 min-w-5 px-1 text-xs">
                  {count}
                </Badge>
              )}
            </Button>
          )
        })}
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-1 items-center gap-2">
          <form onSubmit={handleSearch} className="relative flex-1 sm:max-w-sm">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t('search')}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="h-9 pl-9"
              {...tableNav.searchInputProps}
            />
          </form>
          {isPending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
        <Button
          size="sm"
          onClick={() => setShowNewDialog(true)}
          aria-label={t('new')}
          title={t('new')}
          className="h-9 w-9 shrink-0 p-0 md:h-8 md:w-auto md:px-3"
        >
          <Plus className="h-4 w-4 md:mr-1 md:h-3.5 md:w-3.5" />
          <span className="hidden md:inline">{t('new')}</span>
        </Button>
      </div>

      {/* Card list (phones + small tablets) */}
      <div className="space-y-2 md:hidden">
        {data.records.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            {t('empty')}
          </div>
        ) : (
          data.records.map((insp) => (
            <button
              key={insp.id}
              type="button"
              onClick={() => router.push(`/inspections/${insp.id}`)}
              className="w-full rounded-lg border bg-card p-3 text-left active:bg-muted/50"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="min-w-0 flex-1 truncate font-medium">
                  {insp.vehicle.year} {insp.vehicle.make} {insp.vehicle.model}
                </span>
                <Badge
                  variant="outline"
                  className={`shrink-0 text-xs ${statusColors[insp.status] || ''}`}
                >
                  {insp.status === 'in_progress' ? t('statusInProgress') : t('statusCompleted')}
                </Badge>
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {insp.vehicle.licensePlate && (
                  <span className="font-mono">{insp.vehicle.licensePlate} · </span>
                )}
                {insp.template.name}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <InspectionProgress
                  items={insp.items}
                  scale={
                    (insp.severityScale ?? insp.template.severityScale) === 'basic' ? 'basic' : 'eu'
                  }
                />
                <span className="font-mono text-xs text-muted-foreground">
                  {formatDate(new Date(insp.createdAt))}
                </span>
              </div>
            </button>
          ))
        )}
      </div>

      {/* Table (md and up) */}
      <div className="hidden rounded-lg border md:block" {...tableNav.containerProps}>
        <TableContextMenuHint />
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead>
                <button
                  type="button"
                  className="flex items-center hover:text-foreground"
                  onClick={() => handleSort('vehicle')}
                >
                  {t('vehicle')}
                  <SortIcon column="vehicle" />
                </button>
              </TableHead>
              <TableHead className="hidden w-[24%] md:table-cell">
                <button
                  type="button"
                  className="flex items-center hover:text-foreground"
                  onClick={() => handleSort('template')}
                >
                  {t('template')}
                  <SortIcon column="template" />
                </button>
              </TableHead>
              <TableHead className="w-32">{t('progress')}</TableHead>
              <TableHead className="w-28">
                <button
                  type="button"
                  className="flex items-center hover:text-foreground"
                  onClick={() => handleSort('status')}
                >
                  {t('status')}
                  <SortIcon column="status" />
                </button>
              </TableHead>
              <TableHead className="w-24">
                <button
                  type="button"
                  className="flex items-center hover:text-foreground"
                  onClick={() => handleSort('createdAt')}
                >
                  {t('date')}
                  <SortIcon column="createdAt" />
                </button>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.records.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                  {t('empty')}
                </TableCell>
              </TableRow>
            ) : (
              data.records.map((insp) => (
                <ContextMenu key={insp.id} modal={false}>
                  <ContextMenuTrigger asChild>
                    <TableRow
                      className="cursor-pointer"
                      {...interactiveRow(() => router.push(`/inspections/${insp.id}`))}
                    >
                      <TableCell>
                        <TableCellLink href={`/vehicles/${insp.vehicle.id}`} block>
                          <p className="truncate font-medium">
                            {insp.vehicle.year} {insp.vehicle.make} {insp.vehicle.model}
                          </p>
                          {insp.vehicle.licensePlate && (
                            <p className="text-xs text-muted-foreground font-mono">
                              {insp.vehicle.licensePlate}
                            </p>
                          )}
                        </TableCellLink>
                      </TableCell>
                      <TableCell className="hidden truncate md:table-cell text-muted-foreground">
                        {insp.template.name}
                      </TableCell>
                      <TableCell>
                        <InspectionProgress
                          items={insp.items}
                          scale={
                            (insp.severityScale ?? insp.template.severityScale) === 'basic'
                              ? 'basic'
                              : 'eu'
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`text-xs ${statusColors[insp.status] || ''}`}
                        >
                          {insp.status === 'in_progress'
                            ? t('statusInProgress')
                            : t('statusCompleted')}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {formatDate(new Date(insp.createdAt))}
                      </TableCell>
                    </TableRow>
                  </ContextMenuTrigger>
                  <ContextMenuContent className="min-w-52">
                    <ContextMenuItem onClick={() => router.push(`/inspections/${insp.id}`)}>
                      <ExternalLink className="mr-2 h-4 w-4" />
                      {tcm('open')}
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => router.push(`/vehicles/${insp.vehicle.id}`)}>
                      <Car className="mr-2 h-4 w-4" />
                      {tcm('openVehicle')}
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <DataTablePagination
        total={data.total}
        page={data.page}
        pageSize={data.pageSize}
        totalPages={data.totalPages}
        onNavigate={navigate}
      />

      <NewInspectionDialog
        open={showNewDialog}
        onOpenChange={setShowNewDialog}
        templates={templates}
      />
    </div>
  )
}
