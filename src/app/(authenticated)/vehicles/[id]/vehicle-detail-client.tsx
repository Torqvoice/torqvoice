'use client'

import { useState, useTransition, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useFormatDate } from '@/lib/use-format-date'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useGlassModal } from '@/components/glass-modal'
import { VehicleForm } from '@/features/vehicles/Components/VehicleForm'
import { NoteForm } from '@/features/vehicles/Components/NoteForm'
import { ReminderForm } from '@/features/vehicles/Components/ReminderForm'
import { ServiceRecordsTable } from './service-records-table'
import { NotesTable } from './notes-table'
import { toast } from 'sonner'
import { deleteNote, toggleNotePin } from '@/features/vehicles/Actions/noteActions'
import { toggleReminder, deleteReminder } from '@/features/vehicles/Actions/reminderActions'
import { unarchiveVehicle } from '@/features/vehicles/Actions/unarchiveVehicle'
import { deleteVehicle } from '@/features/vehicles/Actions/deleteVehicle'
import {
  dismissMaintenance,
  undismissMaintenance,
} from '@/features/vehicles/Actions/dismissMaintenance'
import { ArchiveVehicleDialog } from '@/features/vehicles/Components/ArchiveVehicleDialog'
import { formatCurrency } from '@/lib/format'
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Bell,
  Car,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  DollarSign,
  EyeOff,
  Gauge,
  Loader2,
  MoreVertical,
  Pencil,
  Pin,
  Plus,
  StickyNote,
  Trash2,
  TrendingUp,
  Undo2,
  Wrench,
  X,
} from 'lucide-react'
import { NewInspectionDialog } from '@/features/inspections/Components/NewInspectionDialog'
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
import { useTranslations } from 'next-intl'

interface CustomerOption {
  id: string
  name: string
  company: string | null
}

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
    shopName: string | null
    techName: string | null
    totalAmount: number
    invoiceNumber: string | null
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
  purchaseDate: Date | null
  purchasePrice: number | null
  imageUrl: string | null
  isArchived: boolean
  archiveReason: string | null
  customerId: string | null
  customer: {
    id: string
    name: string
    company: string | null
    email: string | null
    phone: string | null
  } | null
  serviceRecords: {
    id: string
    cost: number
    totalAmount: number
  }[]
  reminders: {
    id: string
    title: string
    description: string | null
    dueDate: Date | null
    dueMileage: number | null
    isCompleted: boolean
    createdAt: Date
  }[]
  _count: {
    serviceRecords: number
    notes: number
    reminders: number
  }
}

