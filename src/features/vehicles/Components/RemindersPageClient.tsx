'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useFormatDate } from '@/lib/use-format-date'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import { TableContextMenuHint } from '@/components/table-context-menu-hint'
import { TableCellLink } from '@/components/table-cell-link'
import {
  AlertTriangle,
  Bell,
  Car,
  CheckCircle2,
  Clock,
  MoreVertical,
  Pencil,
  Plus,
  Trash2,
  User,
} from 'lucide-react'
import { toast } from 'sonner'
import { toggleReminder, deleteReminder } from '../Actions/reminderActions'
import { ReminderFormDialog } from './ReminderFormDialog'

interface Reminder {
  id: string
  title: string
  description: string | null
  dueDate: Date | null
  dueMileage: number | null
  isCompleted: boolean
  notifyInApp: boolean
  notifyEmail: boolean
  createdAt: Date
  customer: { id: string; name: string } | null
  vehicle: {
    id: string
    make: string
    model: string
    year: number
    licensePlate: string | null
    mileage: number
  } | null
}

interface VehicleOption {
  id: string
  make: string
  model: string
  year: number
  licensePlate: string | null
  customerName: string | null
  customerId: string | null
}

interface RemindersPageClientProps {
  reminders: Reminder[]
  vehicles: VehicleOption[]
  unitSystem: 'metric' | 'imperial'
}

type FilterType = 'active' | 'completed' | 'all'

function getUrgency(r: Reminder): 'overdue' | 'due-soon' | 'normal' {
  if (r.isCompleted) return 'normal'
  const now = new Date()
  if (r.dueDate && new Date(r.dueDate) < now) return 'overdue'
  if (r.dueDate) {
    const sevenDays = new Date(now)
    sevenDays.setDate(sevenDays.getDate() + 7)
    if (new Date(r.dueDate) <= sevenDays) return 'due-soon'
  }
  return 'normal'
}

