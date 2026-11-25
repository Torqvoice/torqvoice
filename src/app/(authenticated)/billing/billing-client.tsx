'use client'

import { DEFAULT_CURRENCY_CODE } from '@/lib/currencies'
import { useTableKeyboardNav } from '@/hooks/use-table-keyboard-nav'
import { interactiveRow } from '@/lib/interactive-row'
import { useDebouncedSearch } from '@/hooks/use-debounced-search'
import { useCallback, useTransition } from 'react'
import Link from 'next/link'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useFormatDate } from '@/lib/use-format-date'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { StatusBadge } from '@/components/status-badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useInfiniteRows } from '@/components/infinite-list/use-infinite-rows'
import {
  InfiniteListCount,
  InfiniteListFooter,
  InfiniteTableFooter,
} from '@/components/infinite-list/infinite-list-footer'
import { getBillingRows } from '@/features/billing/Actions/getBillingRows'
import type { Cursor } from '@/lib/keyset'
import { TableCellLink } from '@/components/table-cell-link'
import {
  Loader2,
  Search,
  DollarSign,
  TrendingUp,
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CheckCircle2,
  Circle,
  EyeOff,
  Receipt,
  Plus,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { deliveryState } from '@/features/billing/Lib/deliveryState'
import { useFormatCurrency } from '@/components/currency-settings-context'
import { useRememberedSort } from '@/hooks/use-remembered-sort'
import { LIST_STATUS_TABS, type ListStatus, rememberListStatus } from '@/lib/list-status-preference'
import { rememberCompletedOnly } from '@/lib/completed-only-preference'
import { ListEmpty } from '@/components/list-empty'
import { vehicleName } from '@/lib/vehicle-name'

interface BillingRecord {
  id: string
  title: string
  invoiceNumber: string | null
  serviceDate: Date
  startDateTime: Date | null
  totalAmount: number
  totalPaid: number
  status: string
  /** When the invoice first reached the customer, by mail or by link. */
  sentAt: string | Date | null
  viewCount: number
  lastViewedAt: string | Date | null
  vehicle: {
    id: string
    make: string
    model: string
    year: number
    licensePlate: string | null
  } | null
  customer: {
    id: string
    name: string
  } | null
}

/** One batch of the list; the first also carries the total and the summary. */
interface BillingBatch {
  rows: BillingRecord[]
  nextCursor: Cursor | null
  total?: number
  summary?: {
    totalRevenue: number
    totalPaid: number
    outstanding: number
    paidCount: number
    unpaidCount: number
    partialCount: number
  }
}

interface BillingClientProps {
  /** The first batch, rendered on the server. */
  data: BillingBatch
  /** The workshop, so one workshop's cached rows never show in another's. */
  listScope?: string
  currencyCode?: string
  search: string
  statusFilter: string
  deliveryFilter: string
  /** Only work orders marked completed. */
  completedOnly?: boolean
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

const STATUS_TITLE_KEYS: Record<ListStatus<'billing'>, string> = {
  all: 'history.statusAll',
  paid: 'history.statusPaid',
  partial: 'history.statusPartial',
  unpaid: 'history.statusUnpaid',
}

const STATUS_TABS = LIST_STATUS_TABS.billing.map((value) => ({
  value,
  titleKey: STATUS_TITLE_KEYS[value],
}))

const NO_SUMMARY = {
  totalRevenue: 0,
  totalPaid: 0,
  outstanding: 0,
  paidCount: 0,
  unpaidCount: 0,
  partialCount: 0,
}

export default function BillingClient({
  data,
  listScope = '',
  currencyCode = DEFAULT_CURRENCY_CODE,
  search,
  statusFilter,
  deliveryFilter,
  completedOnly = false,
  sortBy = '',
  sortOrder = 'desc',
}: BillingClientProps) {
  const formatCurrency = useFormatCurrency()
  const router = useRouter()
  const t = useTranslations('billing')
  const tWorkOrders = useTranslations('workOrders.list')
  const { formatDate } = useFormatDate()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const tableNav = useTableKeyboardNav()
  useRememberedSort('billing')

  // The same filters the page's first batch was read with, so every batch
  // after it continues that list.
  const filters = {
    search: search || undefined,
    status: statusFilter || undefined,
    delivery: deliveryFilter || undefined,
    completedOnly,
    sortBy: sortBy || undefined,
    sortOrder,
  }
  const list = useInfiniteRows<BillingRecord, Cursor, BillingBatch>({
    queryKey: ['billing', listScope, filters],
    initial: data,
    fetchPage: (cursor) => getBillingRows({ ...filters, cursor }),
  })
  const records = list.rows
  const summary = list.firstPage.summary ?? NO_SUMMARY

  const createQueryString = useCallback(
    (params: Record<string, string>) => {
      const newParams = new URLSearchParams(searchParams.toString())
      for (const [key, value] of Object.entries(params)) {
        if (value) {
          newParams.set(key, value)
        } else {
          newParams.delete(key)
        }
      }
      // The list loads more as it scrolls; a page from an old link means nothing.
      newParams.delete('page')
      newParams.delete('pageSize')
      return newParams.toString()
    },
    [searchParams]
  )

  const handleSort = useCallback(
    (column: string) => {
      const newOrder = sortBy === column && sortOrder === 'asc' ? 'desc' : 'asc'
      startTransition(() => {
        router.push(`${pathname}?${createQueryString({ sortBy: column, sortOrder: newOrder })}`)
      })
    },
    [createQueryString, pathname, router, sortBy, sortOrder]
  )

  const SortIcon = ({ column }: { column: string }) => {
    if (sortBy !== column) return <ArrowUpDown className="ml-1 h-3 w-3 opacity-50" />
    return sortOrder === 'asc' ? (
      <ArrowUp className="ml-1 h-3 w-3" />
    ) : (
      <ArrowDown className="ml-1 h-3 w-3" />
    )
  }

  // Remembered as well as put in the URL, like the completed-only switch.
  // "all" stays in the URL too: a bare path means the remembered tab.
  const handleStatusChange = (status: ListStatus<'billing'>) => {
    rememberListStatus('billing', status)
    startTransition(() => {
      router.push(`${pathname}?${createQueryString({ status })}`)
    })
  }

  // Live search: filters as you type, no Enter required. Submitting the
  // form (Enter) commits immediately, bypassing the debounce.
  const {
    value: searchValue,
    setValue: setSearchValue,
    commitNow: handleSearch,
  } = useDebouncedSearch(search, (term) => {
    startTransition(() => {
      router.push(
        `${pathname}?${createQueryString({
          search: term ?? '',
        })}`
      )
    })
  })

  const handleRowClick = (record: BillingRecord) => {
    router.push(
      record.vehicle ? `/vehicles/${record.vehicle.id}/service/${record.id}` : `/sales/${record.id}`
    )
  }

  const fmt = (amount: number) => formatCurrency(amount, currencyCode)

  // Its own axis, kept out of the payment tabs: "unpaid" and "never opened"
  // are different questions and a workshop chasing one often wants both.
  const handleDeliveryToggle = () => {
    startTransition(() => {
      router.push(
        `${pathname}?${createQueryString({
          delivery: deliveryFilter === 'unviewed' ? '' : 'unviewed',
        })}`
      )
    })
  }

  // Remembered in a cookie as well as put in the URL, so the list opens the
  // same way next time without anybody asking for it.
  const handleCompletedToggle = () => {
    const next = !completedOnly
    rememberCompletedOnly('billing', next)
    startTransition(() => {
      router.push(`${pathname}?${createQueryString({ completed: next ? '1' : '0' })}`)
    })
  }

  const getStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case 'paid':
        return (
          <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
            {t('history.statusPaid')}
          </Badge>
        )
      case 'partial':
        return (
          <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
            {t('history.statusPartial')}
          </Badge>
        )
      case 'unpaid':
        return (
          <Badge className="bg-red-100 text-red-800 hover:bg-red-100">
            {t('history.statusUnpaid')}
          </Badge>
        )
      case 'cancelled':
        return (
          <StatusBadge kind="workOrder" status="cancelled">
            {t('history.statusCancelled')}
          </StatusBadge>
        )
      default:
        return <Badge variant="secondary">{status}</Badge>
    }
  }

  /**
   * How far the invoice got to the customer. Payment status answers whether
   * the money arrived; this answers whether the invoice was ever opened, so
   * one that went out days ago and has never been read can be chased.
   *
   * A mail with the PDF attached is read in the mail client and leaves no
   * trace here, so "sent" on those means sent, not unread.
   */
  const getDeliveryBadge = (record: BillingRecord) => {
    const state = deliveryState(record)
    if (state === 'viewed') {
      const seen = record.lastViewedAt ? formatDate(new Date(record.lastViewedAt)) : ''
      return (
        <Badge
          className="bg-sky-100 text-sky-800 hover:bg-sky-100"
          title={seen ? t('history.deliveryViewedOn', { date: seen }) : undefined}
        >
          {t('history.deliveryViewed')}
        </Badge>
      )
    }
    if (state === 'sent') {
      return <Badge variant="outline">{t('history.deliverySent')}</Badge>
    }
    return <span className="text-muted-foreground">{'\u2014'}</span>
  }

  const getBalanceColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'paid':
        return 'text-emerald-600'
      case 'partial':
        return 'text-amber-600'
      case 'unpaid':
        return 'text-red-600'
      default:
        return ''
    }
  }

  // Invoices come from work orders, so the empty list points at making one.
  const emptyState = (bare: boolean) =>
    search ? (
      <p className="p-8 text-center text-sm text-muted-foreground">{t('history.noRecords')}</p>
    ) : (
      <ListEmpty
        bare={bare}
        icon={Receipt}
        title={t('history.noRecords')}
        action={
          <Button onClick={() => router.push('/work-orders?new=1')} className="w-full sm:w-auto">
            <Plus className="mr-1 h-4 w-4" />
            {tWorkOrders('newWorkOrder')}
          </Button>
        }
      />
    )

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      {/* Navigation */}
      <div className="flex shrink-0 items-center gap-3">
        <Button variant="outline" size="sm" disabled>
          {t('history.title')}
        </Button>
        <Link href="/billing/recurring">
          <Button variant="outline" size="sm">
            {t('history.recurring')}
          </Button>
        </Link>
      </div>

      {/* Summary Cards — hidden below md so the invoice list is what a phone
          or portrait tablet opens on. */}
      <div className="hidden shrink-0 gap-3 md:grid md:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 px-4 py-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-500/10">
              <DollarSign className="h-4 w-4 text-blue-600" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">{t('history.totalRevenue')}</p>
              <p className="text-lg font-bold leading-tight">{fmt(summary.totalRevenue)}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-3 px-4 py-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/10">
              <TrendingUp className="h-4 w-4 text-emerald-600" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">{t('history.collected')}</p>
              <p className="text-lg font-bold leading-tight">{fmt(summary.totalPaid)}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-3 px-4 py-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-500/10">
              <AlertCircle className="h-4 w-4 text-red-600" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">{t('history.outstanding')}</p>
              <p className="text-lg font-bold leading-tight">{fmt(summary.outstanding)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Status Tabs and Search */}
      <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* A single scrollable row on phones, so four filters never wrap. */}
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:px-0 sm:pb-0">
          {STATUS_TABS.map((tab) => (
            <Button
              key={tab.value}
              variant={
                statusFilter === tab.value || (tab.value === 'all' && !statusFilter)
                  ? 'default'
                  : 'outline'
              }
              size="sm"
              className="h-9 shrink-0 sm:h-8"
              aria-pressed={statusFilter === tab.value}
              onClick={() => handleStatusChange(tab.value)}
              disabled={isPending}
            >
              {t(tab.titleKey)}
              {tab.value === 'paid' && <span className="ml-1 text-xs">({summary.paidCount})</span>}
              {tab.value === 'partial' && (
                <span className="ml-1 text-xs">({summary.partialCount})</span>
              )}
              {tab.value === 'unpaid' && (
                <span className="ml-1 text-xs">({summary.unpaidCount})</span>
              )}
            </Button>
          ))}
          <Button
            variant={deliveryFilter === 'unviewed' ? 'default' : 'outline'}
            size="sm"
            className="h-9 shrink-0 sm:h-8"
            onClick={handleDeliveryToggle}
            disabled={isPending}
            title={t('history.filterUnviewedHint')}
          >
            <EyeOff className="mr-1 h-3.5 w-3.5" />
            {t('history.filterUnviewed')}
          </Button>
          <Button
            variant={completedOnly ? 'default' : 'outline'}
            size="sm"
            className="h-9 shrink-0 sm:h-8"
            onClick={handleCompletedToggle}
            disabled={isPending}
            aria-pressed={completedOnly}
            title={t('history.filterCompletedHint')}
          >
            {completedOnly ? (
              <CheckCircle2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <Circle className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
            )}
            {t('history.filterCompleted')}
          </Button>
        </div>

        <form onSubmit={handleSearch} className="flex items-center gap-2">
          <InfiniteListCount shown={records.length} total={list.total} />
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t('history.searchPlaceholder')}
              aria-label={t('history.searchPlaceholder')}
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              className="h-9 w-full pl-9 sm:w-[250px]"
              {...tableNav.searchInputProps}
            />
          </div>
          <Button
            type="submit"
            size="sm"
            disabled={isPending}
            aria-label={t('history.search')}
            title={t('history.search')}
            className="h-9 w-9 shrink-0 p-0 md:h-8 md:w-auto md:px-3"
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Search className="h-4 w-4 md:hidden" />
                <span className="hidden md:inline">{t('history.search')}</span>
              </>
            )}
          </Button>
        </form>
      </div>

      {/* Card list (phones + small tablets) - only this scrolls */}
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto md:hidden">
        {records.length === 0
          ? emptyState(false)
          : records.map((record) => {
              // Nothing is owed on a cancelled invoice.
              const balance =
                record.status === 'cancelled' ? 0 : record.totalAmount - record.totalPaid
              return (
                <button
                  key={record.id}
                  type="button"
                  onClick={() => handleRowClick(record)}
                  className="w-full rounded-lg border bg-card p-3 text-left active:bg-muted/50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="min-w-0 flex-1 truncate font-medium">{record.title}</span>
                    <span className="shrink-0 font-semibold">{fmt(record.totalAmount)}</span>
                  </div>
                  <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                    {record.vehicle && (
                      <p className="truncate">
                        {vehicleName(record.vehicle)}
                        {record.vehicle.licensePlate && ` · ${record.vehicle.licensePlate}`}
                      </p>
                    )}
                    {record.customer && <p className="truncate">{record.customer.name}</p>}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
                    {getStatusBadge(record.status)}
                    {getDeliveryBadge(record)}
                    <span className={cn('font-medium', getBalanceColor(record.status))}>
                      {t('history.columnBalance')}: {fmt(balance)}
                    </span>
                    <span className="font-mono text-muted-foreground">
                      {formatDate(new Date(record.serviceDate))}
                    </span>
                    {record.invoiceNumber && (
                      <span className="font-mono text-muted-foreground">
                        {record.invoiceNumber}
                      </span>
                    )}
                  </div>
                </button>
              )
            })}
        {records.length > 0 && <InfiniteListFooter state={list} />}
      </div>

      {/* Table (md and up) - only the rows scroll */}
      <div
        className="@container hidden min-h-0 flex-1 flex-col overflow-hidden rounded-md border md:flex"
        {...tableNav.containerProps}
      >
        <Table containerClassName="min-h-0 flex-1" className="table-fixed">
          <TableHeader sticky>
            <TableRow>
              {/* The title takes what the others leave. The amounts keep room
                  for a seven-figure sum; the rest join as the table widens
                  (customer at about 900px, paid and delivery at 1000px,
                  vehicle at 1300px), and until then the customer or the
                  vehicle is the title's second line. */}
              <TableHead className="w-[104px]">
                <button
                  type="button"
                  className="flex items-center hover:text-foreground"
                  onClick={() => handleSort('invoiceNumber')}
                >
                  {t('history.columnInvoice')}
                  <SortIcon column="invoiceNumber" />
                </button>
              </TableHead>
              <TableHead>
                <button
                  type="button"
                  className="flex items-center hover:text-foreground"
                  onClick={() => handleSort('title')}
                >
                  {t('history.columnTitle')}
                  <SortIcon column="title" />
                </button>
              </TableHead>
              <TableHead className="hidden w-[15%] @7xl:table-cell">
                <button
                  type="button"
                  className="flex items-center hover:text-foreground"
                  onClick={() => handleSort('vehicle')}
                >
                  {t('history.columnVehicle')}
                  <SortIcon column="vehicle" />
                </button>
              </TableHead>
              <TableHead className="hidden w-[20%] @4xl:table-cell">
                <button
                  type="button"
                  className="flex items-center hover:text-foreground"
                  onClick={() => handleSort('customer')}
                >
                  {t('history.columnCustomer')}
                  <SortIcon column="customer" />
                </button>
              </TableHead>
              <TableHead className="w-[100px]">
                <button
                  type="button"
                  className="flex items-center hover:text-foreground"
                  onClick={() => handleSort('date')}
                >
                  {t('history.columnDate')}
                  <SortIcon column="date" />
                </button>
              </TableHead>
              <TableHead className="w-[120px]">
                <button
                  type="button"
                  className="ml-auto flex items-center hover:text-foreground"
                  onClick={() => handleSort('total')}
                >
                  {t('history.columnTotal')}
                  <SortIcon column="total" />
                </button>
              </TableHead>
              <TableHead className="hidden w-[104px] @5xl:table-cell">
                <button
                  type="button"
                  className="flex items-center hover:text-foreground"
                  onClick={() => handleSort('delivery')}
                >
                  {t('history.columnDelivery')}
                  <SortIcon column="delivery" />
                </button>
              </TableHead>
              <TableHead className="hidden w-[120px] text-right @5xl:table-cell">
                {t('history.columnPaid')}
              </TableHead>
              <TableHead className="w-[180px] text-right">{t('history.columnBalance')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="p-0">
                  {emptyState(true)}
                </TableCell>
              </TableRow>
            ) : (
              records.map((record) => {
                // Nothing is owed on a cancelled invoice.
                const balance =
                  record.status === 'cancelled' ? 0 : record.totalAmount - record.totalPaid
                return (
                  <TableRow
                    key={record.id}
                    className="cursor-pointer hover:bg-muted/50"
                    {...interactiveRow(() => handleRowClick(record))}
                  >
                    <TableCell className="truncate font-medium">
                      {record.invoiceNumber || '\u2014'}
                    </TableCell>
                    <TableCell>
                      <p className="truncate">{record.title}</p>
                      {record.customer && (
                        <p className="truncate text-xs text-muted-foreground @4xl:hidden">
                          {record.customer.name}
                        </p>
                      )}
                      {record.vehicle && (
                        <p className="hidden truncate text-xs text-muted-foreground @4xl:block @7xl:hidden">
                          {vehicleName(record.vehicle)}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="hidden truncate @7xl:table-cell">
                      {record.vehicle ? (
                        <TableCellLink href={`/vehicles/${record.vehicle.id}`}>
                          {vehicleName(record.vehicle)}
                        </TableCellLink>
                      ) : (
                        '\u2014'
                      )}
                    </TableCell>
                    <TableCell className="hidden truncate @4xl:table-cell">
                      {record.customer ? (
                        <TableCellLink href={`/customers/${record.customer.id}`}>
                          {record.customer.name}
                        </TableCellLink>
                      ) : (
                        '\u2014'
                      )}
                    </TableCell>
                    <TableCell>{formatDate(new Date(record.serviceDate))}</TableCell>
                    <TableCell className="truncate text-right">{fmt(record.totalAmount)}</TableCell>
                    <TableCell className="hidden @5xl:table-cell">
                      {getDeliveryBadge(record)}
                    </TableCell>
                    <TableCell className="hidden truncate text-right @5xl:table-cell">
                      {fmt(record.totalPaid)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'whitespace-nowrap text-right font-medium',
                        getBalanceColor(record.status)
                      )}
                    >
                      {fmt(balance)}
                      <span className="ml-2 inline-block">{getStatusBadge(record.status)}</span>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
            {records.length > 0 && <InfiniteTableFooter state={list} colSpan={9} />}
          </TableBody>
        </Table>
      </div>

      {/* Loading overlay */}
      {isPending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/50">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}
    </div>
  )
}
