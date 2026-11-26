'use client'

import { useRememberedSort } from '@/hooks/use-remembered-sort'
import { interactiveRow } from '@/lib/interactive-row'
import { useTableKeyboardNav } from '@/hooks/use-table-keyboard-nav'
import { useDebouncedSearch } from '@/hooks/use-debounced-search'

import { useState, useCallback, useTransition, useEffect } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
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
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { type ServerBatch, useInfiniteRows } from '@/components/infinite-list/use-infinite-rows'
import {
  InfiniteListCount,
  InfiniteListFooter,
  InfiniteTableFooter,
} from '@/components/infinite-list/infinite-list-footer'
import { getCustomerRows } from '@/features/customers/Actions/getCustomerRows'
import { useLoadedRowSelection } from '@/hooks/use-loaded-row-selection'
import type { Cursor } from '@/lib/keyset'
import { TableContextMenuHint } from '@/components/table-context-menu-hint'
import { useGlassModal } from '@/components/glass-modal'
import { useConfirm } from '@/components/confirm-dialog'
import { CustomerForm } from '@/features/customers/Components/CustomerForm'
import { ImportWizard } from '@/features/import/Components/ImportWizard'
import { Checkbox } from '@/components/ui/checkbox'
import {
  backfillCustomerNumbers,
  deleteCustomer,
  deleteCustomers,
} from '@/features/customers/Actions/customerActions'
import { toast } from 'sonner'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Car,
  ExternalLink,
  Hash,
  Loader2,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  Users,
} from 'lucide-react'
import { ListEmpty } from '@/components/list-empty'

interface Customer {
  customerNumber: string | null
  id: string
  name: string
  email: string | null
  phone: string | null
  address: string | null
  company: string | null
  taxId: string | null
  taxExempt: boolean
  poRequired?: boolean
  notes: string | null
  _count: { vehicles: number }
}

/** One batch of the list; the first also carries the total. */
interface CustomerBatch {
  rows: Customer[]
  nextCursor: Cursor | null
  total?: number
}

