'use client'

import { useCallback, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useFormatDate } from '@/lib/use-format-date'
import { useTableKeyboardNav } from '@/hooks/use-table-keyboard-nav'
import { useDebouncedSearch } from '@/hooks/use-debounced-search'
import { interactiveRow } from '@/lib/interactive-row'
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
import { CheckInDialog } from '@/features/tire-hotel/Components/CheckInDialog'
import { TreatmentChips } from '@/features/tire-hotel/Components/TreatmentChips'
import type { PickerLocation } from '@/features/tire-hotel/Components/LocationPicker'
import {
  CONDITION_TOKENS,
  STATUS_TOKENS,
  worstCondition,
  type TireSetStatus,
} from '@/features/tire-hotel/Lib/tireConstants'
import { cn } from '@/lib/utils'
import {
  Car,
  ExternalLink,
  Loader2,
  MapPin,
  Plus,
  Search,
  TrendingUp,
  Warehouse,
} from 'lucide-react'

type TireSetRecord = {
  id: string
  reference: string | null
  season: string
  studded: boolean
  brand: string | null
  model: string | null
  size: string | null
  quantity: number
  withRims: boolean
  status: string
  checkedInAt: Date | null
  location: { id: string; code: string; warehouse: { id: string; name: string } } | null
  vehicle: {
    id: string
    make: string
    model: string
    year: number
    licensePlate: string | null
  } | null
  customer: { id: string; name: string; phone: string | null } | null
  measurements: { condition: string; treadDepthMm: number | null }[]
  treatments: { type: string; status: string }[]
}

