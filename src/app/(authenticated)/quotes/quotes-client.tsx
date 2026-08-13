'use client'

import { useDebouncedSearch } from '@/hooks/use-debounced-search';

import { useState, useCallback, useTransition, useEffect } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
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
import { ArrowDown, ArrowUp, ArrowUpDown, Car, ExternalLink, Loader2, Plus, Search, User } from 'lucide-react'
import { useFormatCurrency } from '@/components/currency-settings-context'
import { NewQuoteDialog } from '@/features/quotes/Components/NewQuoteDialog'

interface QuoteRecord {
  id: string
  quoteNumber: string | null
  title: string
  status: string
  totalAmount: number
  createdAt: Date
  validUntil: Date | null
  customer: { id: string; name: string } | null
  vehicle: {
    id: string
    make: string
    model: string
    year: number
    licensePlate: string | null
  } | null
}

interface PaginatedData {
  records: QuoteRecord[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  statusCounts: Record<string, number>
}

const statusTabs = [
  { key: 'all', titleKey: 'list.statusAll' },
  { key: 'draft', titleKey: 'list.statusDraft' },
  { key: 'sent', titleKey: 'list.statusSent' },
  { key: 'accepted', titleKey: 'list.statusAccepted' },
  { key: 'rejected', titleKey: 'list.statusRejected' },
  { key: 'converted', titleKey: 'list.statusConverted' },
] as const

const statusColors: Record<string, string> = {
  draft: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
  sent: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  accepted: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  rejected: 'bg-red-500/10 text-red-500 border-red-500/20',
  expired: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  converted: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
}

export function QuotesClient({
  data,
  currencyCode = 'USD',
  search,
  statusFilter,
  sortBy = '',
  sortOrder = 'desc',
}: {
  data: PaginatedData
  currencyCode?: string
  search: string
  statusFilter: string
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}) {
  const formatCurrency = useFormatCurrency()
  const router = useRouter()
  const { formatDate } = useFormatDate()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const t = useTranslations('quotes')
  const tcm = useTranslations('common.contextMenu')

  // New quote dialog state
  const [showNewDialog, setShowNewDialog] = useState(false)

  useEffect(() => {
    if (searchParams.get('create') === 'true') {
      setShowNewDialog(true)
      const params = new URLSearchParams(searchParams.toString())
      params.delete('create')
      const cleanUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname
      window.history.replaceState(null, '', cleanUrl)
    }
  }, [searchParams, pathname])

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
  } = useDebouncedSearch(search, (term) => navigate({ search: term }));

  const openNewDialog = () => setShowNewDialog(true)

  const handleSort = useCallback(
    (column: string) => {
      const newOrder = sortBy === column && sortOrder === 'asc' ? 'desc' : 'asc'
      navigate({ sortBy: column, sortOrder: newOrder })
    },
    [navigate, sortBy, sortOrder]
  )

