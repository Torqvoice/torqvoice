'use client'

import { DEFAULT_CURRENCY_CODE } from '@/lib/currencies'
import { useTableKeyboardNav } from '@/hooks/use-table-keyboard-nav'
import { interactiveRow } from '@/lib/interactive-row'
import { useDebouncedSearch } from '@/hooks/use-debounced-search'
import { Fragment, useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
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
import { type ServerBatch, useInfiniteRows } from '@/components/infinite-list/use-infinite-rows'
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
  FileText,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { deliveryState } from '@/features/billing/Lib/deliveryState'
import { useFormatCurrency } from '@/components/currency-settings-context'
import { useRememberedSort } from '@/hooks/use-remembered-sort'
import { LIST_STATUS_TABS, type ListStatus, rememberListStatus } from '@/lib/list-status-preference'
import { rememberCompletedOnly } from '@/lib/completed-only-preference'
import { ListEmpty } from '@/components/list-empty'
import { vehicleName } from '@/lib/vehicle-name'
import { BillingDateRange, type DayRange } from '@/features/billing/Components/BillingDateRange'
import {
  BILLING_COLUMN_KEYS,
  BillingColumnsMenu,
  BillingGroupMenu,
} from '@/features/billing/Components/BillingViewMenus'
import { GenerateReportDialog } from '@/features/billing/Components/GenerateReportDialog'
import { BREAKPOINT_CLASS, fittingColumns } from '@/features/billing/Lib/billingColumnFit'
import { rememberBillingColumns } from '@/features/billing/Lib/billingColumnsCookie'
import { daysBetween, monthName } from '@/features/billing/Lib/billingReportModel'
import { useDateSettings } from '@/components/date-settings-context'
import { zonedDayKey } from '@/lib/timezone'
import { workshopTodayKey } from '@/lib/workshop-datetime'
import {
  type BillingColumn,
  type BillingGroupBy,
  billingRowGroupKey,
  DEFAULT_BILLING_COLUMNS,
} from '@/features/billing/Schema/billingListSchema'

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
  /** YYYY-MM of the shown date on the workshop's calendar. */
  month: string | null
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

interface GroupTotals {
  count: number
  invoiced: number
  paid: number
  outstanding: number
}

/** One batch of the list; the first also carries the total and the summary. */
interface BillingBatch {
  rows: BillingRecord[]
  nextCursor: Cursor | null
  total?: number
  /** Subtotals of the groups this batch's rows fall in, when the list is grouped. */
  groups?: Record<string, GroupTotals>
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
  data: ServerBatch<BillingBatch>
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
  /** First and last invoice day (YYYY-MM-DD), empty for an open end. */
  from?: string
  to?: string
  groupBy?: BillingGroupBy | ''
  /** The columns this browser chose. */
  columns?: BillingColumn[]
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
  from = '',
  to = '',
  groupBy = '',
  columns: initialColumns = DEFAULT_BILLING_COLUMNS,
}: BillingClientProps) {
  const formatCurrency = useFormatCurrency()
  const router = useRouter()
  const t = useTranslations('billing')
  const tWorkOrders = useTranslations('workOrders.list')
  const locale = useLocale()
  const { formatDate, formatDay } = useFormatDate()
  const { timezone } = useDateSettings()
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
    from: from || undefined,
    to: to || undefined,
    groupBy: groupBy || undefined,
  }
  const list = useInfiniteRows<BillingRecord, Cursor, BillingBatch>({
    queryKey: ['billing', listScope, filters],
    initial: data,
    fetchPage: (cursor) => getBillingRows({ ...filters, cursor }),
  })
  const records = list.rows
  const summary = list.firstPage.summary ?? NO_SUMMARY

  // Each batch brings the subtotals of the groups its rows fall in.
  const groupTotals = useMemo(
    () =>
      Object.assign({}, ...list.pages.map((page) => page.groups ?? {})) as Record<
        string,
        GroupTotals
      >,
    [list.pages]
  )

  // Chosen per browser and remembered, like the sort; the report prints the same.
  const [columns, setColumns] = useState<BillingColumn[]>(initialColumns)
  const show = new Set(columns)
  const handleColumnsChange = (next: BillingColumn[]) => {
    setColumns(next)
    rememberBillingColumns(next)
  }
  const [reportOpen, setReportOpen] = useState(false)

  const [tableWidth, setTableWidth] = useState<number | null>(null)
  const tableRef = tableNav.containerProps.ref
  useEffect(() => {
    const el = tableRef.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setTableWidth(entry.contentRect.width))
    observer.observe(el)
    return () => observer.disconnect()
  }, [tableRef])
  const fitting = tableWidth === null ? null : fittingColumns(columns, tableWidth)
  const spanColumns = fitting ? fitting.size : columns.length
  /** A column's cell class: hidden when it does not fit (or, before measuring, by breakpoint). */
  const fit = (column: BillingColumn) =>
    fitting ? (fitting.has(column) ? '' : 'hidden') : (BREAKPOINT_CLASS[column] ?? '')
  // A column that made way shows under the title instead: the customer, else the vehicle.
  const customerUnderTitle = fitting
    ? show.has('customer') && !fitting.has('customer')
      ? ''
      : 'hidden'
    : '@4xl:hidden'
  const vehicleUnderTitle = fitting
    ? show.has('vehicle') && !fitting.has('vehicle') && customerUnderTitle === 'hidden'
      ? ''
      : 'hidden'
    : 'hidden @4xl:block @7xl:hidden'

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

  const handleDateRange = (range: DayRange | null) => {
    startTransition(() => {
      router.push(
        `${pathname}?${createQueryString({ from: range?.from ?? '', to: range?.to ?? '' })}`
      )
    })
  }

  const handleGroupBy = (next: BillingGroupBy | '') => {
    startTransition(() => {
      router.push(`${pathname}?${createQueryString({ group: next })}`)
    })
  }

  const groupLabel = (record: BillingRecord) => {
    if (groupBy === 'customer') return record.customer?.name || t('report.noCustomer')
    if (groupBy === 'month')
      return record.month ? monthName(record.month, locale) : t('report.noDate')
    return t(`report.status.${record.status}`)
  }

  /** The record's group key when it opens a new group in the list, else null. */
  const groupStart = (record: BillingRecord, index: number) => {
    if (!groupBy) return null
    const key = billingRowGroupKey(record, groupBy)
    const previous = records[index - 1]
    return previous && billingRowGroupKey(previous, groupBy) === key ? null : key
  }

  // What the list is showing, in words, for the report dialog.
  const viewDescription = [
    t(STATUS_TITLE_KEYS[(statusFilter || 'all') as ListStatus<'billing'>] ?? 'history.statusAll'),
    from || to
      ? `${from ? formatDay(from) : ''} – ${to ? formatDay(to) : ''}`.trim()
      : t('history.allDates'),
    deliveryFilter === 'unviewed' ? t('history.filterUnviewed') : '',
    completedOnly ? t('history.filterCompleted') : '',
    search ? `"${search}"` : '',
    groupBy ? `${t('history.groupBy')}: ${t(`report.groupBy.${groupBy}`)}` : '',
  ]
    .filter(Boolean)
    .join(' · ')

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

  // Days since the shown date, on the workshop's calendar.
  const today = workshopTodayKey(timezone || '')
  const ageDays = (record: BillingRecord) =>
    Math.max(0, daysBetween(zonedDayKey(new Date(record.serviceDate), timezone || 'UTC'), today))

  const groupHeading = (record: BillingRecord, key: string) => {
    const totals = groupTotals[key]
    return {
      label: groupLabel(record),
      count: totals ? t('report.invoiceCount', { count: totals.count }) : '',
      sums: totals
        ? t('history.groupSums', {
            invoiced: fmt(totals.invoiced),
            paid: fmt(totals.paid),
            outstanding: fmt(totals.outstanding),
          })
        : '',
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
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2">
        <Button variant="outline" size="sm" disabled>
          {t('history.title')}
        </Button>
        <Link href="/billing/recurring">
          <Button variant="outline" size="sm">
            {t('history.recurring')}
          </Button>
        </Link>
        {/* The view: which invoice days, how they are grouped, which columns,
            and a report of exactly that. Its own line on a phone. */}
        <div className="flex w-full min-w-0 items-center gap-2 sm:ml-auto sm:w-auto">
          <BillingDateRange
            from={from}
            to={to}
            onChange={handleDateRange}
            disabled={isPending}
            className="flex-1 sm:flex-none"
          />
          <BillingGroupMenu groupBy={groupBy} onChange={handleGroupBy} disabled={isPending} />
          <BillingColumnsMenu columns={columns} onChange={handleColumnsChange} />
          <Button
            size="sm"
            className="h-9 shrink-0 sm:h-8"
            onClick={() => setReportOpen(true)}
            aria-label={t('report.generate')}
          >
            <FileText className="h-3.5 w-3.5" />
            <span className="sm:hidden">{t('report.generateShort')}</span>
            <span className="hidden sm:inline">{t('report.generate')}</span>
          </Button>
        </div>
      </div>
      <GenerateReportDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        filters={filters}
        columns={columns}
        count={list.total}
        description={viewDescription}
      />

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
          : records.map((record, index) => {
              // Nothing is owed on a cancelled invoice.
              const balance =
                record.status === 'cancelled' ? 0 : record.totalAmount - record.totalPaid
              const groupKey = groupStart(record, index)
              const heading = groupKey === null ? null : groupHeading(record, groupKey)
              return (
                <Fragment key={record.id}>
                  {heading && (
                    <div className="px-1 pt-3 first:pt-0">
                      <p className="truncate text-sm font-semibold">
                        {heading.label}
                        {heading.count && (
                          <span className="font-normal text-muted-foreground">
                            {' '}
                            · {heading.count}
                          </span>
                        )}
                      </p>
                      {heading.sums && (
                        <p className="truncate text-xs text-muted-foreground">{heading.sums}</p>
                      )}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => handleRowClick(record)}
                    className="w-full rounded-lg border bg-card p-3 text-left active:bg-muted/50"
                  >
                    {/* The chosen columns only, as on the table and in the report. */}
                    <div className="flex items-start justify-between gap-3">
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {show.has('title')
                          ? record.title
                          : show.has('invoice')
                            ? record.invoiceNumber || '\u2014'
                            : (record.customer?.name ?? '\u2014')}
                      </span>
                      {show.has('total') && (
                        <span className="shrink-0 font-semibold">{fmt(record.totalAmount)}</span>
                      )}
                    </div>
                    <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                      {(show.has('vehicle') || show.has('plate')) && record.vehicle && (
                        <p className="truncate">
                          {[
                            show.has('vehicle') && vehicleName(record.vehicle),
                            show.has('plate') && record.vehicle.licensePlate,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      )}
                      {show.has('customer') &&
                        (show.has('title') || show.has('invoice')) &&
                        record.customer && <p className="truncate">{record.customer.name}</p>}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
                      {show.has('status') && getStatusBadge(record.status)}
                      {show.has('delivery') && getDeliveryBadge(record)}
                      {show.has('paid') && (
                        <span className="text-muted-foreground">
                          {t(BILLING_COLUMN_KEYS.paid)}: {fmt(record.totalPaid)}
                        </span>
                      )}
                      {show.has('balance') && (
                        <span className={cn('font-medium', getBalanceColor(record.status))}>
                          {t('history.columnBalance')}: {fmt(balance)}
                        </span>
                      )}
                      {show.has('date') && (
                        <span className="font-mono text-muted-foreground">
                          {formatDate(new Date(record.serviceDate))}
                        </span>
                      )}
                      {show.has('age') && (
                        <span className="text-muted-foreground">
                          {t(BILLING_COLUMN_KEYS.age)}: {ageDays(record)}
                        </span>
                      )}
                      {show.has('invoice') && show.has('title') && record.invoiceNumber && (
                        <span className="font-mono text-muted-foreground">
                          {record.invoiceNumber}
                        </span>
                      )}
                    </div>
                  </button>
                </Fragment>
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
                  while they fit (see fittingColumns), and a column that made
                  way, the customer or else the vehicle, is the title's second
                  line. Columns left out in the Columns menu never show. */}
              {show.has('invoice') && (
                <TableHead className="w-[104px]">
                  <button
                    type="button"
                    className="flex items-center hover:text-foreground"
                    onClick={() => handleSort('invoiceNumber')}
                  >
                    {t(BILLING_COLUMN_KEYS.invoice)}
                    <SortIcon column="invoiceNumber" />
                  </button>
                </TableHead>
              )}
              {show.has('title') && (
                <TableHead className="">
                  <button
                    type="button"
                    className="flex items-center hover:text-foreground"
                    onClick={() => handleSort('title')}
                  >
                    {t(BILLING_COLUMN_KEYS.title)}
                    <SortIcon column="title" />
                  </button>
                </TableHead>
              )}
              {show.has('vehicle') && (
                <TableHead className={cn('w-[15%]', fit('vehicle'))}>
                  <button
                    type="button"
                    className="flex items-center hover:text-foreground"
                    onClick={() => handleSort('vehicle')}
                  >
                    {t(BILLING_COLUMN_KEYS.vehicle)}
                    <SortIcon column="vehicle" />
                  </button>
                </TableHead>
              )}
              {show.has('plate') && (
                <TableHead className={cn('w-[96px]', fit('plate'))}>
                  {t(BILLING_COLUMN_KEYS.plate)}
                </TableHead>
              )}
              {show.has('customer') && (
                <TableHead className={cn('w-[18%]', fit('customer'))}>
                  <button
                    type="button"
                    className="flex items-center hover:text-foreground"
                    onClick={() => handleSort('customer')}
                  >
                    {t(BILLING_COLUMN_KEYS.customer)}
                    <SortIcon column="customer" />
                  </button>
                </TableHead>
              )}
              {show.has('date') && (
                <TableHead className="w-[100px]">
                  <button
                    type="button"
                    className="flex items-center hover:text-foreground"
                    onClick={() => handleSort('date')}
                  >
                    {t(BILLING_COLUMN_KEYS.date)}
                    <SortIcon column="date" />
                  </button>
                </TableHead>
              )}
              {show.has('age') && (
                <TableHead className={cn('w-[96px] text-right', fit('age'))}>
                  {t(BILLING_COLUMN_KEYS.age)}
                </TableHead>
              )}
              {show.has('total') && (
                <TableHead className="w-[120px]">
                  <button
                    type="button"
                    className="ml-auto flex items-center hover:text-foreground"
                    onClick={() => handleSort('total')}
                  >
                    {t(BILLING_COLUMN_KEYS.total)}
                    <SortIcon column="total" />
                  </button>
                </TableHead>
              )}
              {show.has('delivery') && (
                <TableHead className={cn('w-[96px]', fit('delivery'))}>
                  <button
                    type="button"
                    className="flex items-center hover:text-foreground"
                    onClick={() => handleSort('delivery')}
                  >
                    {t(BILLING_COLUMN_KEYS.delivery)}
                    <SortIcon column="delivery" />
                  </button>
                </TableHead>
              )}
              {show.has('paid') && (
                <TableHead className={cn('w-[120px] text-right', fit('paid'))}>
                  {t(BILLING_COLUMN_KEYS.paid)}
                </TableHead>
              )}
              {show.has('balance') && (
                <TableHead className="w-[120px] text-right">
                  {t(BILLING_COLUMN_KEYS.balance)}
                </TableHead>
              )}
              {show.has('status') && (
                <TableHead className={cn('w-[96px]', fit('status'))}>
                  {t(BILLING_COLUMN_KEYS.status)}
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.length === 0 ? (
              <TableRow>
                <TableCell colSpan={spanColumns} className="p-0">
                  {emptyState(true)}
                </TableCell>
              </TableRow>
            ) : (
              records.map((record, index) => {
                // Nothing is owed on a cancelled invoice.
                const balance =
                  record.status === 'cancelled' ? 0 : record.totalAmount - record.totalPaid
                const groupKey = groupStart(record, index)
                const heading = groupKey === null ? null : groupHeading(record, groupKey)
                return (
                  <Fragment key={record.id}>
                    {heading && (
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableCell colSpan={spanColumns} className="py-2">
                          <div className="flex items-baseline justify-between gap-4">
                            <span className="truncate font-semibold">
                              {heading.label}
                              {heading.count && (
                                <span className="font-normal text-muted-foreground">
                                  {' '}
                                  · {heading.count}
                                </span>
                              )}
                            </span>
                            <span className="shrink-0 truncate text-xs text-muted-foreground">
                              {heading.sums}
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                    <TableRow
                      className="cursor-pointer hover:bg-muted/50"
                      {...interactiveRow(() => handleRowClick(record))}
                    >
                      {show.has('invoice') && (
                        <TableCell className="truncate font-medium">
                          {record.invoiceNumber || '\u2014'}
                        </TableCell>
                      )}
                      {show.has('title') && (
                        <TableCell>
                          <p className="truncate">{record.title}</p>
                          {show.has('customer') && record.customer && (
                            <p
                              className={cn(
                                'truncate text-xs text-muted-foreground',
                                customerUnderTitle
                              )}
                            >
                              {record.customer.name}
                            </p>
                          )}
                          {show.has('vehicle') && record.vehicle && (
                            <p
                              className={cn(
                                'truncate text-xs text-muted-foreground',
                                vehicleUnderTitle
                              )}
                            >
                              {vehicleName(record.vehicle)}
                            </p>
                          )}
                        </TableCell>
                      )}
                      {show.has('vehicle') && (
                        <TableCell className={cn('truncate', fit('vehicle'))}>
                          {record.vehicle ? (
                            <TableCellLink href={`/vehicles/${record.vehicle.id}`}>
                              {vehicleName(record.vehicle)}
                            </TableCellLink>
                          ) : (
                            '\u2014'
                          )}
                        </TableCell>
                      )}
                      {show.has('plate') && (
                        <TableCell className={cn('truncate font-mono text-xs', fit('plate'))}>
                          {record.vehicle?.licensePlate || '\u2014'}
                        </TableCell>
                      )}
                      {show.has('customer') && (
                        <TableCell className={cn('truncate', fit('customer'))}>
                          {record.customer ? (
                            <TableCellLink href={`/customers/${record.customer.id}`}>
                              {record.customer.name}
                            </TableCellLink>
                          ) : (
                            '\u2014'
                          )}
                        </TableCell>
                      )}
                      {show.has('date') && (
                        <TableCell>{formatDate(new Date(record.serviceDate))}</TableCell>
                      )}
                      {show.has('age') && (
                        <TableCell className={cn('text-right tabular-nums', fit('age'))}>
                          {ageDays(record)}
                        </TableCell>
                      )}
                      {show.has('total') && (
                        <TableCell className="truncate text-right">
                          {fmt(record.totalAmount)}
                        </TableCell>
                      )}
                      {show.has('delivery') && (
                        <TableCell className={fit('delivery')}>
                          {getDeliveryBadge(record)}
                        </TableCell>
                      )}
                      {show.has('paid') && (
                        <TableCell className={cn('truncate text-right', fit('paid'))}>
                          {fmt(record.totalPaid)}
                        </TableCell>
                      )}
                      {show.has('balance') && (
                        <TableCell
                          className={cn(
                            'whitespace-nowrap text-right font-medium',
                            getBalanceColor(record.status)
                          )}
                        >
                          {fmt(balance)}
                        </TableCell>
                      )}
                      {show.has('status') && (
                        <TableCell className={fit('status')}>
                          {getStatusBadge(record.status)}
                        </TableCell>
                      )}
                    </TableRow>
                  </Fragment>
                )
              })
            )}
            {records.length > 0 && <InfiniteTableFooter state={list} colSpan={spanColumns} />}
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
