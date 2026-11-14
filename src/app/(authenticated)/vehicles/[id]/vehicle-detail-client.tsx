'use client'

import { DEFAULT_CURRENCY_CODE } from '@/lib/currencies'
import { useDebouncedSearch } from '@/hooks/use-debounced-search'
import { Fragment, useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useFormatDate } from '@/lib/use-format-date'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ButtonGroup, ButtonGroupSeparator } from '@/components/ui/button-group'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useGlassModal } from '@/components/glass-modal'
import { VehicleForm } from '@/features/vehicles/Components/VehicleForm'
import { NoteForm } from '@/features/vehicles/Components/NoteForm'
import { ReminderForm } from '@/features/vehicles/Components/ReminderForm'
import { FindingForm } from '@/features/vehicles/Components/FindingForm'
import { VehicleSafetyPanel } from '@/features/vehicles/Components/VehicleSafetyPanel'
import { VehicleActivityFeed, type FeedFilter } from './vehicle-activity-feed'
import { useJobWarningText } from './job-warning'
import type { VehicleJobWarning } from '@/features/vehicles/Lib/vehicleJobWarnings'
import { NotesTable } from './notes-table'
import { FindingsTable } from './findings-table'
import {
  VehicleTireSets,
  type VehicleTireSet,
} from '@/features/tire-hotel/Components/VehicleTireSets'
import { toast } from 'sonner'
import { deleteNote, toggleNotePin } from '@/features/vehicles/Actions/noteActions'
import { toggleReminder, deleteReminder } from '@/features/vehicles/Actions/reminderActions'
import { deleteFinding } from '@/features/vehicles/Actions/findingActions'
import { createServiceRecord } from '@/features/vehicles/Actions/serviceActions'
import { unarchiveVehicle } from '@/features/vehicles/Actions/unarchiveVehicle'
import { deleteVehicle } from '@/features/vehicles/Actions/deleteVehicle'
import {
  dismissMaintenance,
  undismissMaintenance,
} from '@/features/vehicles/Actions/dismissMaintenance'
import { ArchiveVehicleDialog } from '@/features/vehicles/Components/ArchiveVehicleDialog'
import {
  aiSummarizeVehicleHistory,
  aiGetCommonIssues,
  aiClearMessage,
} from '@/features/ai/Actions/aiActions'
import { AI_MESSAGE_TYPES } from '@/features/ai/constants'
import { AskAiSheet } from '@/features/ai/Components/AskAiSheet'
import { useFormatCurrency } from '@/components/currency-settings-context'
import {
  AlertTriangle,
  Archive,
  ChevronDown,
  ChevronRight,
  LayoutList,
  Download,
  Search,
  StickyNote,
  Camera,
  Ship,
  ArchiveRestore,
  ArrowLeft,
  Bell,
  Car,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  EyeOff,
  FileText,
  Sparkles,
  Loader2,
  MoreVertical,
  Pencil,
  Pin,
  Plus,
  Trash2,
  Undo2,
  Wrench,
  X,
} from 'lucide-react'
import { NewInspectionDialog } from '@/features/inspections/Components/NewInspectionDialog'
import { NewQuoteDialog } from '@/features/quotes/Components/NewQuoteDialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useFormatter, useTranslations } from 'next-intl'
import { useServiceType } from '@/components/service-type-context'
import { formatTypeKey } from '@/features/vehicles/Lib/typeKey'
import { useTypeKeyEnabled } from '@/components/type-key-context'
import { sanitizeHtml } from '@/lib/sanitize-html'
import { PlateChip } from '@/components/plate-chip'
import {
  useSwitchVehiclePageLayout,
  useVehiclePageBackHint,
} from '@/features/vehicles/Components/VehiclePageLayoutSwitch'
import { FeatureHint } from '@/components/feature-hint'
import { PhotoHandoffButton } from '@/features/vehicles/Components/service-page/PhotoHandoffButton'
import { CopyValue } from '@/components/copy-value'
import { StatusLamp, type LampTone } from '@/components/status-lamp'
import { cn } from '@/lib/utils'