export function CustomersClient({
  data,
  listScope = '',
  search,
  sortBy,
  sortOrder,
  unnumbered: initialUnnumbered = 0,
}: {
  /** The first batch, rendered on the server. */
  data: ServerBatch<CustomerBatch>
  /** The workshop, so one workshop's cached rows never show in another's. */
  listScope?: string
  search: string
  sortBy: string
  sortOrder: 'asc' | 'desc'
  /** Customers with no number yet; the assign button shows while there are any. */
  unnumbered?: number
}) {
  const t = useTranslations('customers.list')
  const ta = useTranslations('common.a11y')
  const tc = useTranslations('common')
  const tcm = useTranslations('common.contextMenu')
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const tableNav = useTableKeyboardNav()
  useRememberedSort('customers')

  // Customers imported or created before numbering may have none. The
  // button lives here, beside the list it changes, and goes away once every
  // customer has a number.
  const [unnumbered, setUnnumbered] = useState(initialUnnumbered)
  const [assigning, setAssigning] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null)
  // The same filters the page's first batch was read with, so every batch
  // after it continues that list.
  const filters = { search: search || undefined, sortBy: sortBy || undefined, sortOrder }
  const list = useInfiniteRows<Customer, Cursor, CustomerBatch>({
    queryKey: ['customers', listScope, filters],
    initial: data,
    fetchPage: (cursor) => getCustomerRows({ ...filters, cursor }),
  })
  const customers = list.rows
  // Only rows on screen can be ticked, and another search or sort starts
  // with none.
  const selection = useLoadedRowSelection(customers, list.listKey)
  const [isDeleting, setIsDeleting] = useState(false)
  const modal = useGlassModal()
  const confirm = useConfirm()

  useEffect(() => {
    if (searchParams.get('create') === 'true') {
      setShowForm(true)
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
      // Pages are gone; an old link's ?page= means nothing now.
      newParams.delete('page')
      startTransition(() => {
        router.push(`${pathname}?${newParams.toString()}`)
      })
    },
    [router, pathname, searchParams]
  )

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

  // Live search: filters as you type, no Enter required. Submitting the
  // form (Enter) commits immediately, bypassing the debounce.
  const {
    value: searchInput,
    setValue: setSearchInput,
    commitNow: handleSearch,
  } = useDebouncedSearch(search, (term) => navigate({ search: term }))

  const handleDelete = async (id: string, name: string) => {
    const ok = await confirm({
      title: t('deleteTitle'),
      description: t('deleteDescription', { name }),
      confirmLabel: tc('buttons.delete'),
      icon: Trash2,
      destructive: true,
    })
    if (!ok) return
    // An action that cannot reach the server throws instead of answering, so
    // it is caught and reported the way a refusal is.
    const result = await deleteCustomer(id).catch(() => null)
    if (result?.success) {
      router.refresh()
    } else {
      modal.open('error', tc('errors.error'), result?.error || t('deleteError'))
    }
  }

  const handleBatchDelete = async () => {
    // Only what is ticked on screen: a row that has not loaded is never in it.
    const ids = selection.selectedIds
    if (ids.length === 0) return
    // Name the first few customers so the count is not taken on trust.
    const named = selection.selectedRows.slice(0, 3)
    const ok = await confirm({
      title: t('batchDeleteTitle'),
      description: t('batchDeleteDescription', { count: ids.length }),
      subject: named.map((c) => ({
        label: c.name,
        detail: c.company && c.company !== c.name ? c.company : undefined,
      })),
      subjectMore: ids.length - named.length,
      confirmLabel: tc('buttons.delete'),
      icon: Trash2,
      destructive: true,
    })
    if (!ok) return
    setIsDeleting(true)
    const result = await deleteCustomers(ids).catch(() => null)
    if (result?.success) {
      toast.success(t('batchDeleteSuccess', { count: result.data?.deleted ?? ids.length }))
      selection.clear()
      router.refresh()
    } else {
      modal.open('error', tc('errors.error'), result?.error || t('deleteError'))
    }
    setIsDeleting(false)
  }

  const handleAssignNumbers = async () => {
    const ok = await confirm({
      title: t('assignNumbersTitle'),
      description: t('assignNumbersDescription', { count: unnumbered }),
      confirmLabel: t('assignNumbers'),
    })
    if (!ok) return
    setAssigning(true)
    const result = await backfillCustomerNumbers()
    setAssigning(false)
    if (result.success && result.data) {
      setUnnumbered(0)
      toast.success(t('assignNumbersDone', { count: result.data.assigned }))
      router.refresh()
    } else {
      toast.error(result.success ? t('error') : result.error || t('error'))
    }
  }

  // The truly empty list gets the next step in front of it. A search miss
  // keeps its plain sentence.
  const emptyState = (bare: boolean) =>
    search ? (
      <p className="p-8 text-center text-sm text-muted-foreground">{t('emptySearch')}</p>
    ) : (
      <ListEmpty
        bare={bare}
        icon={Users}
        title={t('empty')}
        action={
          <Button onClick={() => setShowForm(true)} className="w-full sm:w-auto">
            <Plus className="mr-1 h-4 w-4" />
            {t('addCustomer')}
          </Button>
        }
        secondary={
          <Button variant="ghost" size="sm" onClick={() => setShowImport(true)}>
            <Upload className="mr-1 h-3.5 w-3.5" />
            {t('importCustomers')}
          </Button>
        }
      />
    )

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {/* Toolbar */}
      <div className="flex shrink-0 items-center justify-between gap-3">
        {selection.count > 0 ? (
          <>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>{t('selectedCount', { count: selection.count })}</span>
              <Button variant="ghost" size="sm" onClick={selection.clear}>
                {t('clearSelection')}
              </Button>
            </div>
            <Button
              size="sm"
              variant="destructive"
              onClick={handleBatchDelete}
              disabled={isDeleting}
            >
              {isDeleting && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
              <Trash2 className="mr-1 h-3.5 w-3.5" />
              {t('batchDelete', { count: selection.count })}
            </Button>
          </>
        ) : (
          <>
            <div className="flex flex-1 items-center gap-2">
              <form onSubmit={handleSearch} className="relative flex-1 sm:max-w-sm">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder={t('searchPlaceholder')}
                  aria-label={t('searchPlaceholder')}
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="h-9 pl-9"
                  {...tableNav.searchInputProps}
                />
              </form>
              {isPending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              <InfiniteListCount shown={customers.length} total={list.total} />
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {unnumbered > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleAssignNumbers}
                  disabled={assigning}
                  aria-label={t('assignNumbers')}
                  title={t('assignNumbersDescription', { count: unnumbered })}
                  className="h-9 w-9 p-0 md:h-8 md:w-auto md:px-3"
                >
                  {assigning ? (
                    <Loader2 className="h-4 w-4 animate-spin md:mr-1 md:h-3.5 md:w-3.5" />
                  ) : (
                    <Hash className="h-4 w-4 md:mr-1 md:h-3.5 md:w-3.5" />
                  )}
                  <span className="hidden md:inline">{t('assignNumbers')}</span>
                  <span className="hidden rounded-full bg-primary/10 px-1.5 text-[11px] font-semibold tabular-nums text-primary md:ml-1.5 md:inline">
                    {unnumbered}
                  </span>
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowImport(true)}
                aria-label={t('importCustomers')}
                title={t('importCustomers')}
                className="h-9 w-9 p-0 md:h-8 md:w-auto md:px-3"
              >
                <Upload className="h-4 w-4 md:mr-1 md:h-3.5 md:w-3.5" />
                <span className="hidden md:inline">{t('importCustomers')}</span>
              </Button>
              <Button
                size="sm"
                onClick={() => setShowForm(true)}
                aria-label={t('addCustomer')}
                title={t('addCustomer')}
                className="h-9 w-9 p-0 md:h-8 md:w-auto md:px-3"
              >
                <Plus className="h-4 w-4 md:mr-1 md:h-3.5 md:w-3.5" />
                <span className="hidden md:inline">{t('addCustomer')}</span>
              </Button>
            </div>
          </>
        )}
      </div>

      {/* Card list (phones + small tablets) - only this scrolls */}
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto md:hidden">
        {customers.length === 0
          ? emptyState(false)
          : customers.map((c) => (
              <div
                key={c.id}
                className={`flex items-start gap-3 rounded-lg border bg-card p-3 ${
                  selection.isSelected(c.id) ? 'bg-muted/50' : ''
                }`}
              >
                <Checkbox
                  className="mt-1 shrink-0"
                  checked={selection.isSelected(c.id)}
                  onCheckedChange={() => selection.toggle(c.id)}
                  aria-label={ta('selectRow', { name: c.name })}
                />
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => router.push(`/customers/${c.id}`)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="min-w-0 flex-1 truncate font-medium">{c.name}</span>
                    <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                      <Car className="h-3 w-3" />
                      {c._count.vehicles}
                    </span>
                  </div>
                  {c.company && (
                    <p className="truncate text-xs text-muted-foreground">{c.company}</p>
                  )}
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {c.customerNumber && <span className="font-mono">{c.customerNumber}</span>}
                    {c.phone && <span>{c.phone}</span>}
                    {c.email && <span className="truncate">{c.email}</span>}
                  </div>
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="-mr-1 h-9 w-9 shrink-0"
                      aria-label={t('openMenu')}
                    >
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => {
                        setEditCustomer(c)
                        setShowForm(true)
                      }}
                    >
                      <Pencil className="mr-2 h-4 w-4" />
                      {tc('buttons.edit')}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => handleDelete(c.id, c.name)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      {tc('buttons.delete')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
        {customers.length > 0 && <InfiniteListFooter state={list} />}
      </div>

      {/* Table (md and up) - only the rows scroll */}
      <div
        className="@container hidden min-h-0 flex-1 flex-col overflow-hidden rounded-lg border md:flex"
        {...tableNav.containerProps}
      >
        <TableContextMenuHint />
        <Table containerClassName="min-h-0 flex-1" className="table-fixed">
          <TableHeader sticky>
            <TableRow>
              <TableHead className="w-[40px]">
                <Checkbox
                  checked={selection.headerState}
                  onCheckedChange={selection.toggleAll}
                  aria-label={t('selectLoaded', { count: customers.length })}
                  title={t('selectLoaded', { count: customers.length })}
                  onClick={(e) => e.stopPropagation()}
                />
              </TableHead>
              <TableHead className="w-[80px]">
                <button
                  type="button"
                  className="flex items-center hover:text-foreground"
                  onClick={() => handleSort('number')}
                >
                  {t('table.number')}
                  <SortIcon column="number" />
                </button>
              </TableHead>
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
              {/* The name takes what the others leave. Email waits for a
                  table wide enough to keep the name whole (about 900px). */}
              <TableHead className="hidden w-[16%] sm:table-cell">
                <button
                  type="button"
                  className="flex items-center hover:text-foreground"
                  onClick={() => handleSort('company')}
                >
                  {t('table.company')}
                  <SortIcon column="company" />
                </button>
              </TableHead>
              <TableHead className="hidden w-[14%] md:table-cell">
                <button
                  type="button"
                  className="flex items-center hover:text-foreground"
                  onClick={() => handleSort('phone')}
                >
                  {t('table.phone')}
                  <SortIcon column="phone" />
                </button>
              </TableHead>
              <TableHead className="hidden w-[20%] @4xl:table-cell">
                <button
                  type="button"
                  className="flex items-center hover:text-foreground"
                  onClick={() => handleSort('email')}
                >
                  {t('table.email')}
                  <SortIcon column="email" />
                </button>
              </TableHead>
              <TableHead className="w-[80px]">
                <button
                  type="button"
                  className="mx-auto flex items-center hover:text-foreground"
                  onClick={() => handleSort('vehicles')}
                >
                  {t('table.vehicles')}
                  <SortIcon column="vehicles" />
                </button>
              </TableHead>
              <TableHead className="w-[50px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {customers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="p-0">
                  {emptyState(true)}
                </TableCell>
              </TableRow>
            ) : (
              customers.map((c) => (
                <ContextMenu key={c.id} modal={false}>
                  <ContextMenuTrigger asChild>
                    <TableRow
                      className={`cursor-pointer ${selection.isSelected(c.id) ? 'bg-muted/50' : ''}`}
                      {...interactiveRow(() => router.push(`/customers/${c.id}`))}
                    >
                      <TableCell className="w-[40px]">
                        <Checkbox
                          checked={selection.isSelected(c.id)}
                          onCheckedChange={() => selection.toggle(c.id)}
                          aria-label={ta('selectRow', { name: c.name })}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </TableCell>
                      <TableCell
                        className="truncate font-mono text-xs text-muted-foreground"
                        title={c.customerNumber || undefined}
                      >
                        {c.customerNumber || '-'}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="truncate font-medium">{c.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="hidden truncate sm:table-cell text-muted-foreground">
                        {c.company || '-'}
                      </TableCell>
                      <TableCell className="hidden truncate md:table-cell text-muted-foreground">
                        {c.phone || '-'}
                      </TableCell>
                      <TableCell className="hidden truncate @4xl:table-cell text-muted-foreground">
                        {c.email || '-'}
                      </TableCell>
                      <TableCell className="text-center">{c._count.vehicles}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              aria-label={t('openMenu')}
                            >
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation()
                                setEditCustomer(c)
                                setShowForm(true)
                              }}
                            >
                              <Pencil className="mr-2 h-4 w-4" />
                              {tc('buttons.edit')}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDelete(c.id, c.name)
                              }}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              {tc('buttons.delete')}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  </ContextMenuTrigger>
                  <ContextMenuContent className="min-w-52">
                    <ContextMenuItem onClick={() => router.push(`/customers/${c.id}`)}>
                      <ExternalLink className="mr-2 h-4 w-4" />
                      {tcm('open')}
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem
                      onClick={() => {
                        setEditCustomer(c)
                        setShowForm(true)
                      }}
                    >
                      <Pencil className="mr-2 h-4 w-4" />
                      {tc('buttons.edit')}
                    </ContextMenuItem>
                    <ContextMenuItem
                      variant="destructive"
                      onClick={() => handleDelete(c.id, c.name)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      {tc('buttons.delete')}
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              ))
            )}
            {customers.length > 0 && <InfiniteTableFooter state={list} colSpan={8} />}
          </TableBody>
        </Table>
      </div>

      <CustomerForm
        open={showForm}
        onOpenChange={(open) => {
          setShowForm(open)
          if (!open) setEditCustomer(null)
        }}
        customer={editCustomer ?? undefined}
      />

      <ImportWizard open={showImport} onOpenChange={setShowImport} entity="customers" lockEntity />
    </div>
  )
}
