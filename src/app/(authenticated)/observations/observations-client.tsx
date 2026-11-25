'use client'

import { useTableKeyboardNav } from '@/hooks/use-table-keyboard-nav'
import { interactiveRow } from '@/lib/interactive-row'
import { useCallback, useTransition } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import { useInfiniteRows } from '@/components/infinite-list/use-infinite-rows'
import {
  InfiniteListCount,
  InfiniteListFooter,
  InfiniteTableFooter,
} from '@/components/infinite-list/infinite-list-footer'
import { getObservationRows } from '@/features/vehicles/Actions/getObservationRows'
import { OBSERVATION_DEFAULT_STATUS } from '@/features/vehicles/Lib/observationFilters'
import type { Cursor } from '@/lib/keyset'
import { TableContextMenuHint } from '@/components/table-context-menu-hint'
import { TableCellLink } from '@/components/table-cell-link'
import { useFormatDate } from '@/lib/use-format-date'
import { Car, ExternalLink, Search, Loader2 } from 'lucide-react'
import { vehicleName } from '@/lib/vehicle-name'

type Observation = {
  id: string
  description: string
  severity: string
  status: string
  notes: string | null
  createdAt: Date
  vehicle: {
    id: string
    make: string
    model: string
    year: number
    licensePlate: string | null
  }
  serviceRecord: { id: string; title: string } | null
  resolvedServiceRecord: { id: string; title: string } | null
}

/** One batch of the list; the first also carries the total. */
type ObservationBatch = {
  rows: Observation[]
  nextCursor: Cursor | null
  total?: number
}

const severityColors: Record<string, string> = {
  urgent: 'bg-red-500/10 text-red-500 border-red-500/20',
  needs_work: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  monitor: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
}

const statusColors: Record<string, string> = {
  open: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  resolved: 'bg-green-500/10 text-green-600 border-green-500/20',
}

