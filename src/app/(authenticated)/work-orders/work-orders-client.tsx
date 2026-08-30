'use client'

import { interactiveRow } from '@/lib/interactive-row'
import { useTableKeyboardNav } from '@/hooks/use-table-keyboard-nav'
import { useDebouncedSearch } from '@/hooks/use-debounced-search'

import { useState, useCallback, useTransition } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
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
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { DataTablePagination } from '@/components/data-table-pagination'
import { TableContextMenuHint } from '@/components/table-context-menu-hint'
import { TableCellLink } from '@/components/table-cell-link'
import { statusColors } from '@/lib/table-utils'
import { updateServiceStatus } from '@/features/vehicles/Actions/serviceActions'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Car,
  ExternalLink,
  Loader2,
  Plus,
  Search,
  User,
} from 'lucide-react'
import { useFormatCurrency } from '@/components/currency-settings-context'
import { VehiclePickerDialog } from '@/components/vehicle-picker-dialog'
import { NotifyCustomerDialog } from '@/components/notify-customer-dialog'
import { useTranslations } from 'next-intl'
import { getSmsTemplates } from '@/features/sms/Actions/smsActions'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { SMS_TEMPLATE_DEFAULTS, interpolateSmsTemplate } from '@/lib/sms-templates'

interface WorkOrder {
  id: string
  title: string
  type: string
  status: string
  totalAmount: number
  cost: number
  serviceDate: Date
  startDateTime: Date | null
  techName: string | null
  invoiceNumber: string | null
  customer: { id: string; name: string; email: string | null; phone: string | null } | null
  vehicle: {
    id: string
    make: string
    model: string
    year: number
    licensePlate: string | null
    customer: { id: string; name: string; email: string | null; phone: string | null } | null
  } | null
}

interface VehicleOption {
  id: string
  make: string
  model: string
  year: number
  licensePlate: string | null
  customer: { id: string; name: string; company: string | null } | null
}

interface CustomerOption {
  id: string
  name: string
  company: string | null
}

