'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
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
import { useGlassModal } from '@/components/glass-modal'
import { VehicleForm } from '@/features/vehicles/Components/VehicleForm'
import { NoteForm } from '@/features/vehicles/Components/NoteForm'
import { ReminderForm } from '@/features/vehicles/Components/ReminderForm'
import { ServiceRecordsTable } from './service-records-table'
import { toast } from 'sonner'
import { deleteNote, toggleNotePin } from '@/features/vehicles/Actions/noteActions'
import { toggleReminder, deleteReminder } from '@/features/vehicles/Actions/reminderActions'
import { unarchiveVehicle } from '@/features/vehicles/Actions/unarchiveVehicle'
import { deleteVehicle } from '@/features/vehicles/Actions/deleteVehicle'
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
  Clock,
  DollarSign,
  Gauge,
  MoreVertical,
  Pencil,
  Pin,
  PinOff,
  Plus,
  StickyNote,
  Trash2,
  TrendingUp,
  Wrench,
} from 'lucide-react'
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
  notes: {
    id: string
    title: string
    content: string
    isPinned: boolean
    createdAt: Date
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
  serviceSearch,
  serviceType,
  currencyCode = 'USD',
  unitSystem = 'imperial',
  predictionData,
}: {
  vehicle: VehicleDetail
  customers: CustomerOption[]
  paginatedServices: PaginatedServices
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
    status: 'overdue' | 'approaching' | 'ok'
  } | null
}) {
  const distUnit = unitSystem === 'metric' ? 'km' : 'mi'
  const router = useRouter()
  const { formatDate } = useFormatDate()
  const modal = useGlassModal()
  const [showEditForm, setShowEditForm] = useState(false)
  const [showNoteForm, setShowNoteForm] = useState(false)
  const [showReminderForm, setShowReminderForm] = useState(false)
  const [editingReminder, setEditingReminder] = useState<
    VehicleDetail['reminders'][number] | undefined
  >()
  const [reminderFilter, setReminderFilter] = useState<'active' | 'completed' | 'all'>('active')
  const [showImage, setShowImage] = useState(false)
  const [showArchiveDialog, setShowArchiveDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

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
      toast.success('Note deleted')
      router.refresh()
    } else {
      modal.open('error', 'Error', result.error || 'Failed to delete')
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
      toast.success('Reminder deleted')
      router.refresh()
    } else {
      modal.open('error', 'Error', result.error || 'Failed to delete')
    }
  }

  const handleUnarchive = async () => {
    const result = await unarchiveVehicle(vehicle.id)
    if (result.success) {
      toast.success('Vehicle unarchived')
      router.refresh()
    } else {
      modal.open('error', 'Error', result.error || 'Failed to unarchive')
    }
  }

  const handleDelete = async () => {
    const result = await deleteVehicle(vehicle.id)
    if (result.success) {
      toast.success('Vehicle deleted')
      router.push('/vehicles')
    } else {
      modal.open('error', 'Error', result.error || 'Failed to delete vehicle')
    }
  }

  return (
    <div className="space-y-4">
      {/* Archived banner */}
      {vehicle.isArchived && (
        <div className="flex items-center justify-between rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
          <div className="flex items-center gap-2 text-sm">
            <Archive className="h-4 w-4 text-amber-600" />
            <span className="font-medium text-amber-600">This vehicle is archived</span>
            {vehicle.archiveReason && (
              <span className="text-muted-foreground">&mdash; {vehicle.archiveReason}</span>
            )}
          </div>
          <Button size="sm" variant="outline" onClick={handleUnarchive}>
            <ArchiveRestore className="mr-1 h-3.5 w-3.5" />
            Unarchive
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
            Back to vehicles
          </Link>
          <div className="flex items-center gap-2">
            {!vehicle.isArchived && (
              <>
                <Button size="sm" asChild>
                  <Link href={`/vehicles/${vehicle.id}/service/new`}>
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    New Work Order
                  </Link>
                </Button>
                <Button variant="outline" size="sm" onClick={() => setShowEditForm(true)}>
                  <Pencil className="mr-1 h-3.5 w-3.5" />
                  Edit Vehicle
                </Button>
              </>
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
                    Unarchive
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onClick={() => setShowArchiveDialog(true)}>
                    <Archive className="mr-2 h-4 w-4" />
                    Archive
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => setShowDeleteDialog(true)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
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
              <span className="font-semibold text-foreground">
                ~{predictionData.predictedMileage.toLocaleString()}
              </span>
              <span className="text-xs">{distUnit} est.</span>
              {predictionData.status === 'overdue' && (
                <Badge variant="destructive" className="text-[10px] ml-1">
                  Service Overdue
                </Badge>
              )}
              {predictionData.status === 'approaching' && (
                <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/20 text-[10px] ml-1">
                  Service Soon
                </Badge>
              )}
            </div>
          )}
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Wrench className="h-3.5 w-3.5" />
            <span className="font-semibold text-foreground">{vehicle._count.serviceRecords}</span>
            <span className="text-xs">services</span>
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
                Purchased {formatDate(new Date(vehicle.purchaseDate))}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="services" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="services" className="gap-1.5">
            <Wrench className="h-3.5 w-3.5" />
            Services
          </TabsTrigger>
          <TabsTrigger value="notes" className="gap-1.5">
            <StickyNote className="h-3.5 w-3.5" />
            Notes
          </TabsTrigger>
          <TabsTrigger value="reminders" className="gap-1.5">
            <Bell className="h-3.5 w-3.5" />
            Reminders
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

        {/* Notes Tab */}
        <TabsContent value="notes" className="space-y-4">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setShowNoteForm(true)}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              Add Note
            </Button>
          </div>

          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-7.5"></TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead className="hidden sm:table-cell">Content</TableHead>
                  <TableHead className="w-30">Date</TableHead>
                  <TableHead className="w-12.5"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vehicle.notes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                      No notes yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  vehicle.notes.map((n) => (
                    <TableRow key={n.id}>
                      <TableCell className="w-[30px] px-2">
                        {n.isPinned && <Pin className="h-3.5 w-3.5 text-primary" />}
                      </TableCell>
                      <TableCell className="font-medium">{n.title}</TableCell>
                      <TableCell className="hidden max-w-0 sm:table-cell">
                        <p className="truncate text-sm text-muted-foreground">{n.content}</p>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {formatDate(new Date(n.createdAt))}
                      </TableCell>
                      <TableCell className="px-2">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                              <MoreVertical className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleTogglePin(n.id)}>
                              {n.isPinned ? (
                                <PinOff className="mr-2 h-4 w-4" />
                              ) : (
                                <Pin className="mr-2 h-4 w-4" />
                              )}
                              {n.isPinned ? 'Unpin' : 'Pin'}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => handleDeleteNote(n.id)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
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
                  {f.charAt(0).toUpperCase() + f.slice(1)}
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
              Add Reminder
            </Button>
          </div>

          {filteredReminders.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center py-12">
                <Bell className="mb-3 h-10 w-10 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">
                  {reminderFilter === 'active'
                    ? 'No active reminders'
                    : reminderFilter === 'completed'
                      ? 'No completed reminders'
                      : 'No reminders yet'}
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
                                Overdue
                              </Badge>
                            )}
                            {urgency === 'due-soon' && (
                              <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/20 text-[10px] px-1.5 py-0">
                                <Clock className="mr-0.5 h-3 w-3" />
                                Due Soon
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {r.dueDate && `Due ${formatDate(new Date(r.dueDate))}`}
                            {r.dueMileage &&
                              `${r.dueDate ? ' · ' : 'Due at '}${r.dueMileage.toLocaleString()} ${distUnit}`}
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
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => handleDeleteReminder(r.id)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
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
      <NoteForm vehicleId={vehicle.id} open={showNoteForm} onOpenChange={setShowNoteForm} />
      <ReminderForm
        vehicleId={vehicle.id}
        open={showReminderForm}
        onOpenChange={setShowReminderForm}
        reminder={editingReminder}
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
            <AlertDialogTitle>Delete vehicle?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete{' '}
              <span className="font-semibold">
                {vehicle.year} {vehicle.make} {vehicle.model}
              </span>{' '}
              and all associated service records, notes, and reminders. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
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
