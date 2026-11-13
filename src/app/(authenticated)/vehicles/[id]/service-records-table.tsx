'use client'

import { DEFAULT_CURRENCY_CODE } from '@/lib/currencies'
import { useTableKeyboardNav } from '@/hooks/use-table-keyboard-nav'
import { useDebouncedSearch } from '@/hooks/use-debounced-search'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useCallback, useState, useTransition } from 'react'
import Link from 'next/link'
import { useFormatDate } from '@/lib/use-format-date'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { DataTablePagination } from '@/components/data-table-pagination'
import { StatusLamp, serviceStatusTone, type LampTone } from '@/components/status-lamp'
import { useFormatCurrency } from '@/components/currency-settings-context'
import { getWarrantyStatus, type WarrantyStatus } from '@/lib/warranty'
import { cn } from '@/lib/utils'
import {
  Download,
  ExternalLink,
  Gauge,
  History,
  Loader2,
  Paperclip,
  Search,
  User,
} from 'lucide-react'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import { useServiceLabels } from '@/features/vehicles/Lib/useServiceLabels'

const warrantyBadgeStyles: Record<WarrantyStatus, string> = {
  active: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  expiring: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  expired: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  none: 'bg-muted text-muted-foreground',
}

function WarrantyBadge({ status, t }: { status: WarrantyStatus; t: (key: string) => string }) {
  return (
    <Badge variant="outline" className={`h-5 px-1.5 text-[11px] ${warrantyBadgeStyles[status]}`}>
      {t(`warranty.status.${status}`)}
    </Badge>
  )
}

/** The timeline node of a job still open: filled in its status colour, with a halo. */
const LIVE_NODE: Record<LampTone, string> = {
  slate: 'border-slate-500 bg-slate-500 ring-slate-500/15',
  teal: 'border-teal-600 bg-teal-600 ring-teal-600/15',
  blue: 'border-blue-600 bg-blue-600 ring-blue-600/15',
  violet: 'border-violet-600 bg-violet-600 ring-violet-600/15',
  green: 'border-emerald-600 bg-emerald-600 ring-emerald-600/15',
  amber: 'border-amber-500 bg-amber-500 ring-amber-500/20',
  red: 'border-red-600 bg-red-600 ring-red-600/15',
}

interface ServiceRecordRow {
  id: string
  title: string
  description: string | null
  type: string
  status: string
  cost: number
  mileage: number | null
  serviceDate: Date
  startDateTime: Date | null
  invoiceDate: Date | null
  shopName: string | null
  techName: string | null
  totalAmount: number
  invoiceNumber: string | null
  warrantyMonths: number | null
  warrantyMileage: number | null
  warrantyExpiresAt: Date | null
  warrantyNotes: string | null
  _count: { partItems: number; laborItems: number; attachments: number }
  laborItems?: { description: string }[]
}

