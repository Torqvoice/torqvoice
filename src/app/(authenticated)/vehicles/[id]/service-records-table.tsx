'use client'

import { useTableKeyboardNav } from '@/hooks/use-table-keyboard-nav'
import { interactiveRow } from '@/lib/interactive-row'
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
import { typeColors, statusColors } from '@/lib/table-utils'
import { useFormatCurrency } from '@/components/currency-settings-context'
import { getWarrantyStatus, type WarrantyStatus } from '@/lib/warranty'
import { effectiveInvoiceDate } from '@/lib/invoice-utils'
import { Download, ExternalLink, Gauge, Loader2, Paperclip, Plus, Search, User } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import { useServiceType } from '@/components/service-type-context'

const warrantyBadgeStyles: Record<WarrantyStatus, string> = {
  active: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  expiring: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  expired: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  none: 'bg-muted text-muted-foreground',
}

function WarrantyBadge({ status, t }: { status: WarrantyStatus; t: (key: string) => string }) {
  return (
    <Badge variant="outline" className={`text-xs ${warrantyBadgeStyles[status]}`}>
      {t(`warranty.status.${status}`)}
    </Badge>
  )
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
}

export function ServiceRecordsTable({
  vehicleId,
  records,
  total,
  page,
  pageSize,
  totalPages,
  search,
  type,
  currencyCode = 'USD',
  vehicleMileage,
}: ServiceRecordsTableProps) {
  const formatCurrency = useFormatCurrency()
  const router = useRouter()
  const { formatDate } = useFormatDate()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const tableNav = useTableKeyboardNav()
  const [navigatingId, setNavigatingId] = useState<string | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const t = useTranslations('vehicles.services')
  const tcm = useTranslations('common.contextMenu')
  const serviceType = useServiceType()

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

  return (
    <div className="space-y-4">
      {/* Toolbar: Search + Filters + Add. Below md the actions collapse to
          icon-only buttons so the row never wraps or clips on a phone. */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <form onSubmit={handleSearch} className="relative w-full sm:max-w-sm">
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
            <SelectTrigger className="h-9 w-[130px] shrink-0 sm:w-[140px]">
              <SelectValue placeholder="All types" />
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
            className="ml-auto h-9 w-9 p-0 md:h-8 md:w-auto md:px-3"
          >
            {isExporting ? (
              <Loader2 className="h-4 w-4 animate-spin md:mr-1 md:h-3.5 md:w-3.5" />
            ) : (
              <Download className="h-4 w-4 md:mr-1 md:h-3.5 md:w-3.5" />
            )}
            <span className="hidden md:inline">{t('exportServiceHistory')}</span>
          </Button>
          <Button asChild size="sm" className="h-9 w-9 p-0 md:h-8 md:w-auto md:px-3">
            <Link
              href={`/vehicles/${vehicleId}/service/new`}
              aria-label={t('newWorkOrder')}
              title={t('newWorkOrder')}
            >
              <Plus className="h-4 w-4 md:mr-1 md:h-3.5 md:w-3.5" />
              <span className="hidden md:inline">{t('newWorkOrder')}</span>
            </Link>
          </Button>
        </div>
      </div>

      {/* Card list (phones + small tablets) */}
      <div className="space-y-2 md:hidden">
        {records.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            {search || type !== 'all' ? t('emptyFiltered') : t('empty')}
          </div>
        ) : (
          records.map((record) => {
            const displayTotal = record.totalAmount > 0 ? record.totalAmount : record.cost
            const warranty = getWarrantyStatus(
              record.warrantyExpiresAt,
              record.warrantyMileage,
              record.mileage,
              vehicleMileage
            )
            return (
              <button
                key={record.id}
                type="button"
                onClick={() => {
                  setNavigatingId(record.id)
                  router.push(`/vehicles/${vehicleId}/service/${record.id}`)
                }}
                className={`w-full rounded-lg border bg-card p-3 text-left transition-opacity active:bg-muted/50 ${
                  navigatingId === record.id ? 'opacity-50' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{record.title}</p>
                    {record.invoiceNumber && (
                      <p className="font-mono text-xs text-muted-foreground">
                        {record.invoiceNumber}
                      </p>
                    )}
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1.5 font-semibold">
                    {navigatingId === record.id && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                    )}
                    {formatCurrency(displayTotal, currencyCode)}
                  </span>
                </div>

                {record.laborItems?.[0]?.description && (
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {record.laborItems[0].description.slice(0, 100)}
                  </p>
                )}

                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline" className={`text-xs ${typeColors[record.type] || ''}`}>
                    {record.type}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={`text-xs ${statusColors[record.status] || ''}`}
                  >
                    {record.status}
                  </Badge>
                  {warranty !== 'none' && <WarrantyBadge status={warranty} t={t} />}
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="font-mono">{formatDate(effectiveInvoiceDate(record))}</span>
                  {record.mileage ? (
                    <span className="inline-flex items-center gap-1">
                      <Gauge className="h-3 w-3" />
                      {record.mileage.toLocaleString()}
                    </span>
                  ) : null}
                  {record.techName && (
                    <span className="inline-flex min-w-0 items-center gap-1">
                      <User className="h-3 w-3 shrink-0" />
                      <span className="truncate">{record.techName}</span>
                    </span>
                  )}
                  {record._count.attachments > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <Paperclip className="h-3 w-3" />
                      {record._count.attachments}
                    </span>
                  )}
                </div>
              </button>
            )
          })
        )}
      </div>

      {/* Table (md and up) */}
      <div className="hidden rounded-lg border md:block" {...tableNav.containerProps}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[100px]">{t('table.date')}</TableHead>
              <TableHead>{t('table.title')}</TableHead>
              <TableHead className="w-[100px]">{t('table.type')}</TableHead>
              <TableHead className="w-[100px]">{t('table.status')}</TableHead>
              <TableHead className="w-[100px] text-right">
                {serviceType === 'marine' ? t('table.mileageMarine') : t('table.mileage')}
              </TableHead>
              <TableHead className="hidden w-[120px] sm:table-cell">
                {t('table.technician')}
              </TableHead>
              <TableHead className="w-[50px] text-center">{t('table.files')}</TableHead>
              <TableHead className="w-[100px] text-right">{t('table.total')}</TableHead>
              <TableHead className="w-[90px] text-right">{t('table.warranty')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="h-32 text-center text-muted-foreground">
                  {search || type !== 'all' ? t('emptyFiltered') : t('empty')}
                </TableCell>
              </TableRow>
            ) : (
              records.map((record) => {
                const displayTotal = record.totalAmount > 0 ? record.totalAmount : record.cost
                return (
                  <ContextMenu key={record.id} modal={false}>
                    <ContextMenuTrigger asChild>
                      <TableRow
                        className={`cursor-pointer transition-opacity ${navigatingId === record.id ? 'opacity-50' : ''}`}
                        {...interactiveRow(() => {
                          setNavigatingId(record.id)
                          router.push(`/vehicles/${vehicleId}/service/${record.id}`)
                        })}
                      >
                        <TableCell className="font-mono text-xs">
                          {formatDate(effectiveInvoiceDate(record))}
                        </TableCell>
                        <TableCell className="max-w-0">
                          <div className="truncate">
                            <span className="font-medium">{record.title}</span>
                            {record.invoiceNumber && (
                              <span className="ml-2 font-mono text-xs text-muted-foreground">
                                {record.invoiceNumber}
                              </span>
                            )}
                          </div>
                          {record.laborItems?.[0]?.description && (
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">
                              {record.laborItems[0].description.slice(0, 100)}
                            </p>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`text-xs ${typeColors[record.type] || ''}`}
                          >
                            {record.type}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`text-xs ${statusColors[record.status] || ''}`}
                          >
                            {record.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {record.mileage ? record.mileage.toLocaleString() : '-'}
                        </TableCell>
                        <TableCell className="hidden text-sm sm:table-cell">
                          {record.techName || '-'}
                        </TableCell>
                        <TableCell className="text-center">
                          {record._count.attachments > 0 && (
                            <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
                              <Paperclip className="h-3 w-3" />
                              {record._count.attachments}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          <span className="inline-flex items-center gap-2">
                            {navigatingId === record.id && (
                              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                            )}
                            {formatCurrency(displayTotal, currencyCode)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <WarrantyBadge
                            status={getWarrantyStatus(
                              record.warrantyExpiresAt,
                              record.warrantyMileage,
                              record.mileage,
                              vehicleMileage
                            )}
                            t={t}
                          />
                        </TableCell>
                      </TableRow>
                    </ContextMenuTrigger>
                    <ContextMenuContent className="min-w-52">
                      <ContextMenuItem
                        onClick={() => {
                          setNavigatingId(record.id)
                          router.push(`/vehicles/${vehicleId}/service/${record.id}`)
                        }}
                      >
                        <ExternalLink className="mr-2 h-4 w-4" />
                        {tcm('open')}
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
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
  )
}