export function ObservationsClient({
  data,
  listScope = '',
  search,
  statusFilter,
  severityFilter,
}: {
  /** The first batch, rendered on the server. */
  data: ObservationBatch
  /** The workshop, so one workshop's cached rows never show in another's. */
  listScope?: string
  search: string
  statusFilter: string
  severityFilter: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const tableNav = useTableKeyboardNav()
  const { formatDate } = useFormatDate()
  const t = useTranslations('vehicles.observationsPage')
  const tf = useTranslations('vehicles.findings')
  const tcm = useTranslations('common.contextMenu')

  const navigate = useCallback(
    (params: Record<string, string | number | undefined>) => {
      const newParams = new URLSearchParams(searchParams.toString())
      for (const [key, value] of Object.entries(params)) {
        // A filter at its default leaves the address: severity's is "all",
        // status's is open, so "All statuses" stays as ?status=all.
        const fallback = key === 'status' ? OBSERVATION_DEFAULT_STATUS : 'all'
        if (value === undefined || value === '' || value === fallback) {
          newParams.delete(key)
        } else {
          newParams.set(key, String(value))
        }
      }
      // Pages are gone; an old link's ?page= means nothing now.
      newParams.delete('page')
      startTransition(() => {
        router.push(`${pathname}?${newParams.toString()}`)
      })
    },
    [router, pathname, searchParams]
  )

  // The filters exactly as the page read its first batch with them (straight
  // from the address, where an absent status means open), so every
  // batch after it continues that list.
  const filters = {
    search: search || undefined,
    status: searchParams.get('status') || undefined,
    severity: searchParams.get('severity') || undefined,
  }
  const list = useInfiniteRows<Observation, Cursor, ObservationBatch>({
    queryKey: ['observations', listScope, filters],
    initial: data,
    fetchPage: (cursor) => getObservationRows({ ...filters, cursor }),
  })
  const records = list.rows

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {/* Filters */}
      <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t('searchPlaceholder')}
            aria-label={t('searchPlaceholder')}
            defaultValue={search}
            onChange={(e) => {
              const value = e.target.value
              if (value === search) return
              navigate({ search: value || undefined })
            }}
            className="h-9 pl-9 pr-9"
            {...tableNav.searchInputProps}
          />
          {isPending && (
            <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          )}
        </div>
        <div className="flex gap-2">
          <Select value={statusFilter} onValueChange={(v) => navigate({ status: v })}>
            <SelectTrigger className="h-9 w-full sm:w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('allStatuses')}</SelectItem>
              <SelectItem value="open">{tf('status.open')}</SelectItem>
              <SelectItem value="resolved">{tf('status.resolved')}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={severityFilter} onValueChange={(v) => navigate({ severity: v })}>
            <SelectTrigger className="h-9 w-full sm:w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('allSeverities')}</SelectItem>
              <SelectItem value="urgent">{tf('severity.urgent')}</SelectItem>
              <SelectItem value="needs_work">{tf('severity.needs_work')}</SelectItem>
              <SelectItem value="monitor">{tf('severity.monitor')}</SelectItem>
            </SelectContent>
          </Select>
          <InfiniteListCount
            shown={records.length}
            total={list.total}
            className="shrink-0 self-center"
          />
        </div>
      </div>

      {/* Card list (phones + small tablets) - only this scrolls */}
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto md:hidden">
        {records.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            {t('empty')}
          </div>
        ) : (
          records.map((obs) => (
            <button
              key={obs.id}
              type="button"
              onClick={() => router.push(`/vehicles/${obs.vehicle.id}?tab=findings`)}
              className="w-full rounded-lg border bg-card p-3 text-left active:bg-muted/50"
            >
              <p className="text-sm font-medium">{obs.description}</p>
              {obs.notes && (
                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{obs.notes}</p>
              )}
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {obs.vehicle.licensePlate && (
                  <span className="font-mono font-medium text-foreground">
                    {obs.vehicle.licensePlate}{' '}
                  </span>
                )}
                {vehicleName(obs.vehicle)}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <Badge
                  variant="outline"
                  className={`text-xs ${severityColors[obs.severity] || ''}`}
                >
                  {tf(
                    `severity.${obs.severity}` as
                      | 'severity.urgent'
                      | 'severity.needs_work'
                      | 'severity.monitor'
                  )}
                </Badge>
                <Badge variant="outline" className={`text-xs ${statusColors[obs.status] || ''}`}>
                  {tf(
                    `status.${obs.status}` as 'status.open' | 'status.quoted' | 'status.resolved'
                  )}
                </Badge>
                <span className="font-mono text-xs text-muted-foreground">
                  {formatDate(new Date(obs.createdAt))}
                </span>
              </div>
            </button>
          ))
        )}
        {records.length > 0 && <InfiniteListFooter state={list} />}
      </div>

      {/* Table (md and up) - only the rows scroll */}
      <div
        className="hidden min-h-0 flex-1 flex-col overflow-hidden rounded-md border md:flex"
        {...tableNav.containerProps}
      >
        <TableContextMenuHint />
        <Table containerClassName="min-h-0 flex-1">
          <TableHeader sticky>
            <TableRow>
              <TableHead className="w-[110px]">{t('columns.severity')}</TableHead>
              <TableHead className="w-[100px]">{t('columns.status')}</TableHead>
              <TableHead className="w-[160px]">{t('columns.vehicle')}</TableHead>
              <TableHead>{t('columns.description')}</TableHead>
              <TableHead className="hidden md:table-cell">{t('columns.notes')}</TableHead>
              <TableHead className="w-[110px] text-right">{t('columns.created')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  {t('empty')}
                </TableCell>
              </TableRow>
            ) : (
              records.map((obs) => {
                const vehicleLabel = obs.vehicle.licensePlate ?? `${vehicleName(obs.vehicle)}`
                return (
                  <ContextMenu key={obs.id} modal={false}>
                    <ContextMenuTrigger asChild>
                      <TableRow
                        className="cursor-pointer"
                        {...interactiveRow(() =>
                          router.push(`/vehicles/${obs.vehicle.id}?tab=findings`)
                        )}
                      >
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`text-xs ${severityColors[obs.severity] || ''}`}
                          >
                            {tf(
                              `severity.${obs.severity}` as
                                | 'severity.urgent'
                                | 'severity.needs_work'
                                | 'severity.monitor'
                            )}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`text-xs ${statusColors[obs.status] || ''}`}
                          >
                            {tf(
                              `status.${obs.status}` as
                                | 'status.open'
                                | 'status.quoted'
                                | 'status.resolved'
                            )}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <TableCellLink href={`/vehicles/${obs.vehicle.id}`} block>
                            <span className="block font-mono text-xs font-medium">
                              {vehicleLabel}
                            </span>
                            {obs.vehicle.licensePlate && (
                              <span className="block text-[11px] text-muted-foreground">
                                {vehicleName(obs.vehicle)}
                              </span>
                            )}
                          </TableCellLink>
                        </TableCell>
                        <TableCell className="text-sm font-medium">{obs.description}</TableCell>
                        <TableCell className="hidden md:table-cell text-sm text-muted-foreground truncate max-w-[300px]">
                          {obs.notes}
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground whitespace-nowrap">
                          {formatDate(new Date(obs.createdAt))}
                        </TableCell>
                      </TableRow>
                    </ContextMenuTrigger>
                    <ContextMenuContent className="min-w-52">
                      <ContextMenuItem
                        onClick={() => router.push(`/vehicles/${obs.vehicle.id}?tab=findings`)}
                      >
                        <ExternalLink className="mr-2 h-4 w-4" />
                        {tcm('open')}
                      </ContextMenuItem>
                      <ContextMenuItem onClick={() => router.push(`/vehicles/${obs.vehicle.id}`)}>
                        <Car className="mr-2 h-4 w-4" />
                        {tcm('openVehicle')}
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                )
              })
            )}
            {records.length > 0 && <InfiniteTableFooter state={list} colSpan={6} />}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