type PaginatedData = {
  records: TireSetRecord[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  statusCounts: Record<string, number>
}

const statusTabs = [
  { key: 'all', labelKey: 'tabAll' },
  { key: 'stored', labelKey: 'tabStored' },
  { key: 'released', labelKey: 'tabReleased' },
  // The tire department's own view: everything still waiting on prep work,
  // regardless of whether it is on a shelf or going back out.
  { key: 'needs_prep', labelKey: 'tabNeedsPrep' },
  // Its own tab rather than a share of "all": written off is history, and
  // history should be findable without crowding what is on the racks.
  { key: 'disposed', labelKey: 'tabDisposed' },
] as const

export function TireHotelClient({
  data,
  locations,
  vehicles,
  imperial,
  search,
  statusFilter,
  totalFree,
}: {
  data: PaginatedData
  locations: PickerLocation[]
  vehicles: {
    id: string
    make: string
    model: string
    year: number
    licensePlate: string | null
    customerId: string | null
  }[]
  imperial: boolean
  search: string
  statusFilter: string
  totalFree: number
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { formatDate } = useFormatDate()
  const [isPending, startTransition] = useTransition()
  const tableNav = useTableKeyboardNav()
  const t = useTranslations('tireHotel')
  const tcm = useTranslations('common.contextMenu')
  const [showCheckIn, setShowCheckIn] = useState(false)

  // Nothing can be checked in until somewhere exists to put it, so the page
  // leads with setting that up rather than with a flow that dead-ends in an
  // empty shelf picker.
  const hasShelves = locations.length > 0

  const navigate = useCallback(
    (params: Record<string, string | number | undefined>) => {
      const newParams = new URLSearchParams(searchParams.toString())
      for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === '') newParams.delete(key)
        else newParams.set(key, String(value))
      }
      if (!('page' in params)) newParams.delete('page')
      startTransition(() => {
        router.push(`${pathname}?${newParams.toString()}`)
      })
    },
    [router, pathname, searchParams]
  )

  const {
    value: searchInput,
    setValue: setSearchInput,
    commitNow: handleSearch,
  } = useDebouncedSearch(search, (term) => navigate({ search: term }))

  return (
    <div className="space-y-4">
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
              {t(`list.${tab.labelKey}`)}
              {count !== undefined && (
                <Badge variant="secondary" className="ml-1.5 h-5 min-w-5 px-1 text-xs">
                  {count}
                </Badge>
              )}
            </Button>
          )
        })}
        {/* Free space sits with the filters rather than in a card: it is the
            number staff glance at before answering a customer on the phone.
            It doubles as the way into the shelf layout, since "how much room
            is left" and "where are the shelves" are the same errand. */}
        <div className="ml-auto flex shrink-0 items-center gap-2 self-center">
          {/* Purchasing's question rather than the counter's, so it sits
              beside the shelf count instead of competing with the filters. */}
          <Button asChild variant="outline" size="sm" className="h-9 sm:h-8">
            <Link href="/tire-hotel/forecast">
              <TrendingUp className="mr-1.5 h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t('forecast.title')}</span>
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="h-9 sm:h-8">
            <Link href="/tire-hotel/storage">
              <Warehouse className="mr-1.5 h-3.5 w-3.5" />
              <span className="tabular-nums">{t('list.roomLeft', { count: totalFree })}</span>
            </Link>
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-1 items-center gap-2">
          <form onSubmit={handleSearch} className="relative flex-1 sm:max-w-sm">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t('list.search')}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="h-9 pl-9"
              {...tableNav.searchInputProps}
            />
          </form>
          {isPending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
        {hasShelves ? (
          <Button
            size="sm"
            onClick={() => setShowCheckIn(true)}
            aria-label={t('list.checkIn')}
            title={t('list.checkIn')}
            className="h-9 w-9 shrink-0 p-0 md:h-8 md:w-auto md:px-3"
          >
            <Plus className="h-4 w-4 md:mr-1 md:h-3.5 md:w-3.5" />
            <span className="hidden md:inline">{t('list.checkIn')}</span>
          </Button>
        ) : (
          <Button asChild size="sm" className="h-9 shrink-0 md:h-8">
            <Link href="/tire-hotel/storage">
              <Warehouse className="mr-1.5 h-3.5 w-3.5" />
              {t('list.setUpShelves')}
            </Link>
          </Button>
        )}
      </div>

      {/* Card list (phones and small tablets) */}
      <div className="space-y-2 md:hidden">
        {data.records.length === 0 ? (
          <EmptyState message={hasShelves ? t('list.empty') : t('list.emptyNoShelves')} />
        ) : (
          data.records.map((set) => (
            <button
              key={set.id}
              type="button"
              onClick={() => router.push(`/tire-hotel/${set.id}`)}
              className="w-full rounded-lg border bg-card p-3 text-left active:bg-muted/50"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="min-w-0 flex-1 truncate font-medium">
                  {set.vehicle
                    ? `${set.vehicle.year} ${set.vehicle.make} ${set.vehicle.model}`
                    : (set.customer?.name ?? t('list.unassigned'))}
                </span>
                <Badge
                  variant="outline"
                  className={cn('shrink-0 text-xs', STATUS_TOKENS[set.status as TireSetStatus])}
                >
                  {t(`statuses.${set.status}`)}
                </Badge>
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {set.vehicle?.licensePlate && (
                  <span className="font-mono">{set.vehicle.licensePlate} · </span>
                )}
                {t(`seasons.${set.season}`)}
                {set.size ? ` · ${set.size}` : ''}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
                {set.location && (
                  <span className="flex items-center gap-1 font-mono text-muted-foreground">
                    <MapPin className="h-3 w-3" />
                    {set.location.code}
                  </span>
                )}
                <span className="text-muted-foreground tabular-nums">
                  {t('list.tireCount', { count: set.quantity })}
                </span>
                <ConditionDot measurements={set.measurements} />
                <TreatmentChips treatments={set.treatments} />
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
              <TableHead className="w-14">{t('list.reference')}</TableHead>
              {/* Vehicle takes what is left rather than a share of the table:
                  a plate and a model need far less room than an even split
                  gives them, and the shelf code needs more than it got. */}
              <TableHead className="w-[26%] min-w-0">{t('list.vehicle')}</TableHead>
              <TableHead className="hidden w-[16%] lg:table-cell">{t('list.tires')}</TableHead>
              {/* Shelf codes are workshop-defined and can run long
                  ("Room B-Rack 04-Shelf 2"), so the cell truncates and carries
                  the full code as its title. */}
              <TableHead className="w-40">{t('list.location')}</TableHead>
              <TableHead className="w-20">{t('list.prep')}</TableHead>
              <TableHead className="w-24">{t('list.condition')}</TableHead>
              <TableHead className="w-24">{t('list.status')}</TableHead>
              <TableHead className="hidden w-24 lg:table-cell">{t('list.storedSince')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.records.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                  {hasShelves ? t('list.empty') : t('list.emptyNoShelves')}
                </TableCell>
              </TableRow>
            ) : (
              data.records.map((set) => (
                <ContextMenu key={set.id} modal={false}>
                  <ContextMenuTrigger asChild>
                    <TableRow
                      className="cursor-pointer"
                      {...interactiveRow(() => router.push(`/tire-hotel/${set.id}`))}
                    >
                      <TableCell className="truncate font-mono text-xs text-muted-foreground">
                        {set.reference ?? '-'}
                      </TableCell>
                      <TableCell>
                        {set.vehicle ? (
                          <TableCellLink href={`/vehicles/${set.vehicle.id}`} block>
                            <p className="truncate font-medium">
                              {set.vehicle.year} {set.vehicle.make} {set.vehicle.model}
                            </p>
                            {set.vehicle.licensePlate && (
                              <p className="font-mono text-xs text-muted-foreground">
                                {set.vehicle.licensePlate}
                              </p>
                            )}
                          </TableCellLink>
                        ) : (
                          <div>
                            <p className="truncate font-medium">
                              {set.customer?.name ?? t('list.unassigned')}
                            </p>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="hidden truncate text-muted-foreground lg:table-cell">
                        <span className="text-xs">
                          {t(`seasons.${set.season}`)}
                          {set.studded ? ` · ${t('list.studded')}` : ''}
                          {set.size ? ` · ${set.size}` : ''}
                        </span>
                      </TableCell>
                      <TableCell className="truncate">
                        {set.location ? (
                          <span className="font-mono text-xs" title={set.location.code}>
                            {set.location.code}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <TreatmentChips treatments={set.treatments} />
                      </TableCell>
                      <TableCell>
                        <ConditionDot measurements={set.measurements} />
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn('text-xs', STATUS_TOKENS[set.status as TireSetStatus])}
                        >
                          {t(`statuses.${set.status}`)}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden font-mono text-xs lg:table-cell">
                        {set.checkedInAt ? formatDate(new Date(set.checkedInAt)) : '-'}
                      </TableCell>
                    </TableRow>
                  </ContextMenuTrigger>
                  <ContextMenuContent className="min-w-52">
                    <ContextMenuItem onClick={() => router.push(`/tire-hotel/${set.id}`)}>
                      <ExternalLink className="mr-2 h-4 w-4" />
                      {tcm('open')}
                    </ContextMenuItem>
                    {set.vehicle && (
                      <ContextMenuItem onClick={() => router.push(`/vehicles/${set.vehicle!.id}`)}>
                        <Car className="mr-2 h-4 w-4" />
                        {tcm('openVehicle')}
                      </ContextMenuItem>
                    )}
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

      <CheckInDialog
        open={showCheckIn}
        onOpenChange={setShowCheckIn}
        locations={locations}
        vehicles={vehicles}
        imperial={imperial}
      />
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
      {message}
    </div>
  )
}

/** Worst grade across the latest readings, as one dot plus a word. */
function ConditionDot({ measurements }: { measurements: { condition: string }[] }) {
  const t = useTranslations('tireHotel')
  if (measurements.length === 0) {
    return <span className="text-xs text-muted-foreground">-</span>
  }
  const grade = worstCondition(measurements.map((m) => m.condition))
  return (
    <span className="flex items-center gap-1.5 text-xs">
      <span className={cn('h-2 w-2 shrink-0 rounded-full', CONDITION_TOKENS[grade].dot)} />
      {t(`conditions.${grade}`)}
    </span>
  )
}