export function VehicleDetailClient({
  vehicle,
  customers,
  paginatedServices,
  paginatedNotes,
  serviceSearch,
  serviceType,
  currencyCode = 'USD',
  unitSystem = 'imperial',
  predictionData,
  inspections,
  inspectionTemplates,
}: {
  vehicle: VehicleDetail
  customers: CustomerOption[]
  paginatedServices: PaginatedServices
  paginatedNotes: PaginatedNotes
  serviceSearch: string
  serviceType: string
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
}) {
  const distUnit = unitSystem === 'metric' ? 'km' : 'mi'
  const router = useRouter()
  const searchParams = useSearchParams()
  const { formatDate } = useFormatDate()
  const t = useTranslations('vehicles.detail')
  const ti = useTranslations('vehicles.inspections')
  const tr = useTranslations('vehicles.reminders')
  const tc = useTranslations('common.buttons')

  const validTabs = ['services', 'inspections', 'notes', 'reminders'] as const
  const tabParam = searchParams.get('tab')
  const activeTab = validTabs.includes(tabParam as (typeof validTabs)[number])
    ? (tabParam as string)
    : 'services'

  const handleTabChange = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams.toString())
      if (value === 'services') {
        params.delete('tab')
      } else {
        params.set('tab', value)
      }
      const query = params.toString()
      router.replace(`/vehicles/${vehicle.id}${query ? `?${query}` : ''}`, { scroll: false })
    },
    [searchParams, router, vehicle.id]
  )
  const modal = useGlassModal()
  const [showEditForm, setShowEditForm] = useState(false)
  const [showNoteForm, setShowNoteForm] = useState(false)
  const [editingNote, setEditingNote] = useState<PaginatedNotes['records'][number] | undefined>()
  const [showReminderForm, setShowReminderForm] = useState(false)
  const [editingReminder, setEditingReminder] = useState<
    VehicleDetail['reminders'][number] | undefined
  >()
  const [reminderFilter, setReminderFilter] = useState<'active' | 'completed' | 'all'>('active')
  const [showImage, setShowImage] = useState(false)
  const [selectedNote, setSelectedNote] = useState<PaginatedNotes['records'][number] | null>(null)
  const [showArchiveDialog, setShowArchiveDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showNewInspection, setShowNewInspection] = useState(false)
  const [isDismissPending, startDismissTransition] = useTransition()

  const handleDismissMaintenance = () => {
    startDismissTransition(async () => {
      await dismissMaintenance(vehicle.id)
    })
  }

  const handleUndismissMaintenance = () => {
    startDismissTransition(async () => {
      await undismissMaintenance(vehicle.id)
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

  const totalServiceCost = vehicle.serviceRecords.reduce(
    (sum, s) => sum + (s.totalAmount > 0 ? s.totalAmount : s.cost),
    0
  )

  const handleDeleteNote = async (id: string) => {
    const result = await deleteNote(id)
    if (result.success) {
      toast.success(t('noteDeleted'))
      router.refresh()
    } else {
      modal.open('error', 'Error', result.error || t('noteDeleteError'))
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
      modal.open('error', 'Error', result.error || t('reminderDeleteError'))
    }
  }

  const handleUnarchive = async () => {
    const result = await unarchiveVehicle(vehicle.id)
    if (result.success) {
      toast.success(t('vehicleUnarchived'))
      router.refresh()
    } else {
      modal.open('error', 'Error', result.error || t('unarchiveError'))
    }
  }

  const handleDelete = async () => {
    const result = await deleteVehicle(vehicle.id)
    if (result.success) {
      toast.success(t('vehicleDeleted'))
      router.push('/vehicles')
    } else {
      modal.open('error', 'Error', result.error || t('vehicleDeleteError'))
    }
  }

  return (
    <div className="space-y-4">
      {/* Archived banner */}
      {vehicle.isArchived && (
        <div className="flex items-center justify-between rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
          <div className="flex items-center gap-2 text-sm">
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

      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Link
            href="/vehicles"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('backToVehicles')}
          </Link>
          <div className="flex items-center gap-2">
            {!vehicle.isArchived && (
              <Button variant="outline" size="sm" onClick={() => setShowEditForm(true)}>
                <Pencil className="mr-1 h-3.5 w-3.5" />
                {t('editVehicle')}
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
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
          </div>
        </div>

        <div className="flex items-center gap-3">
          {vehicle.imageUrl ? (
            <button
              onClick={() => setShowImage(true)}
              className="h-11 w-11 overflow-hidden rounded-xl cursor-zoom-in shrink-0"
            >
              <img src={vehicle.imageUrl} alt="" className="h-full w-full object-cover" />
            </button>
          ) : (
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
              <Car className="h-5 w-5 text-primary" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <h1 className="text-lg font-bold leading-tight">
                {vehicle.year} {vehicle.make} {vehicle.model}
              </h1>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {vehicle.licensePlate && <span className="font-mono">{vehicle.licensePlate}</span>}
                {vehicle.vin && (
                  <>
                    <span>&middot;</span>
                    <span className="font-mono">{vehicle.vin}</span>
                  </>
                )}
              </div>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {vehicle.fuelType && (
                <Badge variant="secondary" className="text-xs px-1.5 py-0">
                  {vehicle.fuelType}
                </Badge>
              )}
              {vehicle.transmission && (
                <Badge variant="secondary" className="text-xs px-1.5 py-0">
                  {vehicle.transmission}
                </Badge>
              )}
              {vehicle.engineSize && (
                <Badge variant="secondary" className="text-xs px-1.5 py-0">
                  {vehicle.engineSize}
                </Badge>
              )}
              {vehicle.color && (
                <Badge variant="secondary" className="text-xs px-1.5 py-0">
                  {vehicle.color}
                </Badge>
              )}
              {vehicle.customer && (
                <>
                  <span className="text-muted-foreground/40">|</span>
                  <Link
                    href={`/customers/${vehicle.customer.id}`}
                    className="text-xs font-medium hover:underline"
                  >
                    {vehicle.customer.name}
                  </Link>
                  {vehicle.customer.company && (
                    <span className="text-xs text-muted-foreground">
                      {vehicle.customer.company}
                    </span>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Quick stats */}
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Gauge className="h-3.5 w-3.5" />
            <span className="font-semibold text-foreground">
              {vehicle.mileage.toLocaleString()}
            </span>
            <span className="text-xs">{distUnit}</span>
          </div>
          {predictionData && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <TrendingUp className="h-3.5 w-3.5" />
              <span className="text-xs">
                {unitSystem === 'metric' ? t('predictedKm') : t('predictedMileage')}
              </span>
              <span className="font-semibold text-foreground">
                ~{predictionData.predictedMileage.toLocaleString()}
              </span>
              <span className="text-[10px] text-muted-foreground/70">
                ({predictionData.confidencePercent}%)
              </span>
              {predictionData.status && predictionData.maintenanceDismissed ? (
                <>
                  <Badge variant="outline" className="text-[10px] ml-1 text-muted-foreground">
                    <EyeOff className="mr-0.5 h-3 w-3" />
                    {t('dismissed')}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
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
                </>
              ) : (
                <>
                  {predictionData.status === 'overdue' && (
                    <>
                      <Badge variant="destructive" className="text-[10px] ml-1">
                        {t('serviceOverdue')}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 text-muted-foreground hover:text-foreground ml-0.5"
                        disabled={isDismissPending}
                        onClick={handleDismissMaintenance}
                      >
                        {isDismissPending ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <X className="h-3 w-3" />
                        )}
                      </Button>
                    </>
                  )}
                  {predictionData.status === 'approaching' && (
                    <>
                      <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/20 text-[10px] ml-1">
                        {t('serviceSoon')}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 text-muted-foreground hover:text-foreground ml-0.5"
                        disabled={isDismissPending}
                        onClick={handleDismissMaintenance}
                      >
                        {isDismissPending ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <X className="h-3 w-3" />
                        )}
                      </Button>
                    </>
                  )}
                </>
              )}
            </div>
          )}
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Wrench className="h-3.5 w-3.5" />
            <span className="font-semibold text-foreground">{vehicle._count.serviceRecords}</span>
            <span className="text-xs">{t('services')}</span>
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <DollarSign className="h-3.5 w-3.5" />
            <span className="font-semibold text-foreground">
              {formatCurrency(totalServiceCost, currencyCode)}
            </span>
          </div>
          {vehicle.purchaseDate && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <span className="text-xs">
                {t('purchased', { date: formatDate(new Date(vehicle.purchaseDate)) })}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="services" className="gap-1.5">
            <Wrench className="h-3.5 w-3.5" />
            {t('tabs.services')}
          </TabsTrigger>
          <TabsTrigger value="inspections" className="gap-1.5">
            <ClipboardCheck className="h-3.5 w-3.5" />
            {t('tabs.inspections')}
          </TabsTrigger>
          <TabsTrigger value="notes" className="gap-1.5">
            <StickyNote className="h-3.5 w-3.5" />
            {t('tabs.notes')}
          </TabsTrigger>
          <TabsTrigger value="reminders" className="gap-1.5">
            <Bell className="h-3.5 w-3.5" />
            {t('tabs.reminders')}
            {overdueCount > 0 && (
              <Badge variant="destructive" className="ml-1 h-5 min-w-5 px-1 text-[10px]">
                {overdueCount}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Services Tab - React Table with pagination */}
        <TabsContent value="services">
          <ServiceRecordsTable
            vehicleId={vehicle.id}
            records={paginatedServices.records}
            total={paginatedServices.total}
            page={paginatedServices.page}
            pageSize={paginatedServices.pageSize}
            totalPages={paginatedServices.totalPages}
            search={serviceSearch}
            type={serviceType}
            currencyCode={currencyCode}
          />
        </TabsContent>

        {/* Inspections Tab */}
        <TabsContent value="inspections" className="space-y-4">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setShowNewInspection(true)}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              {ti('newInspection')}
            </Button>
          </div>

          {!inspections || inspections.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center py-12">
                <ClipboardCheck className="mb-3 h-10 w-10 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">{ti('empty')}</p>
              </CardContent>
            </Card>
          ) : (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{ti('template')}</TableHead>
                    <TableHead className="w-32">{ti('progress')}</TableHead>
                    <TableHead className="w-28">{ti('status')}</TableHead>
                    <TableHead className="w-24">{ti('date')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inspections.map((insp) => {
                    const total = insp.items.length
                    const inspected = insp.items.filter(
                      (i) => i.condition !== 'not_inspected'
                    ).length
                    const passCount = insp.items.filter((i) => i.condition === 'pass').length
                    const failCount = insp.items.filter((i) => i.condition === 'fail').length
                    return (
                      <TableRow
                        key={insp.id}
                        className="cursor-pointer"
                        onClick={() => router.push(`/inspections/${insp.id}`)}
                      >
                        <TableCell className="font-medium">{insp.template.name}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <div className="flex h-2 w-16 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                              {total > 0 && (
                                <>
                                  <div
                                    className="bg-emerald-500"
                                    style={{ width: `${(passCount / total) * 100}%` }}
                                  />
                                  <div
                                    className="bg-red-500"
                                    style={{ width: `${(failCount / total) * 100}%` }}
                                  />
                                  <div
                                    className="bg-amber-500"
                                    style={{
                                      width: `${((inspected - passCount - failCount) / total) * 100}%`,
                                    }}
                                  />
                                </>
                              )}
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {inspected}/{total}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`text-xs ${insp.status === 'completed' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' : 'bg-blue-500/10 text-blue-500 border-blue-500/20'}`}
                          >
                            {insp.status === 'completed' ? ti('completed') : ti('inProgress')}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {formatDate(new Date(insp.createdAt))}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* Notes Tab */}
        <TabsContent value="notes">
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
        </TabsContent>

        {/* Reminders Tab */}
        <TabsContent value="reminders" className="space-y-4">
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
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              {tr('addReminder')}
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
                    className={`border-0 shadow-sm ${
                      urgency === 'overdue'
                        ? 'ring-1 ring-red-500/30'
                        : urgency === 'due-soon'
                          ? 'ring-1 ring-amber-500/30'
                          : ''
                    }`}
                  >
                    <CardContent className="flex items-center justify-between p-4">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => handleToggleReminder(r.id)}
                          className={`flex h-6 w-6 items-center justify-center rounded-full border-2 transition-colors ${
                            r.isCompleted
                              ? 'border-primary bg-primary/10'
                              : 'border-primary/50 hover:bg-primary/10'
                          }`}
                        >
                          {r.isCompleted && <CheckCircle2 className="h-5 w-5 text-primary" />}
                        </button>
                        <div>
                          <div className="flex items-center gap-2">
                            <p
                              className={`font-medium ${r.isCompleted ? 'line-through text-muted-foreground' : ''}`}
                            >
                              {r.title}
                            </p>
                            {urgency === 'overdue' && (
                              <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
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
                            {r.dueDate && tr('due', { date: formatDate(new Date(r.dueDate)) })}
                            {r.dueMileage &&
                              `${r.dueDate ? ' · ' : ''}${tr('dueAt', { mileage: r.dueMileage.toLocaleString(), unit: distUnit })}`}
                          </p>
                          {r.description && (
                            <p className="mt-1 text-xs text-muted-foreground">{r.description}</p>
                          )}
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <MoreVertical className="h-3.5 w-3.5" />
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
        </TabsContent>
      </Tabs>

      <VehicleForm
        open={showEditForm}
        onOpenChange={setShowEditForm}
        vehicle={vehicle}
        customers={customers}
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
        <DialogContent className="sm:max-w-3xl">
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
            dangerouslySetInnerHTML={{ __html: selectedNote?.content ?? '' }}
          />
          <div className="flex justify-end pt-2">
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
      <NewInspectionDialog
        open={showNewInspection}
        onOpenChange={setShowNewInspection}
        templates={inspectionTemplates || []}
        preselectedVehicleId={vehicle.id}
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
