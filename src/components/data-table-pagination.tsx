'use client'

import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'

interface DataTablePaginationProps {
  total: number
  page: number
  pageSize: number
  totalPages: number
  onNavigate: (params: Record<string, string | number | undefined>) => void
  /**
   * Query parameter names to write. Pages that paginate more than one table
   * (the vehicle detail tabs) give each its own pair.
   */
  pageParam?: string
  pageSizeParam?: string
  pageSizes?: string[]
}

const DEFAULT_PAGE_SIZES = ['10', '25', '50']

/**
 * Pagination footer shared by every paginated table. On phones the row stacks,
 * the first/last jumps drop out (prev/next plus the page indicator is enough on
 * a small screen) and the controls grow to a 36px touch target.
 */
export function DataTablePagination({
  total,
  page,
  pageSize,
  totalPages,
  onNavigate,
  pageParam = 'page',
  pageSizeParam = 'pageSize',
  pageSizes = DEFAULT_PAGE_SIZES,
}: DataTablePaginationProps) {
  const t = useTranslations('common.pagination')
  if (total === 0) return null

  const startItem = (page - 1) * pageSize + 1
  const endItem = Math.min(page * pageSize, total)
  const goTo = (target: number) => onNavigate({ [pageParam]: target })

  return (
    <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
      <div className="flex items-center gap-2 text-xs text-muted-foreground sm:text-sm">
        <span>{t('showing', { start: startItem, end: endItem, total })}</span>
        <Select
          value={String(pageSize)}
          onValueChange={(v) => onNavigate({ [pageSizeParam]: v, [pageParam]: 1 })}
        >
          <SelectTrigger className="h-9 w-[70px] sm:h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {pageSizes.map((size) => (
              <SelectItem key={size} value={size}>
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="hidden sm:inline">{t('perPage')}</span>
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          className="hidden h-9 w-9 sm:inline-flex sm:h-8 sm:w-8"
          disabled={page <= 1}
          aria-label={t('first')}
          onClick={() => goTo(1)}
        >
          <ChevronsLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9 sm:h-8 sm:w-8"
          disabled={page <= 1}
          aria-label={t('previous')}
          onClick={() => goTo(page - 1)}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="px-3 text-sm whitespace-nowrap">
          {t('pageOf', { page, pages: totalPages })}
        </span>
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9 sm:h-8 sm:w-8"
          disabled={page >= totalPages}
          aria-label={t('next')}
          onClick={() => goTo(page + 1)}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="hidden h-9 w-9 sm:inline-flex sm:h-8 sm:w-8"
          disabled={page >= totalPages}
          aria-label={t('last')}
          onClick={() => goTo(totalPages)}
        >
          <ChevronsRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