interface PaginatedData {
  records: WorkOrder[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  statusCounts: Record<string, number>
}

const statusTabKeys = [
  'all',
  'active',
  'pending',
  'in-progress',
  'waiting-parts',
  'completed',
] as const

const statusTabI18nMap: Record<string, string> = {
  all: 'all',
  active: 'active',
  pending: 'pending',
  'in-progress': 'inProgress',
  'waiting-parts': 'waitingParts',
  completed: 'completed',
}

const statusTemplateKeys: Record<string, string> = {
  'in-progress': SETTING_KEYS.SMS_TEMPLATE_STATUS_IN_PROGRESS,
  'waiting-parts': SETTING_KEYS.SMS_TEMPLATE_STATUS_WAITING_PARTS,
  completed: SETTING_KEYS.SMS_TEMPLATE_STATUS_COMPLETED,
}

const statusTransitions: Record<string, { actionKey: string; target: string }[]> = {
  pending: [{ actionKey: 'startWork', target: 'in-progress' }],
  'in-progress': [
    { actionKey: 'waitingParts', target: 'waiting-parts' },
    { actionKey: 'complete', target: 'completed' },
  ],
  'waiting-parts': [
    { actionKey: 'resumeWork', target: 'in-progress' },
    { actionKey: 'complete', target: 'completed' },
  ],
  completed: [{ actionKey: 'reopen', target: 'pending' }],
}

export function WorkOrdersClient({
  data,
  vehicles = [],
  customers = [],
  currencyCode = 'USD',
  search,
  statusFilter,
  sortBy,
  sortOrder,
  smsEnabled = false,
  emailEnabled = false,
}: {
  data: PaginatedData
  vehicles?: VehicleOption[]
  customers?: CustomerOption[]
  currencyCode?: string
  search: string
  statusFilter: string
  sortBy: string
  sortOrder: 'asc' | 'desc'
  smsEnabled?: boolean
  emailEnabled?: boolean
}) {
  const formatCurrency = useFormatCurrency()
  const router = useRouter()
  const { formatDate } = useFormatDate()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const tableNav = useTableKeyboardNav()
  const t = useTranslations('workOrders.list')
  const [navigatingId, setNavigatingId] = useState<string | null>(null)
  const [showPicker, setShowPicker] = useState(false)
  const [showNotifyDialog, setShowNotifyDialog] = useState(false)
  const [notifyCustomer, setNotifyCustomer] = useState<{
    id: string
    name: string
    email: string | null
    phone: string | null
  } | null>(null)
  const [notifyMessage, setNotifyMessage] = useState('')
  const [notifyStatus, setNotifyStatus] = useState('')

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
      if (!('page' in params)) {
        newParams.delete('page')
      }
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

  const handleStatusChange = async (workOrder: WorkOrder, newStatus: string) => {
    await updateServiceStatus(workOrder.id, newStatus)
    toast.success(t('statusUpdated'))
    router.refresh()

    const templateKey = statusTemplateKeys[newStatus]
    const notifyTarget = workOrder.customer ?? workOrder.vehicle?.customer
    if (notifyTarget && templateKey) {
      const tplResult = await getSmsTemplates()
      const tplData = tplResult.success && tplResult.data ? tplResult.data : null
      const tpl = tplData?.templates[templateKey] || SMS_TEMPLATE_DEFAULTS[templateKey] || ''
      const vehicle = workOrder.vehicle
        ? `${workOrder.vehicle.year} ${workOrder.vehicle.make} ${workOrder.vehicle.model}`
        : workOrder.title
      const message = interpolateSmsTemplate(tpl, {
        customer_name: notifyTarget.name,
        vehicle,
        company_name: tplData?.companyName || '',
        current_user: tplData?.currentUser || '',
      })
      setNotifyCustomer(notifyTarget)
      setNotifyMessage(message)
      setNotifyStatus(newStatus)
      setShowNotifyDialog(true)
    }
  }

  return (
    <div className="space-y-4">
      {/* Status tabs: one scrollable row on phones, wrapped above sm. */}
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
        {statusTabKeys.map((key) => {
          const isActive = statusFilter === key
          const count = key === 'all' || key === 'active' ? undefined : data.statusCounts[key] || 0
          return (
            <Button
              key={key}
              variant={isActive ? 'default' : 'outline'}
              size="sm"
              className="h-9 shrink-0 sm:h-8"
              onClick={() => navigate({ status: key || undefined })}
            >
              {t(`statusTabs.${statusTabI18nMap[key]}`)}
              {count !== undefined && (
                <Badge variant="secondary" className="ml-1.5 h-5 min-w-5 px-1 text-xs">
                  {count}
                </Badge>
              )}
            </Button>
          )
        })}
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2">
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
          onClick={() => setShowPicker(true)}
          aria-label={t('newWorkOrder')}
          title={t('newWorkOrder')}
          className="h-9 w-9 shrink-0 p-0 sm:w-auto sm:px-3 md:h-8"
        >
          <Plus className="h-4 w-4 sm:mr-1 sm:h-3.5 sm:w-3.5" />
          <span className="hidden sm:inline">{t('newWorkOrder')}</span>
        </Button>
      </div>

      {/* Card list (phones + small tablets) */}
      <div className="space-y-2 md:hidden">
        {data.records.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            {t('empty')}
          </div>
        ) : (
          data.records.map((r) => {
            const displayTotal = r.totalAmount > 0 ? r.totalAmount : r.cost
            const recordHref = r.vehicle
              ? `/vehicles/${r.vehicle.id}/service/${r.id}`
              : `/sales/${r.id}`
            const rowCustomer = r.customer ?? r.vehicle?.customer
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => {
                  setNavigatingId(r.id)
                  router.push(recordHref)
                }}
                className={`w-full rounded-lg border bg-card p-3 text-left transition-opacity active:bg-muted/50 ${
                  navigatingId === r.id ? 'opacity-50' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0 flex-1 truncate font-medium">{r.title}</span>
                  <span className="inline-flex shrink-0 items-center gap-1.5 font-semibold">
                    {navigatingId === r.id && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                    )}
                    {formatCurrency(displayTotal, currencyCode)}
                  </span>
                </div>
                {r.vehicle && (
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {r.vehicle.licensePlate && (
                      <span className="font-mono font-medium text-foreground">
                        {r.vehicle.licensePlate}{' '}
                      </span>
                    )}
                    {r.vehicle.year} {r.vehicle.make} {r.vehicle.model}
                  </p>
                )}
                {rowCustomer && (
                  <p className="truncate text-xs text-muted-foreground">{rowCustomer.name}</p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
                  <Badge variant="outline" className={`text-xs ${statusColors[r.status] || ''}`}>
                    {r.status}
                  </Badge>
                  <span className="font-mono">
                    {formatDate(new Date(r.startDateTime ?? r.serviceDate))}
                  </span>
                  {r.invoiceNumber && <span className="font-mono">{r.invoiceNumber}</span>}
                  {r.techName && <span className="truncate">{r.techName}</span>}
                </div>
              </button>
            )
          })
        )}
      </div>

      {/* Table (md and up) */}
      <div className="hidden rounded-lg border md:block" {...tableNav.containerProps}>
        <TableContextMenuHint />
        {/* Low-priority columns drop out at sm/md/lg; the min-width stops what
            is left from being squeezed to a few characters, scrolling the
            table sideways instead (the Table wrapper handles the overflow) */}
        <Table className="min-w-[36rem] table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="hidden sm:table-cell w-[100px]">
                <button
                  type="button"
                  className="flex items-center hover:text-foreground"
                  onClick={() => handleSort('invoiceNumber')}
                >
                  {t('table.invoice')}
                  <SortIcon column="invoiceNumber" />
                </button>
              </TableHead>
              <TableHead className="w-[18%]">
                <button
                  type="button"
                  className="flex items-center hover:text-foreground"
                  onClick={() => handleSort('vehicle')}
                >
                  {t('table.vehicle')}
                  <SortIcon column="vehicle" />
                </button>
              </TableHead>
              <TableHead className="hidden w-[14%] md:table-cell">
                <button
                  type="button"
                  className="flex items-center hover:text-foreground"
                  onClick={() => handleSort('customer')}
                >
                  {t('table.customer')}
                  <SortIcon column="customer" />
                </button>
              </TableHead>
              <TableHead>
                <button
                  type="button"
                  className="flex items-center hover:text-foreground"
                  onClick={() => handleSort('title')}
                >
                  {t('table.title')}
                  <SortIcon column="title" />
                </button>
              </TableHead>
              <TableHead className="w-[110px]">
                <button
                  type="button"
                  className="flex items-center hover:text-foreground"
                  onClick={() => handleSort('status')}
                >
                  {t('table.status')}
                  <SortIcon column="status" />
                </button>
              </TableHead>
              <TableHead className="hidden w-[12%] lg:table-cell">
                <button
                  type="button"
                  className="flex items-center hover:text-foreground"
                  onClick={() => handleSort('techName')}
                >
                  {t('table.tech')}
                  <SortIcon column="techName" />
                </button>
              </TableHead>
              <TableHead className="w-[90px]">
                <button
                  type="button"
                  className="flex items-center hover:text-foreground"
                  onClick={() => handleSort('serviceDate')}
                >
                  {t('table.date')}
                  <SortIcon column="serviceDate" />
                </button>
              </TableHead>
              <TableHead className="w-[90px] text-right">
                <button
                  type="button"
                  className="flex items-center justify-end hover:text-foreground ml-auto"
                  onClick={() => handleSort('totalAmount')}
                >
                  {t('table.total')}
                  <SortIcon column="totalAmount" />
                </button>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.records.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                  {t('empty')}
                </TableCell>
              </TableRow>
            ) : (
              data.records.map((r) => {
                const displayTotal = r.totalAmount > 0 ? r.totalAmount : r.cost
                const transitions = statusTransitions[r.status] || []
                const recordHref = r.vehicle
                  ? `/vehicles/${r.vehicle.id}/service/${r.id}`
                  : `/sales/${r.id}`
                const rowCustomer = r.customer ?? r.vehicle?.customer
                return (
                  <ContextMenu key={r.id} modal={false}>
                    <ContextMenuTrigger asChild>
                      <TableRow
                        className={`cursor-pointer transition-opacity ${navigatingId === r.id ? 'opacity-50' : ''}`}
                        {...interactiveRow(() => {
                          setNavigatingId(r.id)
                          router.push(recordHref)
                        })}
                      >
                        <TableCell className="hidden sm:table-cell font-mono text-xs text-muted-foreground">
                          {r.invoiceNumber || '-'}
                        </TableCell>
                        <TableCell>
                          {r.vehicle ? (
                            <TableCellLink href={`/vehicles/${r.vehicle.id}`} block>
                              {r.vehicle.licensePlate && (
                                <span className="font-mono text-sm font-medium">
                                  {r.vehicle.licensePlate}
                                </span>
                              )}
                              <p className="truncate text-xs text-muted-foreground">
                                {r.vehicle.year} {r.vehicle.make} {r.vehicle.model}
                              </p>
                            </TableCellLink>
                          ) : (
                            <div className="min-w-0">
                              <p className="truncate text-xs text-muted-foreground">-</p>
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="hidden truncate md:table-cell text-muted-foreground">
                          {rowCustomer ? (
                            <TableCellLink href={`/customers/${rowCustomer.id}`}>
                              {rowCustomer.name}
                            </TableCellLink>
                          ) : (
                            '-'
                          )}
                        </TableCell>
                        <TableCell className="truncate">
                          <span className="font-medium">{r.title}</span>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`text-xs ${statusColors[r.status] || ''}`}
                          >
                            {r.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                          {r.techName || '-'}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {formatDate(new Date(r.startDateTime ?? r.serviceDate))}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          <span className="inline-flex items-center gap-2">
                            {navigatingId === r.id && (
                              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                            )}
                            {formatCurrency(displayTotal, currencyCode)}
                          </span>
                        </TableCell>
                      </TableRow>
                    </ContextMenuTrigger>
                    <ContextMenuContent className="min-w-52">
                      <ContextMenuItem
                        onClick={() => {
                          setNavigatingId(r.id)
                          router.push(recordHref)
                        }}
                      >
                        <ExternalLink className="mr-2 h-4 w-4" />
                        {t('contextMenu.open')}
                      </ContextMenuItem>
                      {r.vehicle && (
                        <ContextMenuItem onClick={() => router.push(`/vehicles/${r.vehicle?.id}`)}>
                          <Car className="mr-2 h-4 w-4" />
                          {t('contextMenu.openVehicle')}
                        </ContextMenuItem>
                      )}
                      {rowCustomer && (
                        <ContextMenuItem
                          onClick={() => router.push(`/customers/${rowCustomer.id}`)}
                        >
                          <User className="mr-2 h-4 w-4" />
                          {t('contextMenu.openCustomer')}
                        </ContextMenuItem>
                      )}
                      {transitions.length > 0 && (
                        <>
                          <ContextMenuSeparator />
                          {transitions.map((tr) => (
                            <ContextMenuItem
                              key={tr.target}
                              onClick={() => handleStatusChange(r, tr.target)}
                            >
                              {t(`statusActions.${tr.actionKey}`)}
                            </ContextMenuItem>
                          ))}
                        </>
                      )}
                    </ContextMenuContent>
                  </ContextMenu>
                )
              })
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

      <VehiclePickerDialog
        open={showPicker}
        onOpenChange={setShowPicker}
        vehicles={vehicles}
        customers={customers}
        title={t('selectVehicle')}
      />

      {notifyCustomer && (
        <NotifyCustomerDialog
          open={showNotifyDialog}
          onOpenChange={setShowNotifyDialog}
          customer={notifyCustomer}
          defaultMessage={notifyMessage}
          emailSubject={t('emailSubject', { status: notifyStatus })}
          smsEnabled={smsEnabled}
          emailEnabled={emailEnabled}
          relatedEntityType="work-order"
        />
      )}
    </div>
  )
}
