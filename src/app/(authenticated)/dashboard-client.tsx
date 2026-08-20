'use client'

import { useTableKeyboardNav } from '@/hooks/use-table-keyboard-nav'
import { interactiveRow } from '@/lib/interactive-row'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useFormatDate } from '@/lib/use-format-date'
import { AppCard } from '@/components/app-card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import { TableCellLink } from '@/components/table-cell-link'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { statusColors } from '@/lib/table-utils'
import {
  AlertTriangle,
  ArrowRight,
  Disc3,
  Bell,
  Car,
  Check,
  ClipboardCheck,
  ClipboardList,
  Clock,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  Gauge,
  Loader2,
  BellRing,
  MessageSquare,
  Settings,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Undo2,
  Users,
  X,
} from 'lucide-react'
import { useFormatCurrency } from '@/components/currency-settings-context'
import {
  dismissMaintenance,
  undismissMaintenance,
} from '@/features/vehicles/Actions/dismissMaintenance'
import { updateQuoteRequestStatus } from '@/features/inspections/Actions/quoteRequestActions'
import type { TireHotelSummary } from '@/features/tire-hotel/Actions/getTireHotelSummary'
import { acknowledgeQuoteResponse } from '@/features/quotes/Actions/quoteResponseActions'
import { toast } from 'sonner'
import { convertQuoteToServiceRecord, createQuote } from '@/features/quotes/Actions/quoteActions'
import type { ReactNode } from 'react'
import { DashboardGrid } from '@/features/dashboard/Components/DashboardGrid'
import {
  saveDashboardLayout,
  resetDashboardLayout,
} from '@/features/dashboard/Actions/dashboardLayoutActions'
import {
  DASHBOARD_CARD_IDS,
  DEFAULT_LAYOUT,
  normalizeLayout,
  placeAtBottom,
  type DashboardCardId,
  type DashboardLayout,
} from '@/features/dashboard/dashboard-grid-config'
import { CustomTableCard } from '@/features/dashboard/Components/CustomTableCard'
import { CustomCardDialog } from '@/features/dashboard/Components/CustomCardDialog'
import { deleteDashboardWidget } from '@/features/dashboard/Actions/customCardActions'
import { customCardId, type CustomWidget } from '@/features/dashboard/custom-cards/registry'
import { useConfirm } from '@/components/confirm-dialog'
import { GettingStartedCard } from '@/features/onboarding/Components/GettingStartedCard'
import type { OnboardingChecklistData } from '@/features/onboarding/Actions/checklistActions'

interface ServiceItem {
  id: string
  title: string
  status: string
  techName: string | null
  totalAmount: number
  cost: number
  serviceDate: Date
  startDateTime: Date | null
  customer: { id: string; name: string } | null
  vehicle: {
    id: string
    make: string
    model: string
    year: number
    licensePlate: string | null
    customer: { id: string; name: string } | null
  } | null
}

interface DashboardStats {
  isAdmin: boolean
  activeJobs: number
  pendingJobs: number
  totalParts: number
  /** Parts at or below their reorder point (minQuantity). */
  lowStockParts: number
  totalCustomers: number
  todaysServices: ServiceItem[]
  recentServices: ServiceItem[]
}

interface ReminderItem {
  id: string
  title: string
  description: string | null
  dueDate: Date | null
  dueMileage: number | null
  customer: { id: string; name: string } | null
  vehicle: {
    id: string
    make: string
    model: string
    year: number
    licensePlate: string | null
  } | null
}

interface VehicleDueForService {
  vehicleId: string
  make: string
  model: string
  year: number
  licensePlate: string | null
  predictedMileage: number
  lastServiceMileage: number
  mileageSinceLastService: number
  serviceInterval: number
  status: 'overdue' | 'approaching'
  confidencePercent: number
}

interface DismissedMaintenanceVehicle {
  vehicleId: string
  make: string
  model: string
  year: number
  licensePlate: string | null
  dismissedAt: Date | null
}

interface DashboardInspection {
  id: string
  status: string
  createdAt: Date
  vehicle: {
    id: string
    make: string
    model: string
    year: number
    licensePlate: string | null
  }
  template: { id: string; name: string }
  items: { id: string; condition: string }[]
}

interface DashboardQuoteRequest {
  id: string
  status: string
  message: string | null
  selectedItemIds: string[]
  createdAt: Date
  inspection: {
    id: string
    vehicle: {
      id: string
      make: string
      model: string
      year: number
      licensePlate: string | null
      customer: { id: string; name: string } | null
    }
    items: { id: string; name: string; section: string; condition: string; notes: string | null }[]
  }
}

interface DashboardQuoteResponse {
  id: string
  title: string
  quoteNumber: string | null
  status: string
  customerMessage: string | null
  totalAmount: number
  updatedAt: Date
  vehicleId: string | null
  customer: { name: string } | null
  vehicle: { id: string; make: string; model: string; year: number } | null
}

interface SmsThread {
  customerId: string
  customerName: string
  customerPhone: string | null
  lastMessage: {
    id: string
    body: string
    direction: string
    status: string
    createdAt: string | Date
  }
}

interface DashboardNotification {
  id: string
  type: string
  title: string
  message: string
  entityType: string
  entityId: string
  entityUrl: string
  read: boolean
  createdAt: string | Date
}

interface DashboardObservation {
  id: string
  description: string
  severity: string
  notes: string | null
  createdAt: string | Date
  vehicle: {
    id: string
    make: string
    model: string
    year: number
    licensePlate: string | null
  }
}

const observationSeverityColors: Record<string, string> = {
  urgent: 'bg-red-500/10 text-red-500 border-red-500/20',
  needs_work: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  monitor: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
}