interface PaginatedServices {
  records: {
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
  }[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

interface PaginatedNotes {
  records: {
    id: string
    title: string
    content: string
    isPinned: boolean
    createdAt: Date
  }[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

interface PaginatedFindings {
  records: {
    id: string
    description: string
    severity: string
    status: string
    notes: string | null
    imageUrls: string[]
    createdAt: Date
    serviceRecord: { id: string; title: string } | null
    resolvedServiceRecord: { id: string; title: string } | null
  }[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

interface VehicleDetail {
  id: string
  make: string
  model: string
  year: number
  vin: string | null
  licensePlate: string | null
  color: string | null
  mileage: number
  fuelType: string | null
  transmission: string | null
  engineSize: string | null
  engineCode: string | null
  hsn: string | null
  tsn: string | null
  purchaseDate: Date | null
  purchasePrice: number | null
  imageUrl: string | null
  isArchived: boolean
  archiveReason: string | null
  soldReportedAt?: Date | null
  customerId: string | null
  customer: {
    id: string
    name: string
    company: string | null
    email: string | null
    phone: string | null
  } | null
  inspectionStatus?: {
    dueAt: Date | null
    lastAt: Date | null
    source: string
    checkedAt: Date | null
    registered: boolean | null
  } | null
  serviceRecords: {
    id: string
    cost: number
    totalAmount: number
    serviceDate?: Date
    startDateTime?: Date | null
    invoiceDate?: Date | null
  }[]
  /** Every work order added up; `serviceRecords` holds only the latest ten. */
  lifetimeSpend?: number
  reminders: {
    id: string
    title: string
    description: string | null
    dueDate: Date | null
    hasDueTime?: boolean
    dueMileage: number | null
    isCompleted: boolean
    createdAt: Date
  }[]
  aiMessages: { type: string; content: string; updatedAt: Date }[]
  _count: {
    serviceRecords: number
    notes: number
    reminders: number
    findings: number
  }
}

interface QuoteRecord {
  id: string
  quoteNumber: string | null
  title: string
  status: string
  totalAmount: number
  createdAt: Date
  validUntil: Date | null
  customer: { id: string; name: string } | null
}

function findingTone(severity: string): LampTone {
  if (severity === 'urgent') return 'red'
  if (severity === 'needs_work') return 'amber'
  return 'slate'
}

/** Overdue is red, inside thirty days amber, further out a plain grey. */
function inspectionTone(dueAt: Date): LampTone {
  const left = new Date(dueAt).getTime() - Date.now()
  if (left < 0) return 'red'
  if (left < 30 * 86_400_000) return 'amber'
  return 'slate'
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

/**
 * True only once `on` has stayed true for `delay` ms. A wait the server answers
 * quickly shows no spinner at all, rather than one that flickers.
 */
function useDelayedFlag(on: boolean, delay = 300) {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    if (!on) {
      setShown(false)
      return
    }
    const timer = setTimeout(() => setShown(true), delay)
    return () => clearTimeout(timer)
  }, [on, delay])
  return shown
}

const FUEL_VALUES = new Set(['gasoline', 'diesel', 'electric', 'hybrid', 'other'])
const TRANSMISSION_VALUES = new Set(['automatic', 'manual', 'cvt'])

type CommonIssue = {
  title: string
  description: string
  cost: string
  risk: string
  severity?: number
}

/** The stored common-issues answer: the list, the raw text if it is not JSON, or null. */
function parseCommonIssues(content: string | undefined): CommonIssue[] | string | null {
  if (!content) return null
  try {
    const raw = content.replace(/^```json?\n?|\n?```$/g, '').trim()
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as CommonIssue[]) : content
  } catch {
    return content
  }
}

const NO_WARNINGS: VehicleJobWarning[] = []

export function VehicleDetailClient({
  vehicle,
  paginatedServices,
  paginatedNotes,
  serviceSearch,
  currencyCode = DEFAULT_CURRENCY_CODE,
  unitSystem = 'imperial',
  predictionData,
  inspections,
  inspectionTemplates,
  quotes = [],
  aiEnabled = false,
  safetyAvailable = false,
  paginatedFindings,
  tireSets = [],
  jobWarnings = NO_WARNINGS,
  feedNotes,
}: {
  vehicle: VehicleDetail
  paginatedServices: PaginatedServices
  paginatedNotes: PaginatedNotes
  paginatedFindings: PaginatedFindings
  /** Empty unless the shop runs a tire hotel and this vehicle has sets in it. */
  tireSets?: VehicleTireSet[]
  serviceSearch: string
  /** No longer read: the history is searched, not filtered by type. */
  serviceRecordType?: string
  /** Booking problems on the vehicle's open jobs: a technician away, a clash, a closed day. */
  jobWarnings?: VehicleJobWarning[]
  /** Every note for the feed, rather than the notes table's current page. */
  feedNotes?: PaginatedNotes['records']
  currencyCode?: string
  unitSystem?: 'metric' | 'imperial'
  predictionData?: {
    predictedMileage: number
    avgPerDay: number
    lastServiceMileage: number
    serviceInterval: number
    mileageSinceLastService: number
    status: 'overdue' | 'approaching' | 'ok' | null
    maintenanceDismissed: boolean
    confidencePercent: number
  } | null
  inspections?: {
    id: string
    status: string
    createdAt: Date
    completedAt: Date | null
    template: { id: string; name: string }
    items: { id: string; condition: string }[]
  }[]
  inspectionTemplates?: { id: string; name: string; isDefault: boolean }[]
  quotes?: QuoteRecord[]
  aiEnabled?: boolean
  /** A safety authority such as NHTSA is connected and this vehicle has a model to ask about. */
  safetyAvailable?: boolean
}) {
  const formatCurrency = useFormatCurrency()
  // Readings in the app's language (225 040, not the browser's 225,040), like the money beside them.
  const numberFormat = useFormatter()
  const formatNumber = (n: number) => numberFormat.number(n)
  const serviceType = useServiceType()
  const isMarine = serviceType === 'marine'
  const distUnit = isMarine ? 'hrs' : unitSystem === 'metric' ? 'km' : 'mi'
  const router = useRouter()
  const searchParams = useSearchParams()
  const { formatDate, formatDateTime } = useFormatDate()
  const t = useTranslations('vehicles.detail')
  const typeKeyEnabled = useTypeKeyEnabled()
  const ti = useTranslations('vehicles.inspections')
  const tr = useTranslations('vehicles.reminders')
  const tc = useTranslations('common.buttons')

  const tq = useTranslations('vehicles.quotes')
  const tNotes = useTranslations('vehicles.notes')
  const tf = useTranslations('vehicles.findings')
  const tErr = useTranslations('common.errors')
  const tLayout = useTranslations('vehicles.detail.layout')
  const switchLayout = useSwitchVehiclePageLayout()
  const backHint = useVehiclePageBackHint()
  const tServices = useTranslations('vehicles.services')
  const tPlate = useTranslations('vehicles.plateLookup')
  const tForm = useTranslations('vehicles.form')
  // What the right-hand side shows: the history (all of it, or one kind), or
  // one of the lists that hang off the vehicle. `tab` keeps its old values so
  // links into the page from before still land in the right place.
  const validTabs = [
    'all',
    'services',
    'quotes',
    'inspections',
    'findings',
    'notes',
    'reminders',
  ] as const
  const tabParam = searchParams.get('tab')
  const activeTab = validTabs.includes(tabParam as (typeof validTabs)[number])
    ? (tabParam as (typeof validTabs)[number])
    : 'all'
  const isFeedView =
    activeTab === 'all' ||
    activeTab === 'services' ||
    activeTab === 'quotes' ||
    activeTab === 'inspections'

  // Where to return after leaving this page (e.g. arrived from a customer
  // page). Restricted to internal paths; tab changes preserve the param.
  const rawBack = searchParams.get('back')
  const backHref =
    rawBack && rawBack.startsWith('/') && !rawBack.startsWith('//') ? rawBack : '/vehicles'

  // The history's own scroll area, put back to the top when the view changes.
  const historyScroll = useRef<HTMLDivElement>(null)
  const handleTabChange = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams.toString())
      if (value === 'all') {
        params.delete('tab')
      } else {
        params.set('tab', value)
      }
      const query = params.toString()
      // Every view's data is already on the page, so switching is the page's
      // own business: the address follows for links and reloads, and Next
      // keeps useSearchParams in step, with no round trip to the server.
      window.history.replaceState(null, '', `/vehicles/${vehicle.id}${query ? `?${query}` : ''}`)
      historyScroll.current?.scrollTo({ top: 0 })
    },
    [searchParams, vehicle.id]
  )
  const modal = useGlassModal()
  const [showEditForm, setShowEditForm] = useState(false)
  const [showNoteForm, setShowNoteForm] = useState(false)
  const [editingNote, setEditingNote] = useState<PaginatedNotes['records'][number] | undefined>()
  const [showReminderForm, setShowReminderForm] = useState(false)
  const [editingReminder, setEditingReminder] = useState<
    VehicleDetail['reminders'][number] | undefined
  >()
  const [showFindingForm, setShowFindingForm] = useState(false)
  const [editingFinding, setEditingFinding] = useState<
    PaginatedFindings['records'][number] | undefined
  >()
  const [reminderFilter, setReminderFilter] = useState<'active' | 'completed' | 'all'>('active')
  const [showImage, setShowImage] = useState(false)
  const [selectedNote, setSelectedNote] = useState<PaginatedNotes['records'][number] | null>(null)
  const [showArchiveDialog, setShowArchiveDialog] = useState(false)
  const [showNewQuoteDialog, setShowNewQuoteDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showNewInspection, setShowNewInspection] = useState(false)
  const [isDismissPending, startDismissTransition] = useTransition()
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false)
  const [commonIssuesLoading, setCommonIssuesLoading] = useState(false)
  const [activeAiPanel, setActiveAiPanel] = useState<'summary' | 'issues' | null>(null)

  const storedSummary = vehicle.aiMessages.find((m) => m.type === AI_MESSAGE_TYPES.SUMMARY)
  const storedCommonIssues = vehicle.aiMessages.find(
    (m) => m.type === AI_MESSAGE_TYPES.COMMON_ISSUES
  )

  // An action that cannot reach the server throws instead of answering, and a
  // throw inside a transition replaces the page with the error screen, so it
  // is caught and reported the way a refusal is.
  const handleDismissMaintenance = () => {
    startDismissTransition(async () => {
      const result = await dismissMaintenance(vehicle.id).catch(() => null)
      if (!result?.success) toast.error(result?.error || t('maintenanceChangeError'))
    })
  }

  const handleUndismissMaintenance = () => {
    startDismissTransition(async () => {
      const result = await undismissMaintenance(vehicle.id).catch(() => null)
      if (!result?.success) toast.error(result?.error || t('maintenanceChangeError'))
    })
  }

