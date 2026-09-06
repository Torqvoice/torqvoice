'use client'

import { useRememberedSort } from '@/hooks/use-remembered-sort'
import { useTableKeyboardNav } from '@/hooks/use-table-keyboard-nav'
import { interactiveRow } from '@/lib/interactive-row'
import { useDebouncedSearch } from '@/hooks/use-debounced-search'

import { useState, useCallback, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { DataTablePagination } from '@/components/data-table-pagination'
import { TableContextMenuHint } from '@/components/table-context-menu-hint'
import { useGlassModal } from '@/components/glass-modal'
import { useConfirm } from '@/components/confirm-dialog'
import { LaborPresetForm } from '@/features/labor-presets/Components/LaborPresetForm'
import {
  deleteLaborPreset,
  getLaborPreset,
} from '@/features/labor-presets/Actions/laborPresetActions'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Loader2,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react'

interface LaborPresetRow {
  id: string
  name: string
  description: string | null
  _count: { items: number }
  items: { hours: number; pricingType: string }[]
}

interface PaginatedData {
  presets: LaborPresetRow[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export function LaborPresetsClient({
  data,
  search,
  sortBy,
  sortOrder,
  currencyCode = 'USD',
  defaultLaborRate = 0,
  inventoryParts = [],
}: {
  data: PaginatedData
  search: string
  sortBy: string
  sortOrder: 'asc' | 'desc'
  currencyCode?: string
  defaultLaborRate?: number
  /** Stocked parts for the preset form's "import from inventory" picker. */
  inventoryParts?: {
    id: string
    name: string
    partNumber: string | null
    unit: string | null
    sellPrice: number
    unitCost: number
    quantity: number
  }[]
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const t = useTranslations('laborPresets')
  const [isPending, startTransition] = useTransition()
  const tableNav = useTableKeyboardNav()
  useRememberedSort('laborPresets')
  const [showForm, setShowForm] = useState(false)
  const [editPreset, setEditPreset] = useState<{
    id: string
    name: string
    description: string | null
    items: {
      description: string
      hours: number
      rate: number
      pricingType?: string
      sortOrder: number
    }[]
  } | null>(null)
  const modal = useGlassModal()
  const confirm = useConfirm()

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
      if (!('page' in params) && 'search' in params) {
        newParams.delete('page')
      }
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

  const handleEdit = async (id: string) => {
    const result = await getLaborPreset(id)
    if (result.success && result.data) {
      setEditPreset(result.data)
      setShowForm(true)
    } else {
      modal.open('error', t('errors.error'), result.error || t('errors.loadFailed'))
    }
  }

  const handleDelete = async (id: string, name: string) => {
    const ok = await confirm({
      title: t('deletePreset.title'),
      description: t('deletePreset.description', { name }),
      confirmLabel: t('deletePreset.confirm'),
      destructive: true,
    })
    if (!ok) return
    const result = await deleteLaborPreset(id)
    if (result.success) {
      router.refresh()
    } else {
      modal.open('error', t('errors.error'), result.error || t('errors.deleteFailed'))
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {/* Toolbar */}
      <div className="flex shrink-0 items-center justify-between gap-3">
        <div className="flex flex-1 items-center gap-2">
          <form onSubmit={handleSearch} className="relative flex-1 sm:max-w-sm">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t('searchPlaceholder')}
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
          onClick={() => setShowForm(true)}
          aria-label={t('addPackage')}
          title={t('addPackage')}
          className="h-9 w-9 shrink-0 p-0 md:h-8 md:w-auto md:px-3"
        >
          <Plus className="h-4 w-4 md:mr-1 md:h-3.5 md:w-3.5" />
          <span className="hidden md:inline">{t('addPackage')}</span>
        </Button>
      </div>

      {/* Card list (phones + small tablets) */}
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto md:hidden">
        {data.presets.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            {search ? t('empty.noMatch') : t('empty.noPresets')}
          </div>
        ) : (
          data.presets.map((preset) => {
            const hourlyItems = preset.items.filter((i) => i.pricingType !== 'service')
            const serviceItems = preset.items.filter((i) => i.pricingType === 'service')
            const totalHours = hourlyItems.reduce((sum, i) => sum + i.hours, 0)
            const totalUnits = serviceItems.reduce((sum, i) => sum + i.hours, 0)
            return (
              <div key={preset.id} className="flex items-start gap-2 rounded-lg border bg-card p-3">
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => handleEdit(preset.id)}
                >
                  <p className="truncate font-medium">{preset.name}</p>
                  {preset.description && (
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                      {preset.description}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <span>
                      {t('table.itemCount')}: {preset._count.items}
                    </span>
                    {totalHours > 0 && (
                      <span className="inline-flex items-center rounded-md border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600">
                        {totalHours} {t('table.hrs')}
                      </span>
                    )}
                    {totalUnits > 0 && (
                      <span className="inline-flex items-center rounded-md border border-blue-500/30 bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium text-blue-600">
                        {totalUnits} {t('table.units')}
                      </span>
                    )}
                  </div>
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="-mr-1 h-9 w-9 shrink-0"
                      aria-label={t('actions.openMenu')}
                    >
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handleEdit(preset.id)}>
                      <Pencil className="mr-2 h-4 w-4" />
                      {t('actions.edit')}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => handleDelete(preset.id, preset.name)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      {t('actions.delete')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )
          })
        )}
      </div>

      {/* Table (md and up) - only the rows scroll */}
      <div
        className="hidden min-h-0 flex-1 flex-col overflow-hidden rounded-lg border md:flex"
        {...tableNav.containerProps}
      >
        <TableContextMenuHint />
        <Table containerClassName="min-h-0 flex-1">
          <TableHeader sticky>
            <TableRow>
              <TableHead>
                <button
                  type="button"
                  className="flex items-center hover:text-foreground"
                  onClick={() => handleSort('name')}
                >
                  {t('table.name')}
                  <SortIcon column="name" />
                </button>
              </TableHead>
              <TableHead className="hidden sm:table-cell">
                <button
                  type="button"
                  className="flex items-center hover:text-foreground"
                  onClick={() => handleSort('description')}
                >
                  {t('table.description')}
                  <SortIcon column="description" />
                </button>
              </TableHead>
              <TableHead>{t('table.itemCount')}</TableHead>
              <TableHead className="hidden md:table-cell">{t('table.type')}</TableHead>
              <TableHead className="w-[50px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.presets.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                  {search ? t('empty.noMatch') : t('empty.noPresets')}
                </TableCell>
              </TableRow>
            ) : (
              data.presets.map((preset) => (
                <ContextMenu key={preset.id} modal={false}>
                  <ContextMenuTrigger asChild>
                    <TableRow
                      className="cursor-pointer"
                      {...interactiveRow(() => handleEdit(preset.id))}
                    >
                      <TableCell className="font-medium">{preset.name}</TableCell>
                      <TableCell className="hidden sm:table-cell text-muted-foreground">
                        {preset.description || '-'}
                      </TableCell>
                      <TableCell>{preset._count.items}</TableCell>
                      <TableCell className="hidden md:table-cell">
                        {(() => {
                          const hourlyItems = preset.items.filter(
                            (i) => i.pricingType !== 'service'
                          )
                          const serviceItems = preset.items.filter(
                            (i) => i.pricingType === 'service'
                          )
                          const totalHours = hourlyItems.reduce((sum, i) => sum + i.hours, 0)
                          const totalUnits = serviceItems.reduce((sum, i) => sum + i.hours, 0)
                          return (
                            <div className="flex gap-1.5">
                              {totalHours > 0 && (
                                <span className="inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium border-emerald-500/30 bg-emerald-500/10 text-emerald-600">
                                  {totalHours} {t('table.hrs')}
                                </span>
                              )}
                              {totalUnits > 0 && (
                                <span className="inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium border-blue-500/30 bg-blue-500/10 text-blue-600">
                                  {totalUnits} {t('table.units')}
                                </span>
                              )}
                            </div>
                          )
                        })()}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              aria-label={t('actions.openMenu')}
                            >
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleEdit(preset.id)}>
                              <Pencil className="mr-2 h-4 w-4" />
                              {t('actions.edit')}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => handleDelete(preset.id, preset.name)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              {t('actions.delete')}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  </ContextMenuTrigger>
                  <ContextMenuContent className="min-w-52">
                    <ContextMenuItem onClick={() => handleEdit(preset.id)}>
                      <Pencil className="mr-2 h-4 w-4" />
                      {t('actions.edit')}
                    </ContextMenuItem>
                    <ContextMenuItem
                      variant="destructive"
                      onClick={() => handleDelete(preset.id, preset.name)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      {t('actions.delete')}
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

      <LaborPresetForm
        key={editPreset?.id ?? 'new'}
        open={showForm}
        onOpenChange={(open) => {
          setShowForm(open)
          if (!open) setEditPreset(null)
        }}
        preset={editPreset ?? undefined}
        defaultLaborRate={defaultLaborRate}
        inventoryParts={inventoryParts}
        currencyCode={currencyCode}
      />
    </div>
  )
}