export function DashboardClient({
  stats,
  currencyCode = 'USD',
  upcomingReminders = [],
  vehiclesDueForService = [],
  dismissedMaintenanceVehicles = [],
  unitSystem = 'imperial',
  inProgressInspections = [],
  completedInspections = [],
  quoteRequests = [],
  quoteResponses = [],
  smsThreads = [],
  smsEnabled = false,
  notifications = [],
  recentAuditLogs = [],
  recentObservations = [],
  initialLayout = null,
  customWidgets = [],
  onboardingChecklist = null,
  tireHotelSummary = null,
}: {
  stats: DashboardStats
  currencyCode?: string
  upcomingReminders?: ReminderItem[]
  vehiclesDueForService?: VehicleDueForService[]
  dismissedMaintenanceVehicles?: DismissedMaintenanceVehicle[]
  unitSystem?: 'metric' | 'imperial'
  inProgressInspections?: DashboardInspection[]
  completedInspections?: DashboardInspection[]
  quoteRequests?: DashboardQuoteRequest[]
  quoteResponses?: DashboardQuoteResponse[]
  smsThreads?: SmsThread[]
  smsEnabled?: boolean
  notifications?: DashboardNotification[]
  recentAuditLogs?: {
    id: string
    timestamp: string | Date
    action: string
    entity: string | null
    entityId: string | null
    message: string | null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    metadata?: any
    user: { id: string; name: string | null; email: string | null } | null
  }[]
  recentObservations?: DashboardObservation[]
  initialLayout?: unknown
  customWidgets?: CustomWidget[]
  onboardingChecklist?: OnboardingChecklistData | null
  tireHotelSummary?: TireHotelSummary | null
}) {
  const formatCurrency = useFormatCurrency()
  const t = useTranslations('dashboard')
  const tcm = useTranslations('common.contextMenu')
  const tAudit = useTranslations('audit')
  const distUnit = unitSystem === 'metric' ? 'km' : 'mi'
  const router = useRouter()
  const { formatDate } = useFormatDate()
  const [navigatingId, setNavigatingId] = useState<string | null>(null)
  const recentNav = useTableKeyboardNav()
  const activeNav = useTableKeyboardNav()
  const obsNav = useTableKeyboardNav()
  const [dismissingId, setDismissingId] = useState<string | null>(null)
  const [maintenanceTab, setMaintenanceTab] = useState<'active' | 'dismissed'>('active')
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  // Grid layout: per-user, server-persisted. sms and notifications are
  // mutually exclusive cards, so one of them is never available.
  const confirm = useConfirm()
  const [widgets, setWidgets] = useState<CustomWidget[]>(customWidgets)
  const [layout, setLayout] = useState<DashboardLayout>(() =>
    normalizeLayout(
      initialLayout,
      customWidgets.map((w) => customCardId(w.id))
    )
  )
  const [editing, setEditing] = useState(false)
  const [cardDialogOpen, setCardDialogOpen] = useState(false)
  const [editingWidget, setEditingWidget] = useState<CustomWidget | null>(null)
  const excludedCard: DashboardCardId = smsEnabled ? 'notifications' : 'sms'
  // The getting-started card is offered only while the server says it should
  // show (new org, steps open or done state not yet dismissed).
  // A card whose node renders null still reserves its grid slot, so anything
  // conditional has to be excluded here rather than returned as null.
  const excludedIds = new Set<DashboardCardId>([
    excludedCard,
    ...(onboardingChecklist ? [] : (['gettingStarted'] as const)),
    ...(tireHotelSummary ? [] : (['tireHotel'] as const)),
  ])
  const availableIds = DASHBOARD_CARD_IDS.filter((id) => !excludedIds.has(id))
  const hiddenSet = new Set<string>(layout.hidden)
  const visibleIds = [...availableIds, ...widgets.map((w) => customCardId(w.id))].filter(
    (id) => !hiddenSet.has(id)
  )

  const persistLayout = (next: DashboardLayout) => {
    setLayout(next)
    void saveDashboardLayout(next)
  }
  const commitCards = (cards: DashboardLayout['cards']) => persistLayout({ ...layout, cards })
  const toggleCard = (id: string) =>
    persistLayout({
      ...layout,
      hidden: hiddenSet.has(id) ? layout.hidden.filter((h) => h !== id) : [...layout.hidden, id],
    })
  const handleResetLayout = () => {
    setLayout(
      normalizeLayout(
        DEFAULT_LAYOUT,
        widgets.map((w) => customCardId(w.id))
      )
    )
    void resetDashboardLayout()
  }

  const handleWidgetSaved = (w: CustomWidget) => {
    setWidgets((prev) =>
      prev.some((p) => p.id === w.id) ? prev.map((p) => (p.id === w.id ? w : p)) : [...prev, w]
    )
    const cid = customCardId(w.id)
    if (!layout.cards[cid]) {
      persistLayout({
        ...layout,
        cards: { ...layout.cards, [cid]: placeAtBottom(layout.cards) },
      })
    }
  }

  const handleDeleteWidget = async (w: CustomWidget) => {
    const ok = await confirm({
      title: t('customCards.deleteConfirmTitle'),
      description: t('customCards.deleteConfirmDescription', { name: w.name }),
      confirmLabel: t('customCards.deleteCard'),
      destructive: true,
    })
    if (!ok) return
    const result = await deleteDashboardWidget(w.id)
    if (!result.success) {
      toast.error(result.error || t('customCards.saveError'))
      return
    }
    setWidgets((prev) => prev.filter((p) => p.id !== w.id))
    const cid = customCardId(w.id)
    const cards = { ...layout.cards }
    delete cards[cid]
    persistLayout({
      ...layout,
      cards,
      hidden: layout.hidden.filter((h) => h !== cid),
    })
  }

  const formatRelativeTime = (date: string | Date) => {
    const now = new Date()
    const d = new Date(date)
    const diffMs = now.getTime() - d.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return t('relativeTime.now')
    if (diffMins < 60) return t('relativeTime.minutes', { count: diffMins })
    if (diffHours < 24) return t('relativeTime.hours', { count: diffHours })
    if (diffDays < 7) return t('relativeTime.days', { count: diffDays })
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
  }

  const handleDismiss = async (vehicleId: string) => {
    setDismissingId(vehicleId)
    await dismissMaintenance(vehicleId)
    setDismissingId(null)
    router.refresh()
  }

  const handleRestore = async (vehicleId: string) => {
    setRestoringId(vehicleId)
    await undismissMaintenance(vehicleId)
    setRestoringId(null)
    router.refresh()
  }

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* Quick stats row */}
        <div
          className={`grid grid-cols-2 gap-2 ${stats.isAdmin ? (stats.lowStockParts > 0 ? 'sm:grid-cols-5' : 'sm:grid-cols-4') : 'sm:grid-cols-2'}`}
        >
          <Link
            href="/work-orders?status=active"
            className="rounded-lg border border-card-edge shadow-sm bg-card px-3 py-2 transition-colors hover:bg-muted/50"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">{t('stats.activeJobs')}</span>
              <ClipboardList className="h-3.5 w-3.5 text-muted-foreground/50" />
            </div>
            <p className="text-lg font-bold">{stats.activeJobs}</p>
          </Link>
          <Link
            href="/work-orders?status=pending"
            className="rounded-lg border border-card-edge shadow-sm bg-card px-3 py-2 transition-colors hover:bg-muted/50"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">{t('stats.pending')}</span>
              <Clock className="h-3.5 w-3.5 text-muted-foreground/50" />
            </div>
            <p className="text-lg font-bold">{stats.pendingJobs}</p>
          </Link>
          {stats.isAdmin && (
            <Link
              href="/inventory"
              className="rounded-lg border border-card-edge shadow-sm bg-card px-3 py-2 transition-colors hover:bg-muted/50"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">{t('stats.totalParts')}</span>
                <Settings className="h-3.5 w-3.5 text-muted-foreground/50" />
              </div>
              <p className="text-lg font-bold">{stats.totalParts}</p>
            </Link>
          )}
          {stats.isAdmin && stats.lowStockParts > 0 && (
            <Link
              href="/inventory?lowStock=1"
              className="rounded-lg border border-amber-500/30 bg-amber-50 px-3 py-2 shadow-sm transition-colors hover:bg-amber-100 dark:bg-amber-950/40 dark:hover:bg-amber-950/60"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-amber-700 dark:text-amber-500">
                  {t('stats.lowStock')}
                </span>
                <AlertTriangle className="h-3.5 w-3.5 text-amber-600/70" />
              </div>
              <p className="text-lg font-bold text-amber-700 dark:text-amber-500">
                {stats.lowStockParts}
              </p>
            </Link>
          )}
          {stats.isAdmin && (
            <Link
              href="/customers"
              className="rounded-lg border border-card-edge shadow-sm bg-card px-3 py-2 transition-colors hover:bg-muted/50"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">
                  {t('stats.totalCustomers')}
                </span>
                <Users className="h-3.5 w-3.5 text-muted-foreground/50" />
              </div>
              <p className="text-lg font-bold">{stats.totalCustomers}</p>
            </Link>
          )}
        </div>

        {/* Customize Dashboard */}
        <div className="flex items-center justify-end gap-2">
          {editing ? (
            <>
              <p className="mr-auto hidden text-xs text-muted-foreground sm:block">
                {t('editHint')}
              </p>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    {t('showCards')} ({visibleIds.length}/{availableIds.length})
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-56 p-3">
                  <p className="text-sm font-medium mb-2">{t('showCards')}</p>
                  <div className="space-y-2">
                    {availableIds.map((id) => (
                      <label
                        key={id}
                        className="flex items-center justify-between gap-2 cursor-pointer"
                      >
                        <span className="text-sm">{t(`cards.${id}`)}</span>
                        <Switch
                          size="sm"
                          checked={!hiddenSet.has(id)}
                          onCheckedChange={() => toggleCard(id)}
                        />
                      </label>
                    ))}
                    {widgets.map((w) => (
                      <label
                        key={w.id}
                        className="flex items-center justify-between gap-2 cursor-pointer"
                      >
                        <span className="truncate text-sm">{w.name}</span>
                        <Switch
                          size="sm"
                          checked={!hiddenSet.has(customCardId(w.id))}
                          onCheckedChange={() => toggleCard(customCardId(w.id))}
                        />
                      </label>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5"
                onClick={() => {
                  setEditingWidget(null)
                  setCardDialogOpen(true)
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                {t('customCards.addCard')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5"
                onClick={handleResetLayout}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {t('resetLayout')}
              </Button>
              <Button size="sm" className="h-8 text-xs gap-1.5" onClick={() => setEditing(false)}>
                <Check className="h-3.5 w-3.5" />
                {t('doneEditing')}
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5"
              onClick={() => setEditing(true)}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              {t('customize')}
            </Button>
          )}
        </div>

        {/* Card grid: nodes keyed by card id, rendered by DashboardGrid in the
          user's saved arrangement */}
        {(() => {
          const cardNodes: Partial<Record<string, ReactNode>> = {
            // First-run checklist
            ...(onboardingChecklist
              ? { gettingStarted: <GettingStartedCard data={onboardingChecklist} /> }
              : {}),
            // Vehicles Due for Service
            maintenance: (
              <AppCard
                icon={Gauge}
                title={t('maintenance.title')}
                description={t('maintenance.description')}
                action={
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        onClick={() => router.push('/settings/maintenance')}
                        aria-label={t('maintenance.settingsAriaLabel')}
                      >
                        <Settings className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t('maintenance.settingsAriaLabel')}</TooltipContent>
                  </Tooltip>
                }
                subheader={
                  <div className="flex gap-1">
                    <Button
                      variant={maintenanceTab === 'active' ? 'default' : 'ghost'}
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setMaintenanceTab('active')}
                    >
                      {t('maintenance.active')} ({vehiclesDueForService.length})
                    </Button>
                    <Button
                      variant={maintenanceTab === 'dismissed' ? 'default' : 'ghost'}
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setMaintenanceTab('dismissed')}
                    >
                      {t('maintenance.dismissedTab')} ({dismissedMaintenanceVehicles.length})
                    </Button>
                  </div>
                }
                contentClassName="p-0"
              >
                {maintenanceTab === 'active' && (
                  <div className="divide-y">
                    {vehiclesDueForService.length === 0 ? (
                      <p className="px-5 py-4 text-xs text-muted-foreground">
                        {t('maintenance.noActive')}
                      </p>
                    ) : (
                      vehiclesDueForService.map((v) => (
                        <div
                          key={v.vehicleId}
                          className="flex items-center justify-between px-5 py-3 cursor-pointer hover:bg-muted/50 transition-colors"
                          {...interactiveRow(() => router.push(`/vehicles/${v.vehicleId}`))}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div
                              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                                v.status === 'overdue' ? 'bg-red-500/10' : 'bg-amber-500/10'
                              }`}
                            >
                              {v.status === 'overdue' ? (
                                <AlertTriangle className="h-4 w-4 text-red-500" />
                              ) : (
                                <Clock className="h-4 w-4 text-amber-500" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-sm truncate">
                                {v.year} {v.make} {v.model}
                              </p>
                              <p className="text-xs text-muted-foreground truncate">
                                {v.licensePlate && `${v.licensePlate} · `}
                                {t('maintenance.estimated', {
                                  mileage: v.predictedMileage.toLocaleString(),
                                  unit: distUnit,
                                })}
                                {' · '}
                                {t('maintenance.sinceLastService', {
                                  mileage: v.mileageSinceLastService.toLocaleString(),
                                  unit: distUnit,
                                })}
                                {' · '}
                                {t('maintenance.certainty', { percent: v.confidencePercent })}
                              </p>
                            </div>
                          </div>
                          <div className="shrink-0 ml-3 flex items-center gap-1.5">
                            {v.status === 'overdue' ? (
                              <Badge variant="destructive" className="text-[10px]">
                                {t('maintenance.overdue')}
                              </Badge>
                            ) : (
                              <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/20 text-[10px]">
                                {t('maintenance.approaching')}
                              </Badge>
                            )}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 text-muted-foreground hover:text-foreground"
                                  disabled={dismissingId === v.vehicleId}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleDismiss(v.vehicleId)
                                  }}
                                  aria-label={t('maintenance.dismissAriaLabel')}
                                >
                                  {dismissingId === v.vehicleId ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <X className="h-3.5 w-3.5" />
                                  )}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>{t('maintenance.dismissAriaLabel')}</TooltipContent>
                            </Tooltip>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
                {maintenanceTab === 'dismissed' && (
                  <div className="divide-y">
                    {dismissedMaintenanceVehicles.map((v) => (
                      <div
                        key={v.vehicleId}
                        className="flex items-center justify-between px-5 py-3 cursor-pointer hover:bg-muted/50 transition-colors"
                        {...interactiveRow(() => router.push(`/vehicles/${v.vehicleId}`))}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                            <EyeOff className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate">
                              {v.year} {v.make} {v.model}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {v.licensePlate && `${v.licensePlate} · `}
                              {v.dismissedAt &&
                                t('maintenance.dismissedOn', {
                                  date: formatDate(new Date(v.dismissedAt)),
                                })}
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 shrink-0 ml-3 text-xs text-muted-foreground hover:text-foreground"
                          disabled={restoringId === v.vehicleId}
                          onClick={(e) => {
                            e.stopPropagation()
                            handleRestore(v.vehicleId)
                          }}
                        >
                          {restoringId === v.vehicleId ? (
                            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Undo2 className="mr-1 h-3.5 w-3.5" />
                          )}
                          {t('maintenance.restore')}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </AppCard>
            ),

            // Upcoming Reminders
            reminders: (
              <AppCard
                icon={Bell}
                title={t('reminders.title')}
                badge={upcomingReminders.length || undefined}
                contentClassName="p-0"
                footer={
                  <button
                    type="button"
                    onClick={() => router.push('/reminders')}
                    className="flex w-full items-center justify-between font-medium transition-colors hover:text-foreground"
                  >
                    {t('viewAll')}
                    <ArrowRight className="h-3 w-3" />
                  </button>
                }
              >
                {upcomingReminders.length === 0 ? (
                  <p className="px-5 py-4 text-xs text-muted-foreground">{t('reminders.noData')}</p>
                ) : (
                  <div className="divide-y">
                    {upcomingReminders.map((r) => {
                      const now = new Date()
                      const sevenDaysFromNow = new Date(now)
                      sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7)
                      const isOverdue = r.dueDate && new Date(r.dueDate) < now
                      const isDueSoon =
                        r.dueDate && !isOverdue && new Date(r.dueDate) <= sevenDaysFromNow

                      return (
                        <div
                          key={r.id}
                          className="flex items-center justify-between px-5 py-3 cursor-pointer hover:bg-muted/50 transition-colors"
                          {...interactiveRow(() =>
                            router.push(
                              r.vehicle ? `/vehicles/${r.vehicle.id}?tab=reminders` : '/reminders'
                            )
                          )}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div
                              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                                isOverdue
                                  ? 'bg-red-500/10'
                                  : isDueSoon
                                    ? 'bg-amber-500/10'
                                    : 'bg-primary/10'
                              }`}
                            >
                              {isOverdue ? (
                                <AlertTriangle className="h-4 w-4 text-red-500" />
                              ) : isDueSoon ? (
                                <Clock className="h-4 w-4 text-amber-500" />
                              ) : (
                                <Bell className="h-4 w-4 text-primary" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-sm truncate">{r.title}</p>
                              <p className="text-xs text-muted-foreground truncate">
                                {r.vehicle
                                  ? `${r.vehicle.year} ${r.vehicle.make} ${r.vehicle.model}${r.vehicle.licensePlate ? ` · ${r.vehicle.licensePlate}` : ''}`
                                  : (r.customer?.name ?? '')}
                              </p>
                            </div>
                          </div>
                          <div className="shrink-0 ml-3">
                            {isOverdue && (
                              <Badge variant="destructive" className="text-[10px]">
                                {t('reminders.overdue')}
                              </Badge>
                            )}
                            {isDueSoon && (
                              <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/20 text-[10px]">
                                {t('reminders.dueSoon')}
                              </Badge>
                            )}
                            {r.dueDate && !isOverdue && !isDueSoon && (
                              <span className="text-xs text-muted-foreground">
                                {formatDate(new Date(r.dueDate))}
                              </span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </AppCard>
            ),

            // SMS Messages (only offered when SMS is enabled; see availableIds)
            sms: (
              <AppCard
                icon={MessageSquare}
                title={t('messages.title')}
                badge={smsThreads.length || undefined}
                contentClassName="p-0"
                footer={
                  <button
                    type="button"
                    onClick={() => router.push('/messages')}
                    className="flex w-full items-center justify-between font-medium transition-colors hover:text-foreground"
                  >
                    {t('messages.viewAll')}
                    <ArrowRight className="h-3 w-3" />
                  </button>
                }
              >
                {smsThreads.length === 0 ? (
                  <p className="px-5 py-4 text-xs text-muted-foreground">{t('messages.noData')}</p>
                ) : (
                  <div className="divide-y">
                    {smsThreads.map((thread) => (
                      <div
                        key={thread.customerId}
                        className="flex items-center justify-between px-5 py-3 cursor-pointer hover:bg-muted/50 transition-colors"
                        {...interactiveRow(() =>
                          router.push(`/messages?customerId=${thread.customerId}`)
                        )}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                            <MessageSquare className="h-4 w-4 text-primary" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate">{thread.customerName}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {thread.lastMessage.direction === 'outbound' ? t('messages.you') : ''}
                              {thread.lastMessage.body}
                            </p>
                          </div>
                        </div>
                        <span className="shrink-0 ml-3 text-xs text-muted-foreground">
                          {formatRelativeTime(thread.lastMessage.createdAt)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </AppCard>
            ),

            // Recent Notifications (only offered when SMS is not configured)
            notifications: (
              <AppCard
                icon={BellRing}
                title={t('notifications.title')}
                badge={notifications.length || undefined}
                contentClassName="p-0"
              >
                {notifications.length === 0 ? (
                  <p className="px-5 py-4 text-xs text-muted-foreground">
                    {t('notifications.noData')}
                  </p>
                ) : (
                  <div className="divide-y">
                    {notifications.slice(0, 5).map((n) => (
                      <div
                        key={n.id}
                        className="flex items-center justify-between px-5 py-3 cursor-pointer hover:bg-muted/50 transition-colors"
                        {...interactiveRow(() => router.push(n.entityUrl))}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${n.read ? 'bg-muted' : 'bg-primary/10'}`}
                          >
                            <BellRing
                              className={`h-4 w-4 ${n.read ? 'text-muted-foreground' : 'text-primary'}`}
                            />
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate">{n.title}</p>
                            <p className="text-xs text-muted-foreground truncate">{n.message}</p>
                          </div>
                        </div>
                        <span className="shrink-0 ml-3 text-xs text-muted-foreground">
                          {formatRelativeTime(n.createdAt)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </AppCard>
            ),

            // Inspections
            inspections: (
              <AppCard
                icon={ClipboardCheck}
                title={t('inspections.title')}
                contentClassName="p-0"
                footer={
                  <button
                    type="button"
                    onClick={() => router.push('/inspections')}
                    className="flex w-full items-center justify-between font-medium transition-colors hover:text-foreground"
                  >
                    {t('viewAll')}
                    <ArrowRight className="h-3 w-3" />
                  </button>
                }
              >
                {inProgressInspections.length === 0 && completedInspections.length === 0 ? (
                  <p className="px-5 py-4 text-xs text-muted-foreground">
                    {t('inspections.noData')}
                  </p>
                ) : (
                  <div className="divide-y">
                    {inProgressInspections.map((insp) => {
                      const total = insp.items.length
                      const pass = insp.items.filter((i) => i.condition === 'pass').length
                      const fail = insp.items.filter((i) => i.condition === 'fail').length
                      const attention = insp.items.filter((i) => i.condition === 'attention').length
                      const inspected = pass + fail + attention

                      return (
                        <div
                          key={insp.id}
                          className="flex items-center justify-between px-5 py-3 cursor-pointer hover:bg-muted/50 transition-colors"
                          {...interactiveRow(() => router.push(`/inspections/${insp.id}`))}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/10">
                              <ClipboardCheck className="h-4 w-4 text-blue-500" />
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-sm truncate">
                                {insp.vehicle.year} {insp.vehicle.make} {insp.vehicle.model}
                              </p>
                              <p className="text-xs text-muted-foreground truncate">
                                {insp.vehicle.licensePlate && `${insp.vehicle.licensePlate} · `}
                                {insp.template.name} ·{' '}
                                {t('inspections.itemCount', { inspected, total })}
                              </p>
                            </div>
                          </div>
                          <div className="shrink-0 ml-3 flex items-center gap-2">
                            {total > 0 && (
                              <div className="hidden sm:flex h-2 w-20 overflow-hidden rounded-full bg-gray-200">
                                <div
                                  className="bg-emerald-500"
                                  style={{ width: `${(pass / total) * 100}%` }}
                                />
                                <div
                                  className="bg-red-500"
                                  style={{ width: `${(fail / total) * 100}%` }}
                                />
                                <div
                                  className="bg-amber-500"
                                  style={{ width: `${(attention / total) * 100}%` }}
                                />
                              </div>
                            )}
                            <Badge className="bg-blue-500/15 text-blue-600 border-blue-500/20 text-[10px]">
                              {t('inspections.inProgress')}
                            </Badge>
                          </div>
                        </div>
                      )
                    })}
                    {completedInspections.map((insp) => {
                      const total = insp.items.length
                      const pass = insp.items.filter((i) => i.condition === 'pass').length
                      const fail = insp.items.filter((i) => i.condition === 'fail').length
                      const attention = insp.items.filter((i) => i.condition === 'attention').length

                      return (
                        <div
                          key={insp.id}
                          className="flex items-center justify-between px-5 py-3 cursor-pointer hover:bg-muted/50 transition-colors"
                          {...interactiveRow(() => router.push(`/inspections/${insp.id}`))}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10">
                              <Check className="h-4 w-4 text-emerald-500" />
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-sm truncate">
                                {insp.vehicle.year} {insp.vehicle.make} {insp.vehicle.model}
                              </p>
                              <p className="text-xs text-muted-foreground truncate">
                                {insp.vehicle.licensePlate && `${insp.vehicle.licensePlate} · `}
                                {insp.template.name} · {formatDate(new Date(insp.createdAt))}
                              </p>
                            </div>
                          </div>
                          <div className="shrink-0 ml-3 flex items-center gap-2">
                            {total > 0 && (
                              <div className="hidden sm:flex h-2 w-20 overflow-hidden rounded-full bg-gray-200">
                                <div
                                  className="bg-emerald-500"
                                  style={{ width: `${(pass / total) * 100}%` }}
                                />
                                <div
                                  className="bg-red-500"
                                  style={{ width: `${(fail / total) * 100}%` }}
                                />
                                <div
                                  className="bg-amber-500"
                                  style={{ width: `${(attention / total) * 100}%` }}
                                />
                              </div>
                            )}
                            <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/20 text-[10px]">
                              {t('inspections.completed')}
                            </Badge>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </AppCard>
            ),

            // Quote Requests
            quoteRequests: (
              <AppCard
                icon={FileText}
                title={t('quoteRequests.title')}
                badge={quoteRequests.length || undefined}
                description={t('quoteRequests.description')}
                contentClassName="p-0"
                footer={
                  <button
                    type="button"
                    onClick={() => router.push('/inspections')}
                    className="flex w-full items-center justify-between font-medium transition-colors hover:text-foreground"
                  >
                    {t('viewAll')}
                    <ArrowRight className="h-3 w-3" />
                  </button>
                }
              >
                {quoteRequests.length === 0 ? (
                  <p className="px-5 py-4 text-xs text-muted-foreground">
                    {t('quoteRequests.noData')}
                  </p>
                ) : (
                  <div className="divide-y">
                    {quoteRequests.map((req) => {
                      const selectedItems = req.inspection.items.filter((i) =>
                        req.selectedItemIds.includes(i.id)
                      )
                      return (
                        <div key={req.id} className="flex items-center justify-between px-5 py-3">
                          <div
                            className="flex items-center gap-3 min-w-0 cursor-pointer hover:opacity-80"
                            {...interactiveRow(() =>
                              router.push(`/inspections/${req.inspection.id}`)
                            )}
                          >
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                              <FileText className="h-4 w-4 text-primary" />
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-sm truncate">
                                {req.inspection.vehicle.year} {req.inspection.vehicle.make}{' '}
                                {req.inspection.vehicle.model}
                              </p>
                              <p className="text-xs text-muted-foreground truncate">
                                {req.inspection.vehicle.customer?.name &&
                                  `${req.inspection.vehicle.customer.name} · `}
                                {t('quoteRequests.itemsRequested', { count: selectedItems.length })}
                                {req.message && ` · "${req.message}"`}
                              </p>
                            </div>
                          </div>
                          <div className="shrink-0 ml-3 flex items-center gap-1.5">
                            <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px]">
                              {t('quoteRequests.pending')}
                            </Badge>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => {
                                startTransition(async () => {
                                  await updateQuoteRequestStatus(req.id, 'quoted')
                                  const issueItems = req.inspection.items.filter(
                                    (i) => i.condition === 'fail' || i.condition === 'attention'
                                  )
                                  const result = await createQuote({
                                    title: `${req.inspection.vehicle.year} ${req.inspection.vehicle.make} ${req.inspection.vehicle.model} - Inspection Quote`,
                                    vehicleId: req.inspection.vehicle.id,
                                    customerId: req.inspection.vehicle.customer?.id || undefined,
                                    inspectionId: req.inspection.id,
                                    status: 'draft',
                                    laborItems: issueItems.map((item) => ({
                                      description: `${item.name}${item.notes ? ` - ${item.notes}` : ''}`,
                                      hours: 0,
                                      rate: 0,
                                      total: 0,
                                    })),
                                    subtotal: 0,
                                    taxRate: 0,
                                    taxAmount: 0,
                                    discountValue: 0,
                                    discountAmount: 0,
                                    totalAmount: 0,
                                  })
                                  if (result.success && result.data) {
                                    router.push(`/quotes/${result.data.id}`)
                                  } else {
                                    toast.error(result.error || 'Failed to create quote')
                                  }
                                })
                              }}
                            >
                              {t('quoteRequests.createQuote')}
                            </Button>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 text-muted-foreground hover:text-foreground"
                                  onClick={() => {
                                    startTransition(async () => {
                                      await updateQuoteRequestStatus(req.id, 'dismissed')
                                    })
                                  }}
                                  aria-label={t('quoteRequests.dismissAriaLabel')}
                                >
                                  <X className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>{t('quoteRequests.dismissAriaLabel')}</TooltipContent>
                            </Tooltip>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </AppCard>
            ),

            // Customer Quote Responses
            quoteResponses: (
              <AppCard
                icon={FileText}
                title={t('quoteResponses.title')}
                badge={quoteResponses.length || undefined}
                description={t('quoteResponses.description')}
                contentClassName="p-0"
                footer={
                  <button
                    type="button"
                    onClick={() => router.push('/quotes')}
                    className="flex w-full items-center justify-between font-medium transition-colors hover:text-foreground"
                  >
                    {t('viewAll')}
                    <ArrowRight className="h-3 w-3" />
                  </button>
                }
              >
                {quoteResponses.length === 0 ? (
                  <p className="px-5 py-4 text-xs text-muted-foreground">
                    {t('quoteResponses.noData')}
                  </p>
                ) : (
                  <div className="divide-y">
                    {quoteResponses.map((resp) => (
                      <div
                        key={resp.id}
                        className="flex items-center justify-between px-5 py-3 overflow-hidden"
                      >
                        <div
                          className="flex items-center gap-3 min-w-0 cursor-pointer hover:opacity-80"
                          {...interactiveRow(() => router.push(`/quotes/${resp.id}`))}
                        >
                          <div
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                              resp.status === 'accepted' ? 'bg-emerald-500/10' : 'bg-orange-500/10'
                            }`}
                          >
                            {resp.status === 'accepted' ? (
                              <Check className="h-4 w-4 text-emerald-500" />
                            ) : (
                              <FileText className="h-4 w-4 text-orange-500" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate">
                              {resp.title}
                              {resp.quoteNumber && (
                                <span className="ml-1.5 text-muted-foreground font-normal">
                                  ({resp.quoteNumber})
                                </span>
                              )}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {resp.customer?.name && `${resp.customer.name} · `}
                              {resp.status === 'accepted'
                                ? t('quoteResponses.accepted')
                                : t('quoteResponses.changesRequested')}
                              {resp.customerMessage && ` · "${resp.customerMessage}"`}
                            </p>
                          </div>
                        </div>
                        <div className="shrink-0 ml-3 flex flex-wrap items-center gap-1.5 max-w-[50%] justify-end sm:max-w-none sm:flex-nowrap">
                          {resp.status === 'accepted' ? (
                            <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px]">
                              {t('quoteResponses.accepted')}
                            </Badge>
                          ) : (
                            <Badge className="bg-orange-500/10 text-orange-600 border-orange-500/20 text-[10px]">
                              {t('quoteResponses.changesRequested')}
                            </Badge>
                          )}
                          {resp.status === 'accepted' && resp.vehicleId && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => {
                                startTransition(async () => {
                                  const result = await convertQuoteToServiceRecord(
                                    resp.id,
                                    resp.vehicleId!
                                  )
                                  if (result.success && result.data) {
                                    router.push(
                                      `/vehicles/${resp.vehicleId}/service/${result.data.id}`
                                    )
                                  }
                                })
                              }}
                            >
                              <ArrowRight className="mr-1 h-3 w-3" />
                              <span className="hidden sm:inline">
                                {t('quoteResponses.convertToWorkOrder')}
                              </span>
                              <span className="sm:hidden">{t('quoteResponses.convert')}</span>
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => router.push(`/quotes/${resp.id}`)}
                          >
                            <span className="hidden sm:inline">
                              {t('quoteResponses.viewQuote')}
                            </span>
                            <span className="sm:hidden">{t('quoteResponses.view')}</span>
                          </Button>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-muted-foreground hover:text-foreground"
                                onClick={() => {
                                  startTransition(async () => {
                                    await acknowledgeQuoteResponse(resp.id)
                                  })
                                }}
                                aria-label={t('quoteResponses.dismissAriaLabel')}
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{t('quoteResponses.dismissAriaLabel')}</TooltipContent>
                          </Tooltip>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </AppCard>
            ),

            // Recent Completed table
            recentCompleted: (
              <AppCard
                icon={Check}
                title={t('recentCompleted.title')}
                className="lg:col-span-2"
                contentClassName="p-0"
                footer={
                  <button
                    type="button"
                    onClick={() => router.push('/work-orders?status=completed')}
                    className="flex w-full items-center justify-between font-medium transition-colors hover:text-foreground"
                  >
                    {t('viewAll')}
                    <ArrowRight className="h-3 w-3" />
                  </button>
                }
              >
                {/* Card list (phones + small tablets) */}
                <div className="space-y-2 px-3 pb-3 md:hidden">
                  {stats.recentServices.length === 0 ? (
                    <p className="py-4 text-center text-sm text-muted-foreground">
                      {t('recentCompleted.empty')}
                    </p>
                  ) : (
                    stats.recentServices.map((s) => {
                      const displayTotal = s.totalAmount > 0 ? s.totalAmount : s.cost
                      const recordHref = s.vehicle
                        ? `/vehicles/${s.vehicle.id}/service/${s.id}`
                        : `/sales/${s.id}`
                      const rowCustomer = s.customer ?? s.vehicle?.customer
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => {
                            setNavigatingId(s.id)
                            router.push(recordHref)
                          }}
                          className={`w-full rounded-lg border p-2.5 text-left transition-opacity active:bg-muted/50 ${
                            navigatingId === s.id ? 'opacity-50' : ''
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <span className="min-w-0 flex-1 truncate font-medium">{s.title}</span>
                            {stats.isAdmin && (
                              <span className="shrink-0 font-semibold">
                                {formatCurrency(displayTotal, currencyCode)}
                              </span>
                            )}
                          </div>
                          <p className="truncate text-xs text-muted-foreground">
                            {s.vehicle && (
                              <>
                                {s.vehicle.licensePlate && (
                                  <span className="font-mono">{s.vehicle.licensePlate} · </span>
                                )}
                                {s.vehicle.year} {s.vehicle.make} {s.vehicle.model}
                              </>
                            )}
                            {rowCustomer && ` · ${rowCustomer.name}`}
                          </p>
                          <p className="mt-1 font-mono text-xs text-muted-foreground">
                            {formatDate(new Date(s.startDateTime ?? s.serviceDate))}
                          </p>
                        </button>
                      )
                    })
                  )}
                </div>

                <div className="hidden md:block" {...recentNav.containerProps}>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-22.5">{t('recentCompleted.date')}</TableHead>
                        <TableHead>{t('recentCompleted.vehicle')}</TableHead>
                        <TableHead className="hidden sm:table-cell">
                          {t('recentCompleted.customer')}
                        </TableHead>
                        <TableHead>{t('recentCompleted.serviceTitle')}</TableHead>
                        {stats.isAdmin && (
                          <TableHead className="w-22.5 text-right">
                            {t('recentCompleted.total')}
                          </TableHead>
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stats.recentServices.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={stats.isAdmin ? 5 : 4}
                            className="h-20 text-center text-muted-foreground"
                          >
                            {t('recentCompleted.empty')}
                          </TableCell>
                        </TableRow>
                      ) : (
                        stats.recentServices.map((s) => {
                          const displayTotal = s.totalAmount > 0 ? s.totalAmount : s.cost
                          const recordHref = s.vehicle
                            ? `/vehicles/${s.vehicle.id}/service/${s.id}`
                            : `/sales/${s.id}`
                          const rowCustomer = s.customer ?? s.vehicle?.customer
                          return (
                            <ContextMenu key={s.id} modal={false}>
                              <ContextMenuTrigger asChild>
                                <TableRow
                                  className={`cursor-pointer transition-opacity ${navigatingId === s.id ? 'opacity-50' : ''}`}
                                  {...interactiveRow(() => {
                                    setNavigatingId(s.id)
                                    router.push(recordHref)
                                  })}
                                >
                                  <TableCell className="font-mono text-xs">
                                    {formatDate(new Date(s.startDateTime ?? s.serviceDate))}
                                  </TableCell>
                                  <TableCell>
                                    {s.vehicle ? (
                                      <TableCellLink href={`/vehicles/${s.vehicle.id}`} block>
                                        {s.vehicle.licensePlate && (
                                          <span className="font-mono text-sm">
                                            {s.vehicle.licensePlate}
                                          </span>
                                        )}
                                        <p className="text-xs text-muted-foreground">
                                          {s.vehicle.year} {s.vehicle.make} {s.vehicle.model}
                                        </p>
                                      </TableCellLink>
                                    ) : (
                                      <p className="text-xs text-muted-foreground">-</p>
                                    )}
                                  </TableCell>
                                  <TableCell className="hidden sm:table-cell text-muted-foreground">
                                    {rowCustomer ? (
                                      <TableCellLink href={`/customers/${rowCustomer.id}`}>
                                        {rowCustomer.name}
                                      </TableCellLink>
                                    ) : (
                                      '-'
                                    )}
                                  </TableCell>
                                  <TableCell className="font-medium">{s.title}</TableCell>
                                  {stats.isAdmin && (
                                    <TableCell className="text-right font-semibold">
                                      <span className="inline-flex items-center gap-2">
                                        {navigatingId === s.id && (
                                          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                                        )}
                                        {formatCurrency(displayTotal, currencyCode)}
                                      </span>
                                    </TableCell>
                                  )}
                                </TableRow>
                              </ContextMenuTrigger>
                              <ContextMenuContent className="min-w-52">
                                <ContextMenuItem
                                  onClick={() => {
                                    setNavigatingId(s.id)
                                    router.push(recordHref)
                                  }}
                                >
                                  <ExternalLink className="mr-2 h-4 w-4" />
                                  {tcm('open')}
                                </ContextMenuItem>
                                {s.vehicle && (
                                  <ContextMenuItem
                                    onClick={() => router.push(`/vehicles/${s.vehicle?.id}`)}
                                  >
                                    <Car className="mr-2 h-4 w-4" />
                                    {tcm('openVehicle')}
                                  </ContextMenuItem>
                                )}
                                {rowCustomer && (
                                  <ContextMenuItem
                                    onClick={() => router.push(`/customers/${rowCustomer.id}`)}
                                  >
                                    <Users className="mr-2 h-4 w-4" />
                                    {tcm('openCustomer')}
                                  </ContextMenuItem>
                                )}
                              </ContextMenuContent>
                            </ContextMenu>
                          )
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </AppCard>
            ),

            // Active Jobs table
            activeJobs: (
              <AppCard
                icon={Clock}
                title={t('activeJobsTable.title')}
                badge={stats.todaysServices.length || undefined}
                className="lg:col-span-2"
                contentClassName="p-0"
                footer={
                  <button
                    type="button"
                    onClick={() => router.push('/work-orders?status=active')}
                    className="flex w-full items-center justify-between font-medium transition-colors hover:text-foreground"
                  >
                    {t('viewAll')}
                    <ArrowRight className="h-3 w-3" />
                  </button>
                }
              >
                {/* Card list (phones + small tablets) */}
                <div className="space-y-2 px-3 pb-3 md:hidden">
                  {stats.todaysServices.length === 0 ? (
                    <p className="py-4 text-center text-sm text-muted-foreground">
                      {t('activeJobsTable.empty')}
                    </p>
                  ) : (
                    stats.todaysServices.map((s) => {
                      const recordHref = s.vehicle
                        ? `/vehicles/${s.vehicle.id}/service/${s.id}`
                        : `/sales/${s.id}`
                      const rowCustomer = s.customer ?? s.vehicle?.customer
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => {
                            setNavigatingId(s.id)
                            router.push(recordHref)
                          }}
                          className={`w-full rounded-lg border p-2.5 text-left transition-opacity active:bg-muted/50 ${
                            navigatingId === s.id ? 'opacity-50' : ''
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <span className="min-w-0 flex-1 truncate font-medium">{s.title}</span>
                            <Badge
                              variant="outline"
                              className={`shrink-0 text-xs ${statusColors[s.status] || ''}`}
                            >
                              {s.status}
                            </Badge>
                          </div>
                          <p className="truncate text-xs text-muted-foreground">
                            {s.vehicle && (
                              <>
                                {s.vehicle.licensePlate && (
                                  <span className="font-mono">{s.vehicle.licensePlate} · </span>
                                )}
                                {s.vehicle.year} {s.vehicle.make} {s.vehicle.model}
                              </>
                            )}
                            {rowCustomer && ` · ${rowCustomer.name}`}
                            {s.techName && ` · ${s.techName}`}
                          </p>
                        </button>
                      )
                    })
                  )}
                </div>

                <div className="hidden md:block" {...activeNav.containerProps}>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('activeJobsTable.vehicle')}</TableHead>
                        <TableHead className="hidden sm:table-cell">
                          {t('activeJobsTable.customer')}
                        </TableHead>
                        <TableHead>{t('activeJobsTable.serviceTitle')}</TableHead>
                        <TableHead className="w-27.5">{t('activeJobsTable.status')}</TableHead>
                        <TableHead className="hidden md:table-cell">
                          {t('activeJobsTable.tech')}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stats.todaysServices.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="h-20 text-center text-muted-foreground">
                            {t('activeJobsTable.empty')}
                          </TableCell>
                        </TableRow>
                      ) : (
                        stats.todaysServices.map((s) => {
                          const recordHref = s.vehicle
                            ? `/vehicles/${s.vehicle.id}/service/${s.id}`
                            : `/sales/${s.id}`
                          const rowCustomer = s.customer ?? s.vehicle?.customer
                          return (
                            <ContextMenu key={s.id} modal={false}>
                              <ContextMenuTrigger asChild>
                                <TableRow
                                  className={`cursor-pointer transition-opacity ${navigatingId === s.id ? 'opacity-50' : ''}`}
                                  {...interactiveRow(() => {
                                    setNavigatingId(s.id)
                                    router.push(recordHref)
                                  })}
                                >
                                  <TableCell>
                                    {s.vehicle ? (
                                      <TableCellLink href={`/vehicles/${s.vehicle.id}`} block>
                                        {s.vehicle.licensePlate && (
                                          <span className="font-mono text-sm font-medium">
                                            {s.vehicle.licensePlate}
                                          </span>
                                        )}
                                        <p className="text-xs text-muted-foreground">
                                          {s.vehicle.year} {s.vehicle.make} {s.vehicle.model}
                                        </p>
                                      </TableCellLink>
                                    ) : (
                                      <p className="text-xs text-muted-foreground">-</p>
                                    )}
                                  </TableCell>
                                  <TableCell className="hidden sm:table-cell text-muted-foreground">
                                    {rowCustomer ? (
                                      <TableCellLink href={`/customers/${rowCustomer.id}`}>
                                        {rowCustomer.name}
                                      </TableCellLink>
                                    ) : (
                                      '-'
                                    )}
                                  </TableCell>
                                  <TableCell className="font-medium">{s.title}</TableCell>
                                  <TableCell>
                                    <span className="inline-flex items-center gap-2">
                                      {navigatingId === s.id && (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                                      )}
                                      <Badge
                                        variant="outline"
                                        className={`text-xs ${statusColors[s.status] || ''}`}
                                      >
                                        {s.status}
                                      </Badge>
                                    </span>
                                  </TableCell>
                                  <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                                    {s.techName || '-'}
                                  </TableCell>
                                </TableRow>
                              </ContextMenuTrigger>
                              <ContextMenuContent className="min-w-52">
                                <ContextMenuItem
                                  onClick={() => {
                                    setNavigatingId(s.id)
                                    router.push(recordHref)
                                  }}
                                >
                                  <ExternalLink className="mr-2 h-4 w-4" />
                                  {tcm('open')}
                                </ContextMenuItem>
                                {s.vehicle && (
                                  <ContextMenuItem
                                    onClick={() => router.push(`/vehicles/${s.vehicle?.id}`)}
                                  >
                                    <Car className="mr-2 h-4 w-4" />
                                    {tcm('openVehicle')}
                                  </ContextMenuItem>
                                )}
                                {rowCustomer && (
                                  <ContextMenuItem
                                    onClick={() => router.push(`/customers/${rowCustomer.id}`)}
                                  >
                                    <Users className="mr-2 h-4 w-4" />
                                    {tcm('openCustomer')}
                                  </ContextMenuItem>
                                )}
                              </ContextMenuContent>
                            </ContextMenu>
                          )
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </AppCard>
            ),
            // Recent Activity (Audit Logs)
            recentActivity: (
              <AppCard
                icon={ClipboardList}
                title={t('recentActivity')}
                contentClassName="p-0"
                footer={
                  <button
                    type="button"
                    onClick={() => router.push('/audit-log')}
                    className="flex w-full items-center justify-between font-medium transition-colors hover:text-foreground"
                  >
                    {t('viewAll')}
                    <ArrowRight className="h-3 w-3" />
                  </button>
                }
              >
                {recentAuditLogs.length === 0 ? (
                  <p className="px-5 py-4 text-xs text-muted-foreground">{t('noRecentActivity')}</p>
                ) : (
                  <div className="divide-y">
                    {recentAuditLogs.slice(0, 5).map((log) => {
                      const userLabel = log.user?.name ?? log.user?.email ?? t('unknownUser')
                      const meta =
                        (log as unknown as { metadata?: Record<string, unknown> }).metadata || {}
                      const vehicleDisplay =
                        typeof meta['vehicleDisplay'] === 'string'
                          ? (meta['vehicleDisplay'] as string)
                          : undefined
                      const quoteNumber =
                        typeof meta['quoteNumber'] === 'string'
                          ? (meta['quoteNumber'] as string)
                          : undefined
                      // replaceAll, not replace: an action like
                      // "scheduled_message.send_now" has more than one separator.
                      const actionKey = `actions.${log.action.replaceAll('.', '_')}`
                      // has(), not try/catch: next-intl reports a missing message
                      // and returns a placeholder rather than throwing, so a catch
                      // never runs and the raw key reaches the screen.
                      const friendlyAction = tAudit.has(actionKey) ? tAudit(actionKey) : log.action
                      const entityLabel =
                        vehicleDisplay ?? quoteNumber ?? log.entityId?.substring(0, 8)
                      return (
                        <div
                          key={log.id}
                          className="px-5 py-3 text-sm flex items-center justify-between"
                        >
                          <div className="min-w-0">
                            <p className="truncate">
                              <span className="font-medium">{userLabel}</span> {friendlyAction}
                              {entityLabel ? (
                                <>
                                  {' '}
                                  — <span className="text-muted-foreground">{entityLabel}</span>
                                </>
                              ) : null}
                            </p>
                            {log.message && (
                              <p className="text-xs text-muted-foreground truncate">
                                {log.message}
                              </p>
                            )}
                          </div>
                          <div className="shrink-0 ml-3 text-xs text-muted-foreground">
                            {formatDate(new Date(log.timestamp))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </AppCard>
            ),
            // Recent Observations
            recentObservations: (
              <AppCard
                icon={Eye}
                title={t('recentObservations')}
                badge={recentObservations.length || undefined}
                contentClassName="p-0"
                footer={
                  <button
                    type="button"
                    onClick={() => router.push('/observations')}
                    className="flex w-full items-center justify-between font-medium transition-colors hover:text-foreground"
                  >
                    {t('viewAll')}
                    <ArrowRight className="h-3 w-3" />
                  </button>
                }
              >
                {recentObservations.length === 0 ? (
                  <p className="px-5 py-4 text-xs text-muted-foreground">
                    {t('noRecentObservations')}
                  </p>
                ) : (
                  <>
                    {/* Card list (phones + small tablets) */}
                    <div className="space-y-2 px-3 pb-3 md:hidden">
                      {recentObservations.map((obs) => (
                        <button
                          key={obs.id}
                          type="button"
                          onClick={() => router.push(`/vehicles/${obs.vehicle.id}?tab=findings`)}
                          className="w-full rounded-lg border p-2.5 text-left active:bg-muted/50"
                        >
                          <p className="text-xs font-medium">{obs.description}</p>
                          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                            <Badge
                              variant="outline"
                              className={`px-1.5 py-0 text-[10px] ${observationSeverityColors[obs.severity] || ''}`}
                            >
                              {obs.severity}
                            </Badge>
                            <span className="font-mono text-[11px] text-muted-foreground">
                              {obs.vehicle.licensePlate ??
                                `${obs.vehicle.year} ${obs.vehicle.make}`}
                            </span>
                            <span className="text-[11px] text-muted-foreground">
                              {formatRelativeTime(obs.createdAt)}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>

                    <div className="hidden md:block" {...obsNav.containerProps}>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="h-8 w-20">{t('observations.severity')}</TableHead>
                            <TableHead className="h-8 w-24">{t('observations.vehicle')}</TableHead>
                            <TableHead className="h-8">{t('observations.description')}</TableHead>
                            <TableHead className="h-8 w-16 text-right">
                              {t('observations.when')}
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {recentObservations.map((obs) => {
                            const vehicleLabel =
                              obs.vehicle.licensePlate ?? `${obs.vehicle.year} ${obs.vehicle.make}`
                            return (
                              <ContextMenu key={obs.id} modal={false}>
                                <ContextMenuTrigger asChild>
                                  <TableRow
                                    className="cursor-pointer"
                                    {...interactiveRow(() =>
                                      router.push(`/vehicles/${obs.vehicle.id}?tab=findings`)
                                    )}
                                  >
                                    <TableCell className="py-1.5">
                                      <Badge
                                        variant="outline"
                                        className={`text-[10px] px-1.5 py-0 ${observationSeverityColors[obs.severity] || ''}`}
                                      >
                                        {obs.severity}
                                      </Badge>
                                    </TableCell>
                                    <TableCell className="py-1.5 font-mono text-xs text-muted-foreground truncate">
                                      <TableCellLink href={`/vehicles/${obs.vehicle.id}`}>
                                        {vehicleLabel}
                                      </TableCellLink>
                                    </TableCell>
                                    <TableCell className="py-1.5 text-xs font-medium truncate max-w-0">
                                      {obs.description}
                                    </TableCell>
                                    <TableCell className="py-1.5 text-right text-[11px] text-muted-foreground whitespace-nowrap">
                                      {formatRelativeTime(obs.createdAt)}
                                    </TableCell>
                                  </TableRow>
                                </ContextMenuTrigger>
                                <ContextMenuContent className="min-w-52">
                                  <ContextMenuItem
                                    onClick={() =>
                                      router.push(`/vehicles/${obs.vehicle.id}?tab=findings`)
                                    }
                                  >
                                    <ExternalLink className="mr-2 h-4 w-4" />
                                    {tcm('open')}
                                  </ContextMenuItem>
                                  <ContextMenuItem
                                    onClick={() => router.push(`/vehicles/${obs.vehicle.id}`)}
                                  >
                                    <Car className="mr-2 h-4 w-4" />
                                    {tcm('openVehicle')}
                                  </ContextMenuItem>
                                </ContextMenuContent>
                              </ContextMenu>
                            )
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </>
                )}
              </AppCard>
            ),

            // Tire hotel: only present when the module is on, so a shop without
            // it never sees an empty card. Three numbers a shop acts on — room
            // to say yes, work queued, money earned but not yet invoiced.
            tireHotel: tireHotelSummary ? (
              <AppCard
                icon={Disc3}
                title={t('tireHotel.title')}
                contentClassName="space-y-3"
                footer={
                  <button
                    type="button"
                    onClick={() => router.push('/tire-hotel')}
                    className="flex w-full items-center justify-between font-medium transition-colors hover:text-foreground"
                  >
                    <span>{t('tireHotel.viewAll')}</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                }
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm text-muted-foreground">
                    {t('tireHotel.stored', { count: tireHotelSummary.storedSets })}
                  </span>
                  <span className="text-sm font-medium tabular-nums">
                    {t('tireHotel.capacity', {
                      used: tireHotelSummary.used,
                      capacity: tireHotelSummary.capacity,
                    })}
                  </span>
                </div>

                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={
                      tireHotelSummary.capacity > 0 &&
                      tireHotelSummary.used / tireHotelSummary.capacity >= 0.9
                        ? 'h-full bg-amber-500'
                        : 'h-full bg-emerald-500'
                    }
                    style={{
                      width: `${
                        tireHotelSummary.capacity > 0
                          ? Math.min(100, (tireHotelSummary.used / tireHotelSummary.capacity) * 100)
                          : 0
                      }%`,
                    }}
                  />
                </div>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {t('tireHotel.roomLeft', { count: tireHotelSummary.free })}
                </p>

                {/* Outstanding prep is the one number the tire department
                    acts on from here. */}
                <button
                  type="button"
                  onClick={() => router.push('/tire-hotel?status=needs_prep')}
                  className="w-full rounded-lg border p-2.5 text-left transition-colors hover:bg-muted/60"
                >
                  <p className="text-lg font-semibold tabular-nums">{tireHotelSummary.needsPrep}</p>
                  <p className="text-xs text-muted-foreground">{t('tireHotel.needsPrep')}</p>
                </button>
              </AppCard>
            ) : null,
          }
          for (const w of widgets) {
            cardNodes[customCardId(w.id)] = (
              <CustomTableCard
                widget={w}
                editing={editing}
                onEdit={() => {
                  setEditingWidget(w)
                  setCardDialogOpen(true)
                }}
                onDelete={() => handleDeleteWidget(w)}
              />
            )
          }
          return (
            <DashboardGrid
              cards={layout.cards}
              visibleIds={visibleIds}
              editing={editing}
              onCardsCommit={commitCards}
              cardNodes={cardNodes}
            />
          )
        })()}
        <CustomCardDialog
          open={cardDialogOpen}
          onOpenChange={setCardDialogOpen}
          widget={editingWidget}
          onSaved={handleWidgetSaved}
        />
      </div>
    </TooltipProvider>
  )
}