  const SortIcon = ({ column }: { column: string }) => {
    if (sortBy !== column) return <ArrowUpDown className="ml-1 h-3 w-3 opacity-50" />
    return sortOrder === 'asc'
      ? <ArrowUp className="ml-1 h-3 w-3" />
      : <ArrowDown className="ml-1 h-3 w-3" />
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {statusTabs.map((tab) => {
          const isActive = statusFilter === tab.key
          const count = tab.key === 'all' ? undefined : data.statusCounts[tab.key] || 0
          return (
            <Button
              key={tab.key}
              variant={isActive ? 'default' : 'outline'}
              size="sm"
              onClick={() => navigate({ status: tab.key === 'all' ? undefined : tab.key })}
            >
              {t(tab.titleKey)}
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
              placeholder={t('list.searchPlaceholder')}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-9"
            />
          </form>
          {isPending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
        <Button size="sm" onClick={openNewDialog}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          {t('list.newQuote')}
        </Button>
      </div>

      <div className="rounded-lg border">
        <TableContextMenuHint />
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="w-25">
                <button type="button" className="flex items-center hover:text-foreground" onClick={() => handleSort('quoteNumber')}>
                  {t('list.columnQuoteNumber')}<SortIcon column="quoteNumber" />
                </button>
              </TableHead>
              <TableHead>
                <button type="button" className="flex items-center hover:text-foreground" onClick={() => handleSort('title')}>
                  {t('list.columnTitle')}<SortIcon column="title" />
                </button>
              </TableHead>
              <TableHead className="hidden w-[18%] md:table-cell">
                <button type="button" className="flex items-center hover:text-foreground" onClick={() => handleSort('customer')}>
                  {t('list.columnCustomer')}<SortIcon column="customer" />
                </button>
              </TableHead>
              <TableHead className="hidden w-[18%] lg:table-cell">
                <button type="button" className="flex items-center hover:text-foreground" onClick={() => handleSort('vehicle')}>
                  {t('list.columnVehicle')}<SortIcon column="vehicle" />
                </button>
              </TableHead>
              <TableHead className="w-27.5">
                <button type="button" className="flex items-center hover:text-foreground" onClick={() => handleSort('status')}>
                  {t('list.columnStatus')}<SortIcon column="status" />
                </button>
              </TableHead>
              <TableHead className="w-22.5">
                <button type="button" className="flex items-center hover:text-foreground" onClick={() => handleSort('createdAt')}>
                  {t('list.columnDate')}<SortIcon column="createdAt" />
                </button>
              </TableHead>
              <TableHead className="w-22.5">
                <button type="button" className="ml-auto flex items-center hover:text-foreground" onClick={() => handleSort('totalAmount')}>
                  {t('list.columnTotal')}<SortIcon column="totalAmount" />
                </button>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.records.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                  {t('list.noQuotes')}
                </TableCell>
              </TableRow>
            ) : (
              data.records.map((q) => (
                <ContextMenu key={q.id} modal={false}>
                <ContextMenuTrigger asChild>
                <TableRow
                  className="cursor-pointer"
                  onClick={() => router.push(`/quotes/${q.id}`)}
                >
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {q.quoteNumber || '-'}
                  </TableCell>
                  <TableCell className="truncate font-medium">{q.title}</TableCell>
                  <TableCell className="hidden truncate md:table-cell text-muted-foreground">
                    {q.customer ? (
                      <TableCellLink href={`/customers/${q.customer.id}`}>
                        {q.customer.name}
                      </TableCellLink>
                    ) : (
                      '-'
                    )}
                  </TableCell>
                  <TableCell className="hidden truncate lg:table-cell text-muted-foreground">
                    {q.vehicle ? (
                      <TableCellLink href={`/vehicles/${q.vehicle.id}`}>
                        {q.vehicle.year} {q.vehicle.make} {q.vehicle.model}
                      </TableCellLink>
                    ) : (
                      '-'
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-xs ${statusColors[q.status] || ''}`}>
                      {q.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {formatDate(new Date(q.createdAt))}
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    {formatCurrency(q.totalAmount, currencyCode)}
                  </TableCell>
                </TableRow>
                </ContextMenuTrigger>
                <ContextMenuContent className="min-w-52">
                  <ContextMenuItem onClick={() => router.push(`/quotes/${q.id}`)}>
                    <ExternalLink className="mr-2 h-4 w-4" />
                    {tcm('open')}
                  </ContextMenuItem>
                  {q.vehicle && (
                    <ContextMenuItem onClick={() => router.push(`/vehicles/${q.vehicle?.id}`)}>
                      <Car className="mr-2 h-4 w-4" />
                      {tcm('openVehicle')}
                    </ContextMenuItem>
                  )}
                  {q.customer && (
                    <ContextMenuItem onClick={() => router.push(`/customers/${q.customer?.id}`)}>
                      <User className="mr-2 h-4 w-4" />
                      {tcm('openCustomer')}
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

      <NewQuoteDialog open={showNewDialog} onOpenChange={setShowNewDialog} />
    </div>
  )
}