  const now = new Date()
  const sevenDaysFromNow = new Date(now)
  sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7)

  const getUrgency = (r: VehicleDetail['reminders'][number]) => {
    if (r.isCompleted) return 'completed'
    if (r.dueDate && new Date(r.dueDate) < now) return 'overdue'
    if (r.dueDate && new Date(r.dueDate) <= sevenDaysFromNow) return 'due-soon'
    return 'normal'
  }

  const overdueCount = vehicle.reminders.filter(
    (r) => !r.isCompleted && r.dueDate && new Date(r.dueDate) < now
  ).length

  const filteredReminders = vehicle.reminders.filter((r) => {
    if (reminderFilter === 'active') return !r.isCompleted
    if (reminderFilter === 'completed') return r.isCompleted
    return true
  })

  // Work orders are searched on the server (it reads concerns and diagnostic
  // notes too); the rest of the history is narrowed on the page.
  const [isSearching, startSearch] = useTransition()
  const showSearching = useDelayedFlag(isSearching)
  const {
    value: searchInput,
    setValue: setSearchInput,
    commitNow: commitSearch,
  } = useDebouncedSearch(serviceSearch, (term) => {
    const params = new URLSearchParams(searchParams.toString())
    if (term) params.set('search', term)
    else params.delete('search')
    params.delete('page')
    const query = params.toString()
    startSearch(() => {
      router.replace(`/vehicles/${vehicle.id}${query ? `?${query}` : ''}`, { scroll: false })
    })
  })

  const [isExporting, setIsExporting] = useState(false)
  // The menu closes on the click, so the export says what it is doing in a
  // toast instead: only once it has taken long enough to notice, and it
  // turns into the outcome when the file arrives.
  const handleExportPdf = async () => {
    if (isExporting) return
    setIsExporting(true)
    let toastId: string | number | undefined
    const slow = setTimeout(() => {
      toastId = toast.loading(t('exportPreparing'))
    }, 300)
    try {
      const res = await fetch(`/api/protected/vehicles/${vehicle.id}/service-history-pdf`)
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
      clearTimeout(slow)
      if (toastId !== undefined) toast.success(t('exportDone'), { id: toastId })
    } catch {
      clearTimeout(slow)
      toast.error(t('exportFailed'), toastId !== undefined ? { id: toastId } : undefined)
    } finally {
      setIsExporting(false)
    }
  }

  const vehicleName = `${vehicle.year} ${vehicle.make} ${vehicle.model}`
  const VehicleIcon = isMarine ? Ship : Car

  // Without a lifetime total from the server, the latest ten are the best guess.
  const lifetimeSpend =
    vehicle.lifetimeSpend ??
    vehicle.serviceRecords.reduce((sum, s) => sum + (s.totalAmount > 0 ? s.totalAmount : s.cost), 0)

  const openFindings = paginatedFindings.records.filter((f) => f.status === 'open')
  const warningText = useJobWarningText()
  const activeReminders = vehicle.reminders.filter((r) => !r.isCompleted)

  const optionLabel = (value: string | null, known: Set<string>) => {
    if (!value) return null
    const key = value.toLowerCase()
    return known.has(key) ? tForm(key as Parameters<typeof tForm>[0]) : value
  }
  const fuelLabel = optionLabel(vehicle.fuelType, FUEL_VALUES)
  const transmissionLabel = optionLabel(vehicle.transmission, TRANSMISSION_VALUES)
  const specLine = [vehicle.engineSize, fuelLabel, transmissionLabel, vehicle.color].filter(
    (part): part is string => Boolean(part)
  )
  const specs = (
    [
      [tPlate('engine'), vehicle.engineSize, false],
      [tPlate('engineCode'), vehicle.engineCode, true],
      [tPlate('fuel'), fuelLabel, false],
      [tPlate('transmission'), transmissionLabel, false],
      [tPlate('color'), vehicle.color, false],
      [
        t('typeKey'),
        typeKeyEnabled && (vehicle.hsn || vehicle.tsn)
          ? formatTypeKey(vehicle.hsn, vehicle.tsn)
          : null,
        true,
      ],
    ] as [string, string | null, boolean][]
  ).filter(([, value]) => Boolean(value))

  // The history's chips. Observations and reminders are lists of open items,
  // reached from the open items under the vehicle; while one is showing it
  // gets a chip of its own that leads back.
  const views: { id: (typeof validTabs)[number]; label: string; count: number; alert?: boolean }[] =
    [
      { id: 'all', label: t('feed.all'), count: 0 },
      { id: 'services', label: t('feed.workOrders'), count: vehicle._count.serviceRecords },
      { id: 'inspections', label: t('tabs.inspections'), count: inspections?.length ?? 0 },
      { id: 'quotes', label: t('tabs.quotes'), count: quotes.length },
      { id: 'notes', label: t('tabs.notes'), count: vehicle._count.notes },
    ]
  const listView =
    activeTab === 'findings'
      ? { label: t('tabs.findings'), count: vehicle._count.findings }
      : activeTab === 'reminders'
        ? { label: t('tabs.reminders'), count: vehicle._count.reminders }
        : null
  const [searchOpen, setSearchOpen] = useState(Boolean(serviceSearch))

  const commonIssues = parseCommonIssues(storedCommonIssues?.content)
  const severityLabel = (s: number) => {
    if (s >= 5) return t('severityVeryCommon')
    if (s >= 4) return t('severityCommon')
    if (s >= 3) return t('severityModerate')
    if (s >= 2) return t('severityUncommon')
    return t('severityRare')
  }

  const handleDeleteNote = async (id: string) => {
    const result = await deleteNote(id)
    if (result.success) {
      toast.success(t('noteDeleted'))
      router.refresh()
    } else {
      modal.open('error', tErr('error'), result.error || t('noteDeleteError'))
    }
  }

  const handleTogglePin = async (id: string) => {
    const result = await toggleNotePin(id)
    if (result.success) router.refresh()
  }

  const handleToggleReminder = async (id: string) => {
    const result = await toggleReminder(id)
    if (result.success) router.refresh()
  }

  const handleDeleteReminder = async (id: string) => {
    const result = await deleteReminder(id)
    if (result.success) {
      toast.success(t('reminderDeleted'))
      router.refresh()
    } else {
      modal.open('error', tErr('error'), result.error || t('reminderDeleteError'))
    }
  }

  const handleDeleteFinding = async (id: string) => {
    const result = await deleteFinding(id)
    if (result.success) {
      toast.success(tf('findingDeleted'))
      router.refresh()
    } else {
      modal.open('error', tErr('error'), result.error || tf('deleteError'))
    }
  }

  const [creatingWorkOrder, setCreatingWorkOrder] = useState(false)
  const handleCreateWorkOrderFromFindings = async (findingIds: string[]) => {
    setCreatingWorkOrder(true)
    const selectedFindings = paginatedFindings.records.filter((f) => findingIds.includes(f.id))
    const vehicleName = `${vehicle.year} ${vehicle.make} ${vehicle.model}`
    // An action that cannot reach the server throws instead of answering, so
    // it is caught and reported the way a refusal is.
    const result = await createServiceRecord({
      vehicleId: vehicle.id,
      title: `${vehicleName} - ${tf('sectionTitle')}`,
      type: 'repair',
      status: 'pending',
      laborItems: selectedFindings.map((f) => ({
        description: `${f.description}${f.notes ? ` - ${f.notes}` : ''}`,
        hours: 0,
        rate: 0,
        total: 0,
        pricingType: 'hourly' as const,
      })),
      subtotal: 0,
      taxRate: 0,
      taxAmount: 0,
      totalAmount: 0,
    }).catch(() => null)
    if (result?.success && result.data) {
      const newServiceId = result.data.id
      // Delete the observations that were added to the work order. The work
      // order is made either way; one the server kept is still open on the
      // vehicle, and the person is told rather than left to find it twice.
      const removed = await Promise.all(findingIds.map((id) => deleteFinding(id).catch(() => null)))
      if (removed.some((r) => !r?.success)) toast.error(tf('observationsNotRemoved'))
      router.push(`/vehicles/${vehicle.id}/service/${newServiceId}`)
    } else {
      modal.open('error', tErr('error'), result?.error || tf('workOrderFailed'))
      setCreatingWorkOrder(false)
    }
  }

  const handleUnarchive = async () => {
    const result = await unarchiveVehicle(vehicle.id)
    if (result.success) {
      toast.success(t('vehicleUnarchived'))
      router.refresh()
    } else {
      modal.open('error', tErr('error'), result.error || t('unarchiveError'))
    }
  }

  const handleAiSummary = async () => {
    setAiSummaryLoading(true)
    try {
      const result = await aiSummarizeVehicleHistory(vehicle.id)
      if (result.success && result.data) {
        toast.success(t('aiSummaryGenerated'))
        router.refresh()
      } else {
        toast.error(result.error ?? t('aiSummaryError'))
      }
    } catch {
      toast.error(t('aiSummaryError'))
    } finally {
      setAiSummaryLoading(false)
    }
  }

  const handleCommonIssues = async () => {
    setCommonIssuesLoading(true)
    try {
      const result = await aiGetCommonIssues(vehicle.id)
      if (result.success && result.data) {
        router.refresh()
      } else {
        toast.error(result.error ?? t('aiSummaryError'))
      }
    } catch {
      toast.error(t('aiSummaryError'))
    } finally {
      setCommonIssuesLoading(false)
    }
  }

  const handleClearAiMessage = async (type: string) => {
    try {
      const result = await aiClearMessage(vehicle.id, type)
      if (result.success) {
        if (type === AI_MESSAGE_TYPES.SUMMARY) setActiveAiPanel(null)
        router.refresh()
      }
    } catch {
      toast.error(t('aiSummaryError'))
    }
  }

  const handleDelete = async () => {
    const result = await deleteVehicle(vehicle.id)
    if (result.success) {
      toast.success(t('vehicleDeleted'))
      router.push(backHref)
    } else {
      modal.open('error', tErr('error'), result.error || t('vehicleDeleteError'))
    }
  }

  return (
    <div className="flex flex-col gap-4 xl:h-[calc(100svh-5rem)]">
      {/* Archived banner */}
      {vehicle.isArchived && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
            <Archive className="h-4 w-4 text-amber-600" />
            <span className="font-medium text-amber-600">{t('vehicleArchived')}</span>
            {vehicle.archiveReason && (
              <span className="text-muted-foreground">&mdash; {vehicle.archiveReason}</span>
            )}
          </div>
          <Button size="sm" variant="outline" onClick={handleUnarchive}>
            <ArchiveRestore className="mr-1 h-3.5 w-3.5" />
            {t('unarchive')}
          </Button>
        </div>
      )}

      {rawBack && (
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {tc('back')}
        </Link>
      )}

      <div className="grid items-start gap-5 xl:min-h-0 xl:flex-1 xl:grid-cols-[21.5rem_minmax(0,1fr)] xl:grid-rows-[minmax(0,1fr)] xl:items-stretch">
        {/* The vehicle: who it is, what it is, what is open on it. */}
        <aside
          className="min-w-0 rounded-xl border bg-card p-3 xl:max-h-full xl:self-start xl:overflow-y-auto xl:overflow-x-hidden xl:overscroll-contain"
          aria-label={vehicleName}
        >
          {/* The photo, and the two ways to give it one: from this computer or from a phone. */}
          <div className="group/photo relative">
            {vehicle.imageUrl ? (
              <button
                type="button"
                onClick={() => setShowImage(true)}
                aria-label={vehicleName}
                className="block aspect-[3/2] w-full cursor-zoom-in overflow-hidden rounded-lg bg-muted"
              >
                <img
                  src={vehicle.imageUrl}
                  alt={vehicleName}
                  className="h-full w-full object-cover transition-transform duration-500 group-hover/photo:scale-[1.03]"
                />
              </button>
            ) : (
              <div className="flex aspect-[3/2] w-full items-center justify-center rounded-lg bg-muted">
                <VehicleIcon className="h-16 w-16 text-muted-foreground/25" strokeWidth={1.1} />
              </div>
            )}
            {!vehicle.isArchived && (
              <div
                className={cn(
                  'absolute bottom-2 left-2 flex gap-1.5 transition-opacity',
                  vehicle.imageUrl &&
                    'opacity-0 focus-within:opacity-100 group-hover/photo:opacity-100 [@media(hover:none)]:opacity-100'
                )}
              >
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 bg-card/90 text-xs backdrop-blur"
                  onClick={() => setShowEditForm(true)}
                >
                  <Camera className="mr-1.5 h-3.5 w-3.5" />
                  {vehicle.imageUrl ? t('changePhoto') : t('addPhoto')}
                </Button>
                <PhotoHandoffButton
                  vehicleId={vehicle.id}
                  iconOnly
                  className="bg-card/90 backdrop-blur"
                />
              </div>
            )}
          </div>

          <div className="space-y-2 px-1.5 pt-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              {vehicle.licensePlate && (
                <PlateChip
                  plate={vehicle.licensePlate}
                  size="md"
                  copyLabel={tForm('licensePlate')}
                />
              )}
              {vehicle.inspectionStatus?.dueAt && (
                <span
                  title={
                    vehicle.inspectionStatus.checkedAt
                      ? t('inspectionCheckedAt', {
                          date: formatDate(vehicle.inspectionStatus.checkedAt),
                        })
                      : undefined
                  }
                >
                  <StatusLamp
                    tone={inspectionTone(vehicle.inspectionStatus.dueAt)}
                    className="text-xs"
                  >
                    {t('inspectionDue', { date: formatDate(vehicle.inspectionStatus.dueAt) })}
                  </StatusLamp>
                </span>
              )}
              {vehicle.soldReportedAt && (
                <StatusLamp tone="amber" className="text-xs">
                  {t('soldReported', { date: formatDate(vehicle.soldReportedAt) })}
                </StatusLamp>
              )}
              {vehicle.inspectionStatus?.registered === false && (
                <StatusLamp tone="red" className="text-xs">
                  {t('notRegistered')}
                </StatusLamp>
              )}
            </div>
            <h1 className="font-display text-xl font-semibold leading-tight tracking-tight">
              {vehicleName}
            </h1>
            {specLine.length > 0 && (
              <p className="text-[13px] text-muted-foreground">{specLine.join(' · ')}</p>
            )}
          </div>

          <div className="flex items-center gap-1.5 px-1.5 pt-3">
            {!vehicle.isArchived && (
              <Button
                size="sm"
                variant="outline"
                className="h-8"
                onClick={() => setShowEditForm(true)}
                aria-label={t('editVehicle')}
                title={t('editVehicle')}
              >
                <Pencil className="mr-1 h-3.5 w-3.5" />
                {t('edit')}
              </Button>
            )}
            {aiEnabled && (
              <AskAiSheet
                subject={{ type: 'vehicle', id: vehicle.id }}
                title={vehicleName}
                className="h-8"
              />
            )}
            {/* Right after somebody tries this page, a one-time pointer at
                the menu that takes them back to the classic one. */}
            <FeatureHint
              id="vehicle-page.back-to-classic.v1"
              eligible
              open={backHint.show}
              onDismiss={backHint.dismiss}
              side="right"
              title={tLayout('backHintTitle')}
              body={tLayout('backHintBody')}
            >
              {(hinting) => (
                <span
                  className={cn(
                    'ml-auto rounded-md transition-shadow',
                    hinting && 'ring-2 ring-primary ring-offset-2 ring-offset-card'
                  )}
                >
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
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
                      {aiEnabled && vehicle._count.serviceRecords > 0 && (
                        <DropdownMenuItem onClick={() => setActiveAiPanel('summary')}>
                          <Sparkles className="mr-2 h-4 w-4" />
                          {t('aiSummary')}
                        </DropdownMenuItem>
                      )}
                      {aiEnabled && (
                        <DropdownMenuItem onClick={() => setActiveAiPanel('issues')}>
                          <AlertTriangle className="mr-2 h-4 w-4" />
                          {t('commonIssues')}
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        onClick={handleExportPdf}
                        disabled={isExporting || vehicle._count.serviceRecords === 0}
                      >
                        <Download className="mr-2 h-4 w-4" />
                        {tServices('exportServiceHistory')}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => switchLayout('classic', 'menu')}>
                        <LayoutList className="mr-2 h-4 w-4" />
                        {tLayout('useClassicMenu')}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {vehicle.isArchived ? (
                        <DropdownMenuItem onClick={handleUnarchive}>
                          <ArchiveRestore className="mr-2 h-4 w-4" />
                          {t('unarchive')}
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem onClick={() => setShowArchiveDialog(true)}>
                          <Archive className="mr-2 h-4 w-4" />
                          {t('archive')}
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => setShowDeleteDialog(true)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        {t('delete')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </span>
              )}
            </FeatureHint>
          </div>

          <div className="mx-1.5 my-3 h-px bg-border" />

          <dl className="grid grid-cols-[minmax(5.25rem,auto)_minmax(0,1fr)] gap-x-4 gap-y-2.5 px-1.5 text-[13px]">
            <dt className="text-muted-foreground">{t('owner')}</dt>
            <dd className="min-w-0">
              {vehicle.customer ? (
                <span className="flex min-w-0 items-center gap-2">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[9px] font-semibold text-muted-foreground">
                    {initials(vehicle.customer.name)}
                  </span>
                  <Link
                    href={`/customers/${vehicle.customer.id}`}
                    className="truncate font-medium underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground"
                  >
                    {vehicle.customer.name}
                  </Link>
                </span>
              ) : (
                <span className="text-muted-foreground">{tPlate('noOwner')}</span>
              )}
              {vehicle.customer?.company && (
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                  {vehicle.customer.company}
                </span>
              )}
            </dd>

            {vehicle.customer?.phone && (
              <>
                <dt className="text-muted-foreground">{t('phone')}</dt>
                <dd className="flex min-w-0 items-center gap-1">
                  <a
                    href={`tel:${vehicle.customer.phone}`}
                    className="truncate tabular-nums hover:underline"
                  >
                    {vehicle.customer.phone}
                  </a>
                  <CopyValue value={vehicle.customer.phone} label={t('phone')} className="-my-1" />
                </dd>
              </>
            )}

            {vehicle.customer?.email && (
              <>
                <dt className="text-muted-foreground">{t('email')}</dt>
                <dd className="flex min-w-0 items-center gap-1">
                  <a
                    href={`mailto:${vehicle.customer.email}`}
                    title={vehicle.customer.email}
                    className="truncate hover:underline"
                  >
                    {vehicle.customer.email}
                  </a>
                  <CopyValue value={vehicle.customer.email} label={t('email')} className="-my-1" />
                </dd>
              </>
            )}

            <dt className="text-muted-foreground">
              {isMarine ? tServices('table.mileageMarine') : tServices('table.mileage')}
            </dt>
            <dd className="min-w-0">
              <span className="tabular-nums">
                {formatNumber(vehicle.mileage)} {distUnit}
              </span>
              {predictionData && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="mt-0.5 block w-fit cursor-help text-xs text-muted-foreground underline decoration-dotted decoration-muted-foreground/50 underline-offset-2">
                        {t('predictedToday', {
                          value: formatNumber(predictionData.predictedMileage),
                          unit: distUnit,
                        })}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs text-xs">
                        {t('predictedTooltip')} ({predictionData.confidencePercent}%)
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {predictionData?.status && predictionData.maintenanceDismissed ? (
                <span className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <EyeOff className="h-3 w-3" />
                  {t('dismissed')}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 px-1.5 text-[11px] text-muted-foreground hover:text-foreground"
                    disabled={isDismissPending}
                    onClick={handleUndismissMaintenance}
                  >
                    {isDismissPending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <>
                        <Undo2 className="mr-0.5 h-3 w-3" />
                        {t('undo')}
                      </>
                    )}
                  </Button>
                </span>
              ) : (
                (predictionData?.status === 'overdue' ||
                  predictionData?.status === 'approaching') && (
                  <span className="mt-1 flex items-center gap-1">
                    <StatusLamp
                      tone={predictionData.status === 'overdue' ? 'red' : 'amber'}
                      className="text-xs"
                    >
                      {predictionData.status === 'overdue' ? t('serviceOverdue') : t('serviceSoon')}
                    </StatusLamp>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 text-muted-foreground hover:text-foreground"
                      disabled={isDismissPending}
                      onClick={handleDismissMaintenance}
                      aria-label={t('dismissMaintenance')}
                    >
                      {isDismissPending ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <X className="h-3 w-3" />
                      )}
                    </Button>
                  </span>
                )
              )}
            </dd>

            {vehicle.vin && (
              <>
                <dt className="text-muted-foreground">{tPlate('vin')}</dt>
                <dd className="flex min-w-0 items-center gap-1">
                  <span className="min-w-0 break-all font-mono text-[11.5px] leading-5">
                    {vehicle.vin}
                  </span>
                  <CopyValue value={vehicle.vin} label={tPlate('vin')} className="-my-1" />
                </dd>
              </>
            )}

            {specs.map(([label, value, mono]) => (
              <Fragment key={label}>
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="flex min-w-0 items-center gap-1">
                  <span
                    className={cn('min-w-0 break-words', mono && 'font-mono text-xs leading-5')}
                  >
                    {value}
                  </span>
                  {mono && value && <CopyValue value={value} label={label} className="-my-1" />}
                </dd>
              </Fragment>
            ))}

            {tireSets.some((set) => set.status === 'stored') && (
              <>
                <dt className="text-muted-foreground">{t('tyres')}</dt>
                <dd className="min-w-0 text-[13px]">
                  <VehicleTireSets sets={tireSets} />
                </dd>
              </>
            )}

            {vehicle.purchaseDate && (
              <>
                <dt className="text-muted-foreground">{t('purchasedOn')}</dt>
                <dd>{formatDate(new Date(vehicle.purchaseDate))}</dd>
              </>
            )}

            <dt className="text-muted-foreground">{t('spent')}</dt>
            <dd className="min-w-0">
              <span className="tabular-nums">{formatCurrency(lifetimeSpend, currencyCode)}</span>
              <span className="ml-1.5 text-xs text-muted-foreground">
                {t('spentOver', { count: vehicle._count.serviceRecords })}
              </span>
            </dd>
          </dl>

          <div className="mx-1.5 my-3 h-px bg-border" />

          {/* What is still to do: observations nobody has dealt with, reminders not yet due. */}
          <div className="flex items-center justify-between px-1.5 pb-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
              {t('openItems')}
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground"
                  aria-label={t('addOpenItem')}
                  title={t('addOpenItem')}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => {
                    setEditingFinding(undefined)
                    setShowFindingForm(true)
                  }}
                >
                  <AlertTriangle className="mr-2 h-4 w-4" />
                  {tf('addFinding')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    setEditingReminder(undefined)
                    setShowReminderForm(true)
                  }}
                >
                  <Bell className="mr-2 h-4 w-4" />
                  {tr('addReminder')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          {openFindings.length === 0 && activeReminders.length === 0 && jobWarnings.length === 0 ? (
            <p className="px-1.5 pb-1 text-[13px] text-muted-foreground">{t('nothingOpen')}</p>
          ) : (
            <ul className="space-y-0.5">
              {/* A booking that will not work comes first: it has a date. */}
              {jobWarnings.map((w) => (
                <li key={w.serviceRecordId}>
                  <Link
                    href={`/vehicles/${vehicle.id}/service/${w.serviceRecordId}`}
                    data-testid="open-item-job-warning"
                    className="group flex w-full items-start gap-2.5 rounded-lg px-1.5 py-2 text-left transition-colors hover:bg-muted/50"
                  >
                    <AlertTriangle
                      aria-hidden
                      className="mt-[3px] h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-500"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-medium leading-snug">
                        {warningText.labels(w).join(' · ')}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {t('jobWarning.onJob', {
                          job: w.invoiceNumber || w.title,
                          date: warningText.day(new Date(w.start)),
                        })}
                      </span>
                    </span>
                    <ChevronRight
                      aria-hidden
                      className="mt-[3px] h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                    />
                  </Link>
                </li>
              ))}
              {openFindings.slice(0, 4).map((f) => (
                <li key={f.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingFinding(f)
                      setShowFindingForm(true)
                    }}
                    className="flex w-full items-start gap-2.5 rounded-lg px-1.5 py-2 text-left transition-colors hover:bg-muted/50"
                  >
                    <StatusLamp tone={findingTone(f.severity)} className="mt-[5px]" />
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium leading-snug">
                        {f.description}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {t('observationItem', {
                          severity: tf(
                            `severity.${f.severity}` as
                              | 'severity.urgent'
                              | 'severity.needs_work'
                              | 'severity.monitor'
                          ).toLowerCase(),
                        })}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
              {activeReminders.slice(0, 3).map((r) => {
                const urgency = getUrgency(r)
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingReminder(r)
                        setShowReminderForm(true)
                      }}
                      className="flex w-full items-start gap-2.5 rounded-lg px-1.5 py-2 text-left transition-colors hover:bg-muted/50"
                    >
                      <StatusLamp
                        tone={
                          urgency === 'overdue' ? 'red' : urgency === 'due-soon' ? 'amber' : 'slate'
                        }
                        className="mt-[5px]"
                      />
                      <span className="min-w-0">
                        <span className="block text-[13px] font-medium leading-snug">
                          {r.title}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {t('reminderItem', {
                            due: r.dueDate
                              ? tr('due', {
                                  date: r.hasDueTime
                                    ? formatDateTime(new Date(r.dueDate))
                                    : formatDate(new Date(r.dueDate)),
                                })
                              : r.dueMileage
                                ? tr('dueAt', {
                                    mileage: formatNumber(r.dueMileage),
                                    unit: distUnit,
                                  })
                                : '',
                          })}
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          <div className="mt-1 flex items-center gap-4 border-t px-1.5 pt-2.5">
            <button
              type="button"
              onClick={() => handleTabChange('findings')}
              className={cn(
                'inline-flex items-center gap-1.5 text-xs font-medium transition-colors hover:text-foreground',
                activeTab === 'findings' ? 'text-foreground' : 'text-muted-foreground'
              )}
            >
              {tf('sectionTitle')}
              <span className="tabular-nums opacity-70">{vehicle._count.findings}</span>
            </button>
            <button
              type="button"
              onClick={() => handleTabChange('reminders')}
              className={cn(
                'inline-flex items-center gap-1.5 text-xs font-medium transition-colors hover:text-foreground',
                activeTab === 'reminders' ? 'text-foreground' : 'text-muted-foreground'
              )}
            >
              {t('tabs.reminders')}
              <span
                className={cn(
                  'tabular-nums',
                  overdueCount > 0 ? 'font-semibold text-destructive' : 'opacity-70'
                )}
              >
                {overdueCount || vehicle._count.reminders}
              </span>
            </button>
          </div>
        </aside>

        {/* The vehicle's history, and the lists that hang off it. */}
        <section className="flex min-w-0 flex-col gap-4 xl:min-h-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="scrollbar-none -mx-1 flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto px-1 py-0.5">
              {views.map((view) => (
                <button
                  key={view.id}
                  type="button"
                  aria-pressed={activeTab === view.id}
                  onClick={() => handleTabChange(view.id)}
                  className={cn(
                    'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors',
                    activeTab === view.id
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'bg-card text-foreground/80 hover:border-foreground/25 hover:text-foreground'
                  )}
                >
                  {view.label}
                  {view.count > 0 && (
                    <span
                      className={cn(
                        'text-xs tabular-nums',
                        view.alert
                          ? 'font-semibold text-destructive'
                          : activeTab === view.id
                            ? 'text-primary-foreground/70'
                            : 'text-muted-foreground'
                      )}
                    >
                      {view.count}
                    </span>
                  )}
                </button>
              ))}
              {listView && (
                <button
                  type="button"
                  aria-pressed
                  onClick={() => handleTabChange('all')}
                  className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-primary bg-primary pl-3 pr-2 text-[13px] font-medium text-primary-foreground"
                >
                  {listView.label}
                  <span className="text-xs tabular-nums text-primary-foreground/70">
                    {listView.count}
                  </span>
                  <X className="h-3.5 w-3.5 opacity-70" aria-label={tc('back')} />
                </button>
              )}
            </div>
            {isFeedView && !searchOpen && (
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                aria-label={t('feed.search')}
                title={t('feed.search')}
                onClick={() => setSearchOpen(true)}
              >
                <Search className="h-3.5 w-3.5" />
              </Button>
            )}
            {isFeedView && searchOpen && (
              <form onSubmit={commitSearch} className="relative w-full sm:w-56">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  autoFocus={!serviceSearch}
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onBlur={() => {
                    if (!searchInput) setSearchOpen(false)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setSearchInput('')
                      setSearchOpen(false)
                    }
                  }}
                  placeholder={t('feed.search')}
                  aria-label={t('feed.search')}
                  className="h-8 pl-8 pr-8 text-[13px]"
                />
                {showSearching ? (
                  <Loader2 className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
                ) : (
                  searchInput && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchInput('')
                        setSearchOpen(false)
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
                      aria-label={tc('cancel')}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )
                )}
              </form>
            )}
            {/* A work order is what this page starts most, so it is one click;
                everything else that can be added waits behind the arrow. */}
            {!vehicle.isArchived && (
              <ButtonGroup className="shrink-0">
                <Button size="sm" className="h-8" asChild>
                  <Link href={`/vehicles/${vehicle.id}/service/new`}>
                    <Plus className="mr-1 h-4 w-4" />
                    {t('newWorkOrder')}
                  </Link>
                </Button>
                <ButtonGroupSeparator className="bg-primary-foreground/25" />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="sm"
                      className="h-8 w-8 px-0"
                      aria-label={t('moreToAdd')}
                      title={t('moreToAdd')}
                    >
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-48">
                    <DropdownMenuItem onClick={() => setShowNewQuoteDialog(true)}>
                      <FileText className="mr-2 h-4 w-4" />
                      {tq('newQuote')}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setShowNewInspection(true)}>
                      <ClipboardCheck className="mr-2 h-4 w-4" />
                      {ti('newInspection')}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => {
                        setEditingNote(undefined)
                        setShowNoteForm(true)
                      }}
                    >
                      <StickyNote className="mr-2 h-4 w-4" />
                      {tNotes('addNote')}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        setEditingFinding(undefined)
                        setShowFindingForm(true)
                      }}
                    >
                      <AlertTriangle className="mr-2 h-4 w-4" />
                      {tf('addFinding')}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        setEditingReminder(undefined)
                        setShowReminderForm(true)
                      }}
                    >
                      <Bell className="mr-2 h-4 w-4" />
                      {tr('addReminder')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </ButtonGroup>
            )}
          </div>

          {/* On a wide screen only this part scrolls: the vehicle and the chips stay put. */}
          <div
            ref={historyScroll}
            className="space-y-4 xl:-mr-3 xl:min-h-0 xl:flex-1 xl:overflow-y-auto xl:overscroll-contain xl:pr-3"
          >
            {/* AI Summary Panel */}
            {activeAiPanel === 'summary' && aiEnabled && (
              <Card className="py-0 gap-0 overflow-hidden">
                <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-purple-500" />
                    <h3 className="text-sm font-semibold">{t('aiSummaryTitle')}</h3>
                    {storedSummary && (
                      <span className="text-[11px] text-muted-foreground">
                        {t('aiSummaryUpdated', {
                          date: formatDate(new Date(storedSummary.updatedAt)),
                        })}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1.5 text-xs"
                      onClick={handleAiSummary}
                      disabled={aiSummaryLoading}
                    >
                      {aiSummaryLoading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5" />
                      )}
                      {storedSummary ? t('aiSummaryRegenerate') : t('aiSummaryGenerate')}
                    </Button>
                    {storedSummary && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => handleClearAiMessage(AI_MESSAGE_TYPES.SUMMARY)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-muted-foreground"
                      aria-label={t('closePanel')}
                      title={t('closePanel')}
                      onClick={() => setActiveAiPanel(null)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="px-4 py-3">
                  {aiSummaryLoading && !storedSummary ? (
                    <div className="flex items-center justify-center py-6">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : storedSummary ? (
                    (() => {
                      let summary: {
                        overview: string
                        majorWork: { title: string; date: string | null; cost: number }[]
                        recurringIssues: { title: string; description: string }[]
                        upcomingMaintenance: { item: string; urgency: string; reason: string }[]
                      } | null = null
                      try {
                        const raw = storedSummary.content
                          .replace(/^```json?\n?|\n?```$/g, '')
                          .trim()
                        summary = JSON.parse(raw)
                      } catch {
                        return (
                          <div className="text-sm text-muted-foreground whitespace-pre-wrap">
                            {storedSummary.content}
                          </div>
                        )
                      }
                      if (!summary) return null
                      const urgencyColor: Record<string, string> = {
                        high: 'bg-red-500/10 text-red-600 border-red-500/20',
                        medium: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
                        low: 'bg-green-500/10 text-green-600 border-green-500/20',
                      }
                      return (
                        <div className="space-y-4">
                          <p className="text-sm">{summary.overview}</p>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {summary.majorWork.length > 0 && (
                              <div>
                                <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2 flex items-center gap-1.5">
                                  <Wrench className="h-3.5 w-3.5" />
                                  {t('summaryMajorWork')}
                                </h4>
                                <div className="space-y-1.5">
                                  {summary.majorWork.map((w, i) => (
                                    <div key={i} className="text-sm">
                                      <span className="font-medium">{w.title}</span>
                                      {(w.date || w.cost > 0) && (
                                        <span className="text-xs text-muted-foreground ml-2">
                                          {[
                                            w.date,
                                            w.cost > 0 &&
                                              new Intl.NumberFormat('en-US', {
                                                minimumFractionDigits: 0,
                                              }).format(w.cost),
                                          ]
                                            .filter(Boolean)
                                            .join(' · ')}
                                        </span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {summary.upcomingMaintenance.length > 0 && (
                              <div>
                                <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2 flex items-center gap-1.5">
                                  <Clock className="h-3.5 w-3.5" />
                                  {t('summaryUpcoming')}
                                </h4>
                                <div className="space-y-2">
                                  {summary.upcomingMaintenance.map((m, i) => (
                                    <div key={i}>
                                      <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium">{m.item}</span>
                                        <Badge
                                          variant="outline"
                                          className={`text-[10px] px-1.5 py-0 ${urgencyColor[m.urgency] || urgencyColor.medium}`}
                                        >
                                          {m.urgency}
                                        </Badge>
                                      </div>
                                      <p className="text-xs text-muted-foreground mt-0.5">
                                        {m.reason}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {summary.recurringIssues.length > 0 && (
                              <div className="md:col-span-2">
                                <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2 flex items-center gap-1.5">
                                  <AlertTriangle className="h-3.5 w-3.5" />
                                  {t('summaryRecurringIssues')}
                                </h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                                  {summary.recurringIssues.map((issue, i) => (
                                    <div key={i} className="text-sm">
                                      <span className="font-medium">{issue.title}</span>
                                      <p className="text-xs text-muted-foreground mt-0.5">
                                        {issue.description}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })()
                  ) : (
                    <p className="text-sm text-muted-foreground italic">{t('aiSummaryEmpty')}</p>
                  )}
                </div>
              </Card>
            )}

            {/* Recalls, owner complaints and crash rating for this model year. */}
            {safetyAvailable && !isMarine && (
              <VehicleSafetyPanel
                vehicleId={vehicle.id}
                make={vehicle.make}
                model={vehicle.model}
                year={vehicle.year}
                existingFindings={paginatedFindings.records.map((f) => f.description)}
              />
            )}

            {activeAiPanel === 'issues' && aiEnabled && (
              <Card className="gap-0 overflow-hidden py-0">
                <div className="flex items-center gap-2 border-b px-4 py-2.5">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  <h3 className="text-sm font-semibold">
                    {t('commonIssuesTitle', { make: vehicle.make, model: vehicle.model })}
                  </h3>
                  {storedCommonIssues && (
                    <span className="text-[11px] text-muted-foreground">
                      {t('aiSummaryUpdated', {
                        date: formatDate(new Date(storedCommonIssues.updatedAt)),
                      })}
                    </span>
                  )}
                  <div className="ml-auto flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1.5 text-xs"
                      onClick={handleCommonIssues}
                      disabled={commonIssuesLoading}
                    >
                      {commonIssuesLoading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5" />
                      )}
                      {storedCommonIssues ? t('aiSummaryRegenerate') : t('aiSummaryGenerate')}
                    </Button>
                    {storedCommonIssues && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        aria-label={tc('delete')}
                        title={tc('delete')}
                        onClick={() => handleClearAiMessage(AI_MESSAGE_TYPES.COMMON_ISSUES)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground"
                      aria-label={t('closePanel')}
                      title={t('closePanel')}
                      onClick={() => setActiveAiPanel(null)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                {commonIssuesLoading && !storedCommonIssues ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : commonIssues === null ? (
                  <p className="px-4 py-4 text-sm text-muted-foreground">
                    {t('commonIssuesEmpty')}
                  </p>
                ) : typeof commonIssues === 'string' ? (
                  <p className="whitespace-pre-wrap px-4 py-4 text-sm text-muted-foreground">
                    {commonIssues}
                  </p>
                ) : (
                  <ul className="grid divide-y md:grid-cols-2 md:divide-y-0">
                    {commonIssues.map((issue, i) => {
                      const sev = Math.max(1, Math.min(5, issue.severity ?? 3))
                      return (
                        <li key={i} className="flex items-start gap-3 px-4 py-3">
                          <span title={severityLabel(sev)} className="mt-[7px]">
                            <StatusLamp tone={sev >= 4 ? 'red' : sev >= 3 ? 'amber' : 'slate'} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium leading-snug">{issue.title}</p>
                            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                              {issue.description}
                            </p>
                            {(issue.risk || issue.cost) && (
                              <p className="mt-1 text-[11px] font-medium text-foreground/70">
                                {[issue.risk, issue.cost].filter(Boolean).join(' · ')}
                              </p>
                            )}
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </Card>
            )}

            {isFeedView && (
              <VehicleActivityFeed
                vehicleId={vehicle.id}
                filter={activeTab as FeedFilter}
                search={serviceSearch}
                workOrders={paginatedServices.records}
                quotes={quotes}
                inspections={inspections ?? []}
                notes={feedNotes ?? paginatedNotes.records}
                distUnit={distUnit}
                currencyCode={currencyCode}
                vehicleMileage={vehicle.mileage}
                jobWarnings={jobWarnings}
                onSelectNote={setSelectedNote}
              />
            )}

            {activeTab === 'findings' && (
              <FindingsTable
                vehicleId={vehicle.id}
                records={paginatedFindings.records}
                total={paginatedFindings.total}
                page={paginatedFindings.page}
                pageSize={paginatedFindings.pageSize}
                totalPages={paginatedFindings.totalPages}
                onAddFinding={() => {
                  setEditingFinding(undefined)
                  setShowFindingForm(true)
                }}
                onEditFinding={(f) => {
                  setEditingFinding(f)
                  setShowFindingForm(true)
                }}
                onDeleteFinding={handleDeleteFinding}
                onCreateWorkOrder={handleCreateWorkOrderFromFindings}
                isCreatingWorkOrder={creatingWorkOrder}
              />
            )}

            {activeTab === 'notes' && (
              <NotesTable
                vehicleId={vehicle.id}
                records={paginatedNotes.records}
                total={paginatedNotes.total}
                page={paginatedNotes.page}
                pageSize={paginatedNotes.pageSize}
                totalPages={paginatedNotes.totalPages}
                onSelectNote={setSelectedNote}
                onAddNote={() => {
                  setEditingNote(undefined)
                  setShowNoteForm(true)
                }}
                onTogglePin={handleTogglePin}
                onDeleteNote={handleDeleteNote}
              />
            )}

            {activeTab === 'reminders' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex gap-1 rounded-lg border p-1">
                    {(['active', 'completed', 'all'] as const).map((f) => (
                      <button
                        key={f}
                        onClick={() => setReminderFilter(f)}
                        className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                          reminderFilter === f
                            ? 'bg-primary text-primary-foreground'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {tr(f)}
                      </button>
                    ))}
                  </div>
                  <Button
                    size="sm"
                    onClick={() => {
                      setEditingReminder(undefined)
                      setShowReminderForm(true)
                    }}
                    aria-label={tr('addReminder')}
                    title={tr('addReminder')}
                    className="h-9 w-9 shrink-0 p-0 md:h-8 md:w-auto md:px-3"
                  >
                    <Plus className="h-4 w-4 md:mr-1 md:h-3.5 md:w-3.5" />
                    <span className="hidden md:inline">{tr('addReminder')}</span>
                  </Button>
                </div>

                {filteredReminders.length === 0 ? (
                  <Card className="border-dashed">
                    <CardContent className="flex flex-col items-center py-12">
                      <Bell className="mb-3 h-10 w-10 text-muted-foreground/40" />
                      <p className="text-sm text-muted-foreground">
                        {reminderFilter === 'active'
                          ? tr('emptyActive')
                          : reminderFilter === 'completed'
                            ? tr('emptyCompleted')
                            : tr('empty')}
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-3">
                    {filteredReminders.map((r) => {
                      const urgency = getUrgency(r)
                      return (
                        <Card
                          key={r.id}
                          className={`${
                            urgency === 'overdue'
                              ? 'ring-1 ring-red-500/30'
                              : urgency === 'due-soon'
                                ? 'ring-1 ring-amber-500/30'
                                : ''
                          }`}
                        >
                          <CardContent className="flex items-start justify-between gap-2 p-4">
                            <div className="flex min-w-0 flex-1 items-start gap-3">
                              <button
                                onClick={() => handleToggleReminder(r.id)}
                                className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                                  r.isCompleted
                                    ? 'border-primary bg-primary/10'
                                    : 'border-primary/50 hover:bg-primary/10'
                                }`}
                                aria-label={r.title}
                              >
                                {r.isCompleted && <CheckCircle2 className="h-5 w-5 text-primary" />}
                              </button>
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p
                                    className={`font-medium ${r.isCompleted ? 'line-through text-muted-foreground' : ''}`}
                                  >
                                    {r.title}
                                  </p>
                                  {urgency === 'overdue' && (
                                    <Badge
                                      variant="destructive"
                                      className="text-[10px] px-1.5 py-0"
                                    >
                                      <AlertTriangle className="mr-0.5 h-3 w-3" />
                                      {tr('overdue')}
                                    </Badge>
                                  )}
                                  {urgency === 'due-soon' && (
                                    <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/20 text-[10px] px-1.5 py-0">
                                      <Clock className="mr-0.5 h-3 w-3" />
                                      {tr('dueSoon')}
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  {r.dueDate &&
                                    tr('due', {
                                      date: r.hasDueTime
                                        ? formatDateTime(new Date(r.dueDate))
                                        : formatDate(new Date(r.dueDate)),
                                    })}
                                  {r.dueMileage &&
                                    `${r.dueDate ? ' · ' : ''}${tr('dueAt', { mileage: formatNumber(r.dueMileage), unit: distUnit })}`}
                                </p>
                                {r.description && (
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    {r.description}
                                  </p>
                                )}
                              </div>
                            </div>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-9 w-9 shrink-0 md:h-7 md:w-7"
                                  aria-label={t('openMenu')}
                                >
                                  <MoreVertical className="h-4 w-4 md:h-3.5 md:w-3.5" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={() => {
                                    setEditingReminder(r)
                                    setShowReminderForm(true)
                                  }}
                                >
                                  <Pencil className="mr-2 h-4 w-4" />
                                  {tc('edit')}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="text-destructive"
                                  onClick={() => handleDeleteReminder(r.id)}
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  {tc('delete')}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </CardContent>
                        </Card>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      </div>

      <NewQuoteDialog
        open={showNewQuoteDialog}
        onOpenChange={setShowNewQuoteDialog}
        defaultVehicle={{
          id: vehicle.id,
          make: vehicle.make,
          model: vehicle.model,
          year: vehicle.year,
          licensePlate: vehicle.licensePlate,
          customerId: vehicle.customerId,
          customer: vehicle.customer
            ? { id: vehicle.customer.id, name: vehicle.customer.name }
            : null,
        }}
        defaultCustomer={
          vehicle.customer
            ? {
                id: vehicle.customer.id,
                name: vehicle.customer.name,
                company: vehicle.customer.company,
              }
            : null
        }
      />
      <VehicleForm
        open={showEditForm}
        onOpenChange={setShowEditForm}
        vehicle={vehicle}
        distanceUnit={distUnit}
        // The page's own confirmation does the deleting.
        onDelete={() => {
          setShowEditForm(false)
          setShowDeleteDialog(true)
        }}
      />
      <NoteForm
        vehicleId={vehicle.id}
        open={showNoteForm}
        onOpenChange={setShowNoteForm}
        note={editingNote}
      />
      <Dialog
        open={!!selectedNote}
        onOpenChange={(open) => {
          if (!open) setSelectedNote(null)
        }}
      >
        <DialogContent className="sm:max-w-3xl" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedNote?.isPinned && <Pin className="h-4 w-4 text-primary" />}
              {selectedNote?.title}
            </DialogTitle>
            <p className="text-xs text-muted-foreground">
              {selectedNote?.createdAt && formatDate(new Date(selectedNote.createdAt))}
            </p>
          </DialogHeader>
          <div
            className="notes-content max-h-[60vh] overflow-y-auto text-sm break-all"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(selectedNote?.content ?? '') }}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button
              size="sm"
              variant="ghost"
              className="mr-auto text-muted-foreground hover:text-destructive"
              onClick={() => {
                if (selectedNote) {
                  handleDeleteNote(selectedNote.id)
                  setSelectedNote(null)
                }
              }}
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" />
              {tc('delete')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (selectedNote) {
                  handleTogglePin(selectedNote.id)
                  setSelectedNote(null)
                }
              }}
            >
              <Pin className="mr-1 h-3.5 w-3.5" />
              {selectedNote?.isPinned ? tNotes('unpin') : tNotes('pin')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (selectedNote) {
                  setEditingNote(selectedNote)
                  setSelectedNote(null)
                  setShowNoteForm(true)
                }
              }}
            >
              <Pencil className="mr-1 h-3.5 w-3.5" />
              {t('edit')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <ReminderForm
        vehicleId={vehicle.id}
        open={showReminderForm}
        onOpenChange={setShowReminderForm}
        reminder={editingReminder}
      />
      <FindingForm
        vehicleId={vehicle.id}
        open={showFindingForm}
        onOpenChange={setShowFindingForm}
        finding={editingFinding}
      />
      <NewInspectionDialog
        open={showNewInspection}
        onOpenChange={setShowNewInspection}
        templates={inspectionTemplates || []}
        preselectedVehicle={vehicle}
      />
      <ArchiveVehicleDialog
        open={showArchiveDialog}
        onOpenChange={setShowArchiveDialog}
        vehicleId={vehicle.id}
        vehicleName={`${vehicle.year} ${vehicle.make} ${vehicle.model}`}
      />
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('deleteDescription', { name: `${vehicle.year} ${vehicle.make} ${vehicle.model}` })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {tc('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Image lightbox */}
      {showImage && vehicle.imageUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setShowImage(false)}
        >
          <img
            src={vehicle.imageUrl}
            alt={`${vehicle.year} ${vehicle.make} ${vehicle.model}`}
            className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  )
}
