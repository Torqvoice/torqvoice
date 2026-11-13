'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DateInput } from '@/components/ui/date-input'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useServiceType } from '@/components/service-type-context'
import { CustomerCombobox } from '@/features/quotes/Components/CustomerCombobox'
import { VehicleCombobox } from '@/features/quotes/Components/VehicleCombobox'
import { bookAppointment } from '../Actions/bookAppointment'
import { MAX_APPOINTMENT_MINUTES } from '../Schema/appointmentSchema'

/** Hours an appointment is booked for until somebody says otherwise. */
const DEFAULT_HOURS = '1'

interface BookAppointmentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** YYYY-MM-DD of the day the calendar was on or right-clicked. */
  defaultDate?: string
  /** HH:MM of the time slot it was opened from, when there was one. */
  defaultTime?: string
  onBooked?: () => void
}

/**
 * Books a car or a customer in from the calendar: who, what they want done,
 * when, and roughly how long. No work order page is opened; the booking is a
 * scheduled job that the shop opens when the car arrives.
 */
export function BookAppointmentDialog({
  open,
  onOpenChange,
  defaultDate,
  defaultTime,
  onBooked,
}: BookAppointmentDialogProps) {
  const t = useTranslations('calendar.appointment')
  const isMarine = useServiceType() === 'marine'
  const [saving, setSaving] = useState(false)

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!saving) onOpenChange(next)
      }}
    >
      <DialogContent className="max-h-[90vh] sm:max-w-lg" showCloseButton={!saving}>
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>
            {isMarine ? t('descriptionMarine') : t('description')}
          </DialogDescription>
        </DialogHeader>
        {/* Mounted with the dialog, so what was typed and then cancelled is
            gone the next time it opens. */}
        <BookAppointmentForm
          defaultDate={defaultDate}
          defaultTime={defaultTime}
          saving={saving}
          onSavingChange={setSaving}
          onCancel={() => onOpenChange(false)}
          onBooked={() => {
            onOpenChange(false)
            onBooked?.()
          }}
        />
      </DialogContent>
    </Dialog>
  )
}

function BookAppointmentForm({
  defaultDate,
  defaultTime,
  saving,
  onSavingChange,
  onCancel,
  onBooked,
}: {
  defaultDate?: string
  defaultTime?: string
  saving: boolean
  onSavingChange: (saving: boolean) => void
  onCancel: () => void
  onBooked: () => void
}) {
  const t = useTranslations('calendar.appointment')
  const tc = useTranslations('common.buttons')
  const isMarine = useServiceType() === 'marine'

  const [customerId, setCustomerId] = useState('')
  // The name the customer field shows when picking a car filled it in.
  const [vehicleOwner, setVehicleOwner] = useState<{
    id: string
    name: string
    company: string | null
  } | null>(null)
  const [vehicleId, setVehicleId] = useState('')
  const [vehicleCustomerId, setVehicleCustomerId] = useState<string | null>(null)
  const [work, setWork] = useState('')
  const [date, setDate] = useState(defaultDate ?? '')
  const [time, setTime] = useState(defaultTime ?? '')
  const [hours, setHours] = useState(DEFAULT_HOURS)

  const minutes = Math.round(Number(hours.replace(',', '.')) * 60)
  const minutesValid =
    Number.isFinite(minutes) && minutes >= 5 && minutes <= MAX_APPOINTMENT_MINUTES
  const ready = Boolean((vehicleId || customerId) && work.trim() && date && time && minutesValid)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!ready || saving) return
    onSavingChange(true)
    try {
      const result = await bookAppointment({
        vehicleId: vehicleId || undefined,
        customerId: customerId || undefined,
        work,
        date,
        time,
        durationMinutes: minutes,
      })
      if (result.success) {
        // Booked all the same when every bay or technician was taken then.
        if (result.data?.overbooked) toast.warning(t('bookedNobodyFree'))
        else toast.success(t('booked'))
        onBooked()
      } else {
        toast.error(result.error || t('failed'))
      }
    } catch {
      toast.error(t('failed'))
    } finally {
      onSavingChange(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
      <DialogBody className="space-y-4">
        <div className="space-y-2">
          <Label>{t('customer')}</Label>
          <CustomerCombobox
            value={customerId}
            initialCustomer={vehicleOwner}
            placeholder={t('selectCustomer')}
            searchPlaceholder={t('searchCustomer')}
            noneLabel={t('none')}
            emptyLabel={t('noCustomers')}
            onChange={(id) => {
              setCustomerId(id)
              // A car belonging to someone else no longer fits.
              if (id && vehicleId && vehicleCustomerId !== id) {
                setVehicleId('')
                setVehicleCustomerId(null)
              }
            }}
          />
        </div>
        <div className="space-y-2">
          <Label>{isMarine ? t('vehicleMarine') : t('vehicle')}</Label>
          <VehicleCombobox
            value={vehicleId}
            customerId={customerId || undefined}
            placeholder={isMarine ? t('selectVehicleMarine') : t('selectVehicle')}
            searchPlaceholder={isMarine ? t('searchVehicleMarine') : t('searchVehicle')}
            noneLabel={t('none')}
            emptyLabel={isMarine ? t('noVehiclesMarine') : t('noVehicles')}
            onChange={(id, vehicle) => {
              setVehicleId(id)
              setVehicleCustomerId(vehicle?.customerId ?? null)
              if (vehicle?.customer) {
                setCustomerId(vehicle.customer.id)
                setVehicleOwner({ ...vehicle.customer, company: null })
              }
            }}
          />
          <p className="text-xs text-muted-foreground">
            {isMarine ? t('whoHintMarine') : t('whoHint')}
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="appointment-work">{t('work')}</Label>
          <Textarea
            id="appointment-work"
            value={work}
            onChange={(e) => setWork(e.target.value)}
            placeholder={isMarine ? t('workPlaceholderMarine') : t('workPlaceholder')}
            rows={3}
            maxLength={4000}
          />
          <p className="text-xs text-muted-foreground">{t('workHint')}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="appointment-date">{t('date')}</Label>
            <DateInput id="appointment-date" value={date} onChange={setDate} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="appointment-time">{t('time')}</Label>
            <Input
              id="appointment-time"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="appointment-hours">{t('hours')}</Label>
            <Input
              id="appointment-hours"
              type="number"
              inputMode="decimal"
              min={0.25}
              max={MAX_APPOINTMENT_MINUTES / 60}
              step={0.25}
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              required
            />
          </div>
        </div>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
          {tc('cancel')}
        </Button>
        <Button data-save-shortcut type="submit" disabled={!ready || saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t('submit')}
        </Button>
      </DialogFooter>
    </form>
  )
}