export function RemindersPageClient({ reminders, vehicles, unitSystem }: RemindersPageClientProps) {
  const t = useTranslations('reminders')
  const tv = useTranslations('vehicles.reminders')
  const tc = useTranslations('common.buttons')
  const tcm = useTranslations('common.contextMenu')
  const router = useRouter()
  const { formatDate } = useFormatDate()
  const distUnit = unitSystem === 'metric' ? 'km' : 'mi'

  const [filter, setFilter] = useState<FilterType>('active')
  const [showForm, setShowForm] = useState(false)
  const [editingReminder, setEditingReminder] = useState<Reminder | undefined>()

  const filtered = reminders.filter((r) => {
    if (filter === 'active') return !r.isCompleted
    if (filter === 'completed') return r.isCompleted
    return true
  })

  const overdueCount = reminders.filter((r) => !r.isCompleted && getUrgency(r) === 'overdue').length

  const handleToggle = async (id: string) => {
    await toggleReminder(id)
    router.refresh()
  }

  const handleDelete = async (id: string) => {
    const result = await deleteReminder(id)
    if (result.success) {
      toast.success(t('deleted'))
      router.refresh()
    } else {
      toast.error(t('deleteError'))
    }
  }

  const openAddForm = () => {
    setEditingReminder(undefined)
    setShowForm(true)
  }

  const openEditForm = (r: Reminder) => {
    setEditingReminder(r)
    setShowForm(true)
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex gap-1 rounded-lg border p-1">
            {(['active', 'completed', 'all'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  filter === f
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {tv(f)}
              </button>
            ))}
          </div>
          {overdueCount > 0 && (
            <Badge variant="destructive" className="text-xs">
              {overdueCount} {tv('overdue').toLowerCase()}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {t('showing', { count: filtered.length, total: reminders.length })}
          </span>
          <Button size="sm" onClick={openAddForm}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            {tv('addReminder')}
          </Button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center py-12">
            <Bell className="mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              {filter === 'active'
                ? tv('emptyActive')
                : filter === 'completed'
                  ? tv('emptyCompleted')
                  : tv('empty')}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <TableContextMenuHint />
            <div className="divide-y">
              {filtered.map((r) => {
                const urgency = getUrgency(r)
                return (
                  <ContextMenu key={r.id} modal={false}>
                    <ContextMenuTrigger asChild>
                      <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 transition-colors">
                        <button
                          onClick={() => handleToggle(r.id)}
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                            r.isCompleted
                              ? 'border-primary bg-primary/10'
                              : 'border-muted-foreground/40 hover:border-primary'
                          }`}
                        >
                          {r.isCompleted && <CheckCircle2 className="h-4 w-4 text-primary" />}
                        </button>
                        <div className="flex-1 min-w-0 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                          <span
                            className={`text-sm font-medium ${r.isCompleted ? 'line-through text-muted-foreground' : ''}`}
                          >
                            {r.title}
                          </span>
                          {urgency === 'overdue' && (
                            <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4">
                              <AlertTriangle className="mr-0.5 h-2.5 w-2.5" />
                              {tv('overdue')}
                            </Badge>
                          )}
                          {urgency === 'due-soon' && (
                            <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/20 text-[10px] px-1.5 py-0 h-4">
                              <Clock className="mr-0.5 h-2.5 w-2.5" />
                              {tv('dueSoon')}
                            </Badge>
                          )}
                          {r.vehicle ? (
                            <span className="text-xs text-muted-foreground">
                              <TableCellLink href={`/vehicles/${r.vehicle.id}?tab=reminders`}>
                                {r.vehicle.year} {r.vehicle.make} {r.vehicle.model}
                                {r.vehicle.licensePlate && ` · ${r.vehicle.licensePlate}`}
                              </TableCellLink>
                            </span>
                          ) : r.customer ? (
                            <span className="text-xs text-muted-foreground">
                              <TableCellLink href={`/customers/${r.customer.id}`}>
                                {r.customer.name}
                              </TableCellLink>
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              {t('workshopReminder')}
                            </span>
                          )}
                        </div>
                        <div className="shrink-0 flex items-center gap-2 text-xs text-muted-foreground">
                          {r.dueDate && <span>{formatDate(new Date(r.dueDate))}</span>}
                          {r.dueMileage && (
                            <span>
                              {r.dueMileage.toLocaleString()} {distUnit}
                            </span>
                          )}
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 shrink-0"
                              aria-label={t('openMenu')}
                            >
                              <MoreVertical className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEditForm(r)}>
                              <Pencil className="mr-2 h-4 w-4" />
                              {tc('edit')}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => handleDelete(r.id)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              {tc('delete')}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </ContextMenuTrigger>
                    <ContextMenuContent className="min-w-52">
                      {r.vehicle && (
                        <ContextMenuItem
                          onClick={() => router.push(`/vehicles/${r.vehicle?.id}?tab=reminders`)}
                        >
                          <Car className="mr-2 h-4 w-4" />
                          {tcm('openVehicle')}
                        </ContextMenuItem>
                      )}
                      {r.customer && (
                        <ContextMenuItem
                          onClick={() => router.push(`/customers/${r.customer?.id}`)}
                        >
                          <User className="mr-2 h-4 w-4" />
                          {tcm('openCustomer')}
                        </ContextMenuItem>
                      )}
                      {(r.vehicle || r.customer) && <ContextMenuSeparator />}
                      <ContextMenuItem onClick={() => openEditForm(r)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        {tc('edit')}
                      </ContextMenuItem>
                      <ContextMenuItem variant="destructive" onClick={() => handleDelete(r.id)}>
                        <Trash2 className="mr-2 h-4 w-4" />
                        {tc('delete')}
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <ReminderFormDialog
        open={showForm}
        onOpenChange={setShowForm}
        vehicles={vehicles}
        reminder={editingReminder}
        onSaved={() => router.refresh()}
      />
    </>
  )
}