interface ServiceRecordsTableProps {
  vehicleId: string
  records: ServiceRecordRow[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  search: string
  type: string
  currencyCode?: string
  vehicleMileage?: number
  /** km, mi or hrs, printed after each visit's reading. */
  distUnit?: string
}

/**
 * The vehicle's work orders as a timeline: when, at what reading, what was
 * done and what it came to, newest first. A job still open is lit in its
 * status colour so it stands out from the history below it.
 */
export function ServiceRecordsTable({
  vehicleId,
  records,
  total,
  page,
  pageSize,
  totalPages,
  search,
  type,
  currencyCode = DEFAULT_CURRENCY_CODE,
  vehicleMileage,
  distUnit,
}: ServiceRecordsTableProps) {
  const formatCurrency = useFormatCurrency()
  const router = useRouter()
  const { formatDate } = useFormatDate()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const tableNav = useTableKeyboardNav<HTMLOListElement>()
  const [navigatingId, setNavigatingId] = useState<string | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const t = useTranslations('vehicles.services')
  const serviceLabel = useServiceLabels()
  const tcm = useTranslations('common.contextMenu')

  const createUrl = useCallback(
    (params: Record<string, string | number | undefined>) => {
      const newParams = new URLSearchParams(searchParams.toString())
      // Always keep tab=services
      newParams.set('tab', 'services')
      for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === '' || value === 'all') {
          newParams.delete(key)
        } else {
          newParams.set(key, String(value))
        }
      }
      // Reset to page 1 when filters change (unless explicitly setting page)
      if (!('page' in params) && ('search' in params || 'type' in params)) {
        newParams.delete('page')
      }
      return `${pathname}?${newParams.toString()}`
    },
    [pathname, searchParams]
  )

  const navigate = useCallback(
    (params: Record<string, string | number | undefined>) => {
      startTransition(() => {
        router.push(createUrl(params))
      })
    },
    [router, createUrl]
  )

  // Live search: filters as you type, no Enter required. Submitting the
  // form (Enter) commits immediately, bypassing the debounce.
  const {
    value: searchInput,
    setValue: setSearchInput,
    commitNow: handleSearch,
  } = useDebouncedSearch(search, (term) => navigate({ search: term }))

  const handleExportPdf = useCallback(async () => {
    setIsExporting(true)
    try {
      const res = await fetch(`/api/protected/vehicles/${vehicleId}/service-history-pdf`)
      if (!res.ok) throw new Error('Failed to generate PDF')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download =
        res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] ||
        'service-history.pdf'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Failed to export service history PDF')
    } finally {
      setIsExporting(false)
    }
  }, [vehicleId])

  const open = (id: string) => {
    setNavigatingId(id)
    router.push(`/vehicles/${vehicleId}/service/${id}`)
  }

  return (
    <section className="overflow-hidden rounded-xl border bg-card">
      {/* Toolbar: search, type and export. Below md the export collapses to an
          icon so the row never wraps or clips on a phone. */}
      <div className="flex flex-col gap-2 border-b px-4 py-3 sm:flex-row sm:items-center">
        <form onSubmit={handleSearch} className="relative w-full sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t('searchPlaceholder')}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="h-9 pl-9"
            {...tableNav.searchInputProps}
          />
        </form>
        <div className="flex items-center gap-2 sm:flex-1">
          <Select
            value={type || 'all'}
            onValueChange={(v) => navigate({ type: v === 'all' ? undefined : v })}
          >
            <SelectTrigger className="h-9 w-[140px] shrink-0">
              <SelectValue placeholder={t('allTypes')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('allTypes')}</SelectItem>
              <SelectItem value="maintenance">{t('maintenance')}</SelectItem>
              <SelectItem value="repair">{t('repair')}</SelectItem>
              <SelectItem value="upgrade">{t('upgrade')}</SelectItem>
              <SelectItem value="inspection">{t('inspection')}</SelectItem>
            </SelectContent>
          </Select>
          {isPending && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />}
          <Button
            size="sm"
            variant="outline"
            onClick={handleExportPdf}
            disabled={isExporting || total === 0}
            aria-label={t('exportServiceHistory')}
            title={t('exportServiceHistory')}
            className="ml-auto h-9 w-9 p-0 md:w-auto md:px-3"
          >
            {isExporting ? (
              <Loader2 className="h-4 w-4 animate-spin md:mr-1 md:h-3.5 md:w-3.5" />
            ) : (
              <Download className="h-4 w-4 md:mr-1 md:h-3.5 md:w-3.5" />
            )}
            <span className="hidden md:inline">{t('exportServiceHistory')}</span>
          </Button>
        </div>
      </div>

      {records.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
          <History className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            {search || type !== 'all' ? t('emptyFiltered') : t('empty')}
          </p>
        </div>
      ) : (
        <ol className="relative px-3 py-3 sm:px-4" {...tableNav.containerProps}>
          {/* The spine the visits hang off, through the middle of the node column. */}
          <span
            aria-hidden
            className="absolute inset-y-0 left-[calc(8.875rem-0.5px)] hidden w-px bg-border md:block"
          />
          {records.map((record) => {
            const displayTotal = record.totalAmount > 0 ? record.totalAmount : record.cost
            const tone = serviceStatusTone(record.status)
            const live = record.status !== 'completed'
            // When the car is in: the booked start, else the day the job was made.
            // The list is sorted by the same date, so the timeline reads in order.
            const date = formatDate(new Date(record.startDateTime ?? record.serviceDate))
            const reading = record.mileage
              ? `${record.mileage.toLocaleString()}${distUnit ? ` ${distUnit}` : ''}`
              : null
            const warranty = getWarrantyStatus(
              record.warrantyExpiresAt,
              record.warrantyMileage,
              record.mileage,
              vehicleMileage
            )
            const summary = record.laborItems?.[0]?.description
            return (
              <li
                key={record.id}
                className="grid gap-x-3 py-1.5 md:grid-cols-[6.5rem_1.25rem_minmax(0,1fr)]"
              >
                <div className="hidden pt-3 text-right md:block">
                  <div className="text-[13px] font-semibold leading-tight">{date}</div>
                  {reading && (
                    <div className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                      {reading}
                    </div>
                  )}
                </div>
                <div className="hidden justify-center pt-[17px] md:flex">
                  <span
                    aria-hidden
                    className={cn(
                      'relative z-10 size-3 rounded-full border-2',
                      live ? `ring-4 ${LIVE_NODE[tone]}` : 'border-muted-foreground/45 bg-card'
                    )}
                  />
                </div>
                <ContextMenu modal={false}>
                  <ContextMenuTrigger asChild>
                    <Link
                      href={`/vehicles/${vehicleId}/service/${record.id}`}
                      onClick={() => setNavigatingId(record.id)}
                      data-row-interactive
                      className={cn(
                        'block min-w-0 rounded-lg border bg-card px-4 py-3 outline-none transition-colors hover:border-foreground/20 hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring',
                        navigatingId === record.id && 'opacity-60'
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 items-baseline gap-2">
                            {record.invoiceNumber && (
                              <span className="shrink-0 font-mono text-xs text-muted-foreground">
                                {record.invoiceNumber}
                              </span>
                            )}
                            <span className="truncate font-medium">{record.title}</span>
                          </div>
                          {summary && summary !== record.title && (
                            <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
                              {summary.slice(0, 140)}
                            </p>
                          )}
                        </div>
                        <span className="inline-flex shrink-0 items-center gap-1.5 font-semibold tabular-nums">
                          {navigatingId === record.id && (
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                          )}
                          {formatCurrency(displayTotal, currencyCode)}
                        </span>
                      </div>
                      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                        <StatusLamp tone={tone} className="text-xs">
                          {serviceLabel.status(record.status)}
                        </StatusLamp>
                        <span>{serviceLabel.type(record.type)}</span>
                        <span className="font-mono md:hidden">{date}</span>
                        {reading && (
                          <span className="inline-flex items-center gap-1 tabular-nums md:hidden">
                            <Gauge className="h-3 w-3" />
                            {reading}
                          </span>
                        )}
                        {record.techName && (
                          <span className="inline-flex min-w-0 items-center gap-1">
                            <User className="h-3 w-3 shrink-0" />
                            <span className="truncate">{record.techName}</span>
                          </span>
                        )}
                        {record._count.attachments > 0 && (
                          <span className="inline-flex items-center gap-1" title={t('table.files')}>
                            <Paperclip className="h-3 w-3" />
                            {record._count.attachments}
                          </span>
                        )}
                        {warranty !== 'none' && <WarrantyBadge status={warranty} t={t} />}
                      </div>
                    </Link>
                  </ContextMenuTrigger>
                  <ContextMenuContent className="min-w-52">
                    <ContextMenuItem onClick={() => open(record.id)}>
                      <ExternalLink className="mr-2 h-4 w-4" />
                      {tcm('open')}
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              </li>
            )
          })}
        </ol>
      )}

      {total > 0 && (
        <div className="border-t px-4 py-3">
          <DataTablePagination
            total={total}
            page={page}
            pageSize={pageSize}
            totalPages={totalPages}
            pageParam="page"
            pageSizeParam="pageSize"
            pageSizes={['5', '10', '20', '50']}
            onNavigate={navigate}
          />
        </div>
      )}
    </section>
  )
}
