'use client'

import { useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import {
  AlignLeft,
  Bell,
  CalendarDays,
  Car,
  Clock,
  ExternalLink,
  ListChecks,
  Loader2,
  Plus,
  User,
  Video,
  Wrench,
  X,
} from 'lucide-react'
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
import { RichTextEditor } from '@/components/ui/rich-text-editor'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useServiceType } from '@/components/service-type-context'
import { CustomerCombobox } from '@/features/quotes/Components/CustomerCombobox'
import { VehicleCombobox } from '@/features/quotes/Components/VehicleCombobox'
import { createServiceMeeting } from '@/features/integrations/Actions/integrationActions'
import { createBooking } from '../Actions/createBooking'
import { updateBooking } from '../Actions/updateBooking'
import { getBooking, type BookingForEdit } from '../Actions/getBooking'
import { getBookingOptions, type BookingOptions } from '../Actions/getBookingOptions'
import {
  type BookingKind,
  DEFAULT_NOTICE_TIME,
  DEFAULT_NOTIFICATION,
  MAX_NOTIFICATIONS,
  MAX_NOTICE_MINUTES,
  type NotificationChannel,
  type NotificationUnit,
  NOTIFICATION_UNITS,
  UNIT_MINUTES,
  isCustomerChannel,
  isDayUnit,
} from '../Schema/bookingSchema'
import { MAX_APPOINTMENT_MINUTES } from '../Schema/appointmentSchema'
import { minutesToTime, timeToMinutes } from '../Lib/calendar-range'
import type { BookingEdit } from './EventPeek'
import { ConcernListEditor } from './ConcernListEditor'

/** The kind a new booking starts as: whatever this person booked last. */
const KIND_KEY = 'torqvoice.calendar.bookingKind'
const DEFAULT_MINUTES = 60

interface NotificationRow {
  key: number
  channel: NotificationChannel
  amount: string
  unit: NotificationUnit
  atTime: string
}

let rowKey = 0
const newRow = (n?: Partial<Omit<NotificationRow, 'key'>>): NotificationRow => ({
  key: ++rowKey,
  channel: n?.channel ?? DEFAULT_NOTIFICATION.channel,
  amount: n?.amount ?? String(DEFAULT_NOTIFICATION.amount),
  unit: n?.unit ?? DEFAULT_NOTIFICATION.unit,
  atTime: n?.atTime ?? DEFAULT_NOTICE_TIME,
})

function storedKind(): BookingKind {
  try {
    return window.localStorage.getItem(KIND_KEY) === 'appointment' ? 'appointment' : 'workOrder'
  } catch {
    return 'workOrder'
  }
}

/** Day key and time `minutes` after a day key and a time, on a plain calendar. */
function addMinutes(date: string, time: string, minutes: number): { date: string; time: string } {
  const [y, m, d] = date.split('-').map(Number)
  const total = timeToMinutes(time) + minutes
  const dayShift = Math.floor(total / (24 * 60))
  const shifted = new Date(Date.UTC(y, m - 1, d + dayShift))
  const key = shifted.toISOString().slice(0, 10)
  return { date: key, time: minutesToTime(((total % (24 * 60)) + 24 * 60) % (24 * 60)) }
}

function minutesBetween(a: { date: string; time: string }, b: { date: string; time: string }) {
  const at = (v: { date: string; time: string }) => {
    const [y, m, d] = v.date.split('-').map(Number)
    return Date.UTC(y, m - 1, d) / 60_000 + timeToMinutes(v.time)
  }
  return at(b) - at(a)
}

/**
 * Puts something on the calendar, the way a calendar app does: a title, an
 * appointment or a work order, when, who, and the notifications before it.
 *
 * An appointment is only on the calendar. A work order books the car in as a
 * scheduled job that holds a bay or a technician. The same dialog changes
 * either while it is still a booking, and turns an appointment into a work
 * order when the car does come in.
 */
export function BookingDialog({
  open,
  onOpenChange,
  defaultDate,
  defaultTime,
  edit,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** YYYY-MM-DD of the day the calendar was on or right-clicked. */
  defaultDate?: string
  /** HH:MM of the time slot it was opened from, when there was one. */
  defaultTime?: string
  /** An appointment or a booked job to change, or an appointment to make a work order. */
  edit?: BookingEdit | null
  onSaved?: () => void
}) {
  const t = useTranslations('calendar.appointment')
  const [saving, setSaving] = useState(false)
  const title = edit ? (edit.mode === 'convert' ? t('convertTitle') : t('editTitle')) : t('title')

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!saving) onOpenChange(next)
      }}
    >
      {/* One height for every kind of booking: switching between an appointment
          and a work order changes fields inside, never the size of the dialog. */}
      <DialogContent
        className="h-[min(44rem,92vh)] max-h-[92vh] sm:max-w-5xl"
        showCloseButton={!saving}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{t('dialogDescription')}</DialogDescription>
        </DialogHeader>
        {/* Mounted with the dialog, so what was typed and then cancelled is
            gone the next time it opens. */}
        {open && (
          <BookingForm
            key={edit ? `${edit.mode}:${edit.event.id}` : 'new'}
            defaultDate={defaultDate}
            defaultTime={defaultTime}
            edit={edit ?? null}
            saving={saving}
            onSavingChange={setSaving}
            onCancel={() => onOpenChange(false)}
            onSaved={() => {
              onOpenChange(false)
              onSaved?.()
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function BookingForm({
  defaultDate,
  defaultTime,
  edit,
  saving,
  onSavingChange,
  onCancel,
  onSaved,
}: {
  defaultDate?: string
  defaultTime?: string
  edit: BookingEdit | null
  saving: boolean
  onSavingChange: (saving: boolean) => void
  onCancel: () => void
  onSaved: () => void
}) {
  const t = useTranslations('calendar.appointment')
  const tc = useTranslations('common.buttons')
  const isMarine = useServiceType() === 'marine'

  // What is being changed: nothing (a new booking), an appointment, a job.
  const editing = edit?.mode === 'edit' ? edit.event : null
  const converting = edit?.mode === 'convert' ? edit.event : null
  const sourceKind: BookingKind | null = edit
    ? edit.event.type === 'appointment'
      ? 'appointment'
      : 'workOrder'
    : null

  const [loaded, setLoaded] = useState<BookingForEdit | null>(null)
  const [options, setOptions] = useState<BookingOptions | null>(null)
  const [loading, setLoading] = useState(Boolean(edit))

  const [kind, setKind] = useState<BookingKind>(() =>
    converting ? 'workOrder' : editing ? (sourceKind ?? 'workOrder') : storedKind()
  )
  const [titleText, setTitleText] = useState('')
  const [description, setDescription] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [customerInitial, setCustomerInitial] = useState<{
    id: string
    name: string
    company: string | null
  } | null>(null)
  const [vehicleId, setVehicleId] = useState('')
  const [vehicleInitial, setVehicleInitial] = useState<BookingForEdit['vehicle']>(null)
  const [vehicleCustomerId, setVehicleCustomerId] = useState<string | null>(null)
  const [work, setWork] = useState('')
  const startDefault = defaultTime ?? '09:00'
  const [start, setStart] = useState({ date: defaultDate ?? '', time: startDefault })
  const [end, setEnd] = useState(() =>
    defaultDate ? addMinutes(defaultDate, startDefault, DEFAULT_MINUTES) : { date: '', time: '' }
  )
  const [rows, setRows] = useState<NotificationRow[]>(() => (edit ? [] : [newRow()]))
  const [meeting, setMeeting] = useState<string | null>(null)
  // The end date shows for a booking that runs into another day, or once asked for.
  const [multiDay, setMultiDay] = useState(false)

  // What the workshop offers, and the booking being changed.
  useEffect(() => {
    let live = true
    const load = async () => {
      const [opts, booking] = await Promise.all([
        getBookingOptions().catch(() => null),
        edit
          ? getBooking({
              kind: edit.event.type === 'appointment' ? 'appointment' : 'workOrder',
              id: edit.event.id,
            }).catch(() => null)
          : null,
      ])
      if (!live) return
      if (opts?.success && opts.data) setOptions(opts.data)
      if (edit) {
        if (!booking?.success || !booking.data) {
          toast.error(booking?.error || t('failed'))
          onCancel()
          return
        }
        const b = booking.data
        setLoaded(b)
        setTitleText(b.title)
        setDescription(b.description)
        setCustomerId(b.customer?.id ?? '')
        setCustomerInitial(b.customer)
        setVehicleId(b.vehicle?.id ?? '')
        setVehicleInitial(b.vehicle)
        setVehicleCustomerId(b.vehicle?.customerId ?? null)
        // An appointment made a work order: its words become the work needed.
        setWork(converting ? '' : b.work)
        setStart({ date: b.startDate, time: b.startTime })
        setEnd({ date: b.endDate, time: b.endTime })
        setRows(
          b.notifications.map((n) =>
            newRow({
              channel: n.channel,
              amount: String(n.amount),
              unit: n.unit as NotificationUnit,
              atTime: n.atTime ?? DEFAULT_NOTICE_TIME,
            })
          )
        )
        setLoading(false)
      }
    }
    void load()
    return () => {
      live = false
    }
    // Loaded once per opening; the form is remounted for the next.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const isWorkOrder = kind === 'workOrder'
  const showEndDate = multiDay || Boolean(end.date && start.date && end.date !== start.date)
  const lockedWho = Boolean(editing && sourceKind === 'workOrder' && loaded?.locked.who)
  const lockedWork = Boolean(editing && sourceKind === 'workOrder' && loaded?.locked.work)
  const channels = options?.channels ?? ['in_app', 'email']
  const video = options?.video ?? []
  const hasCustomer = Boolean(customerId || vehicleId)
  // An appointment needs neither; a work order needs one of the two.
  const optionalLabel = isWorkOrder ? undefined : t('optional')

  const duration = minutesBetween(start, end)
  const durationLabel = useMemo(() => {
    if (!Number.isFinite(duration) || duration <= 0) return null
    const h = Math.floor(duration / 60)
    const m = duration % 60
    return [
      h ? t('durationHours', { count: h }) : null,
      m ? t('durationMinutes', { count: m }) : null,
    ]
      .filter(Boolean)
      .join(' ')
  }, [duration, t])

  const rowsValid = rows.every((r) => {
    const n = Number(r.amount)
    return Number.isInteger(n) && n >= 0 && n * UNIT_MINUTES[r.unit] <= MAX_NOTICE_MINUTES
  })
  const customerRowsOk = hasCustomer || !rows.some((r) => isCustomerChannel(r.channel))
  const timesValid = Boolean(
    start.date &&
      start.time &&
      end.date &&
      end.time &&
      duration >= 5 &&
      duration <= MAX_APPOINTMENT_MINUTES
  )
  const ready =
    !loading &&
    Boolean(titleText.trim()) &&
    timesValid &&
    rowsValid &&
    customerRowsOk &&
    (!isWorkOrder || Boolean(vehicleId || customerId))

  const chooseKind = (next: BookingKind) => {
    setKind(next)
    if (!edit) {
      try {
        window.localStorage.setItem(KIND_KEY, next)
      } catch {
        // A browser that keeps nothing simply starts on a work order.
      }
    }
  }

  const moveStart = (next: { date: string; time: string }) => {
    // The end keeps the length, as a calendar's does.
    const keep = duration > 0 ? duration : DEFAULT_MINUTES
    setStart(next)
    if (next.date && next.time) setEnd(addMinutes(next.date, next.time, keep))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!ready || saving) return
    onSavingChange(true)
    try {
      const payload = {
        kind,
        id: editing?.id,
        fromAppointmentId: converting?.id,
        title: titleText.trim(),
        description,
        customerId: customerId || undefined,
        vehicleId: vehicleId || undefined,
        work: isWorkOrder ? work : undefined,
        startDate: start.date,
        startTime: start.time,
        endDate: end.date,
        endTime: end.time,
        notifications: rows.map((r) => ({
          channel: r.channel,
          amount: Number(r.amount),
          unit: r.unit,
          atTime: isDayUnit(r.unit) ? r.atTime : null,
        })),
      }
      const result: Awaited<ReturnType<typeof createBooking>> = editing
        ? await updateBooking(payload)
        : await createBooking(payload)
      if (!result.success || !result.data) {
        toast.error(result.error || t('failed'))
        return
      }
      if (result.data.overbooked) toast.warning(t('bookedNobodyFree'))
      else toast.success(editing ? t('saved') : t('booked'))
      // The meeting is made once the job exists; a failure leaves the booking standing.
      if (meeting && result.data.kind === 'workOrder') {
        const made = await createServiceMeeting(result.data.id, meeting).catch(() => null)
        if (!made?.success) toast.error(t('meetingFailed', { error: made?.error ?? '' }))
      }
      onSaved()
    } catch {
      toast.error(t('failed'))
    } finally {
      onSavingChange(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const channelLabel: Record<NotificationChannel, string> = {
    in_app: t('channel.inApp'),
    email: t('channel.email'),
    customer_sms: t('channel.customerSms'),
    customer_email: t('channel.customerEmail'),
  }

  return (
    <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
      <DialogBody className="space-y-4">
        {/* Title and what it is, the way a calendar app opens. */}
        <div className="space-y-2.5 pr-6">
          <Input
            aria-label={t('titleLabel')}
            value={titleText}
            onChange={(e) => setTitleText(e.target.value)}
            placeholder={t('titlePlaceholder')}
            maxLength={200}
            autoFocus
            className="h-14 rounded-none border-0 border-b-2 border-border bg-transparent px-1 text-2xl font-medium tracking-tight shadow-none placeholder:font-normal placeholder:text-muted-foreground/70 focus-visible:border-primary focus-visible:ring-0 md:text-2xl dark:bg-transparent"
          />
          <div className="flex flex-wrap items-center gap-3">
            <Tabs value={kind} onValueChange={(v) => chooseKind(v as BookingKind)}>
              <TabsList>
                <TabsTrigger
                  value="appointment"
                  disabled={Boolean(converting || (editing && sourceKind === 'workOrder'))}
                  className="gap-1.5"
                >
                  <CalendarDays className="h-3.5 w-3.5" />
                  {t('kind.appointment')}
                </TabsTrigger>
                <TabsTrigger
                  value="workOrder"
                  disabled={Boolean(editing && sourceKind === 'appointment')}
                  className="gap-1.5"
                >
                  <Wrench className="h-3.5 w-3.5" />
                  {t('kind.workOrder')}
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <p className="text-xs text-muted-foreground">
              {isWorkOrder
                ? t('kind.workOrderHint')
                : isMarine
                  ? t('kind.appointmentHintMarine')
                  : t('kind.appointmentHint')}
            </p>
          </div>
        </div>

        {/* When: one day, start to end, as a calendar shows it. A second date
            only for a booking that runs into another day. */}
        <Row icon={Clock} label={t('when')}>
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-40">
              <DateInput
                id="booking-start-date"
                value={start.date}
                onChange={(date) => moveStart({ ...start, date })}
              />
            </div>
            <Input
              aria-label={t('start')}
              type="time"
              value={start.time}
              onChange={(e) => moveStart({ ...start, time: e.target.value })}
              className="w-28"
              required
            />
            <span className="text-muted-foreground">–</span>
            <Input
              aria-label={t('end')}
              type="time"
              value={end.time}
              onChange={(e) => setEnd({ ...end, time: e.target.value })}
              className="w-28"
              required
            />
            {showEndDate ? (
              <div className="w-40">
                <DateInput
                  id="booking-end-date"
                  value={end.date}
                  onChange={(date) => setEnd({ ...end, date })}
                />
              </div>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-xs text-primary"
                onClick={() => setMultiDay(true)}
              >
                {t('endsAnotherDay')}
              </Button>
            )}
            {timesValid && durationLabel && (
              <span className="text-xs text-muted-foreground">{durationLabel}</span>
            )}
          </div>
          {!timesValid && <p className="text-xs text-destructive">{t('endAfterStart')}</p>}
        </Row>

        <div className="grid gap-x-8 gap-y-4 md:grid-cols-[minmax(0,4fr)_minmax(0,6fr)]">
          <div className="space-y-4">
            <Row icon={User} label={t('customer')} optional={optionalLabel}>
              <CustomerCombobox
                value={customerId}
                initialCustomer={customerInitial}
                placeholder={t('selectCustomer')}
                searchPlaceholder={t('searchCustomer')}
                noneLabel={t('none')}
                emptyLabel={t('noCustomers')}
                // On a booked job only a missing car can be added here; the
                // customer, and so the prices, change on the work order.
                disabled={Boolean(editing && sourceKind === 'workOrder')}
                onChange={(id) => {
                  setCustomerId(id)
                  // A car belonging to someone else no longer fits.
                  if (id && vehicleId && vehicleCustomerId !== id) {
                    setVehicleId('')
                    setVehicleCustomerId(null)
                  }
                }}
              />
            </Row>
            <Row
              icon={Car}
              label={isMarine ? t('vehicleMarine') : t('vehicle')}
              optional={optionalLabel}
            >
              <VehicleCombobox
                value={vehicleId}
                initialVehicle={vehicleInitial}
                customerId={customerId || undefined}
                placeholder={isMarine ? t('selectVehicleMarine') : t('selectVehicle')}
                searchPlaceholder={isMarine ? t('searchVehicleMarine') : t('searchVehicle')}
                noneLabel={t('none')}
                emptyLabel={isMarine ? t('noVehiclesMarine') : t('noVehicles')}
                disabled={lockedWho}
                onChange={(id, vehicle) => {
                  setVehicleId(id)
                  setVehicleCustomerId(vehicle?.customerId ?? null)
                  if (vehicle?.customer) {
                    setCustomerId(vehicle.customer.id)
                    setCustomerInitial({ ...vehicle.customer, company: null })
                  }
                }}
              />
              {(lockedWho || isWorkOrder) && (
                <p className="text-xs text-muted-foreground">
                  {lockedWho
                    ? isMarine
                      ? t('whoLockedMarine')
                      : t('whoLocked')
                    : isMarine
                      ? t('whoHintMarine')
                      : t('whoHint')}
                </p>
              )}
            </Row>
            <Row icon={AlignLeft} label={t('description')}>
              <RichTextEditor
                content={description}
                onChange={setDescription}
                placeholder={t('descriptionPlaceholder')}
                contentClassName="min-h-[8rem] max-h-[30vh]"
              />
            </Row>
          </div>

          <div className="space-y-4">
            <Row icon={Bell} label={t('notifications')}>
              <div className="space-y-2">
                {rows.map((row) => (
                  <NotificationEditor
                    key={row.key}
                    row={row}
                    channels={channels}
                    channelLabel={channelLabel}
                    hasCustomer={hasCustomer}
                    onChange={(next) =>
                      setRows((all) => all.map((r) => (r.key === row.key ? next : r)))
                    }
                    onRemove={() => setRows((all) => all.filter((r) => r.key !== row.key))}
                  />
                ))}
                {!customerRowsOk && (
                  <p className="text-xs text-destructive">{t('customerChannelNeedsCustomer')}</p>
                )}
                {rows.length < MAX_NOTIFICATIONS && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="-ml-2 h-8 text-primary"
                    onClick={() => setRows((all) => [...all, newRow()])}
                  >
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    {t('addNotification')}
                  </Button>
                )}
              </div>
            </Row>
            {isWorkOrder && (
              <Row icon={ListChecks} label={t('work')}>
                <ConcernListEditor
                  value={work}
                  onChange={setWork}
                  disabled={lockedWork}
                  placeholder={isMarine ? t('addConcernMarine') : t('addConcern')}
                />
                {(lockedWork || work.trim() === '') && (
                  <p className="px-2 text-xs text-muted-foreground">
                    {lockedWork ? t('workLocked') : t('workEmptyHint')}
                  </p>
                )}
              </Row>
            )}
            {isWorkOrder && video.length > 0 && (
              <Row icon={Video} label={t('video')}>
                {loaded?.meeting ? (
                  <a
                    href={loaded.meeting.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                  >
                    {t('joinMeeting')}
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                ) : meeting ? (
                  <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
                    <span>
                      {t('meetingAdded', {
                        name: video.find((v) => v.connectorId === meeting)?.name ?? '',
                      })}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      aria-label={t('removeMeeting')}
                      onClick={() => setMeeting(null)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {video.map((v) => (
                      <Button
                        key={v.connectorId}
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setMeeting(v.connectorId)}
                      >
                        <Video className="mr-1.5 h-3.5 w-3.5" />
                        {t('addMeeting', { name: v.name })}
                      </Button>
                    ))}
                  </div>
                )}
              </Row>
            )}
          </div>
        </div>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
          {tc('cancel')}
        </Button>
        <Button data-save-shortcut type="submit" disabled={!ready || saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {editing ? tc('save') : converting ? t('convertSubmit') : t('submit')}
        </Button>
      </DialogFooter>
    </form>
  )
}

/** One line of the form: an icon in the gutter, the field beside it. */
function Row({
  icon: Icon,
  label,
  optional,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  /** Said beside the label when the field can be left empty. */
  optional?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex gap-3">
      <Icon className="mt-2.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">
          {label}
          {optional && (
            <span className="ml-1.5 font-normal text-muted-foreground/70">{optional}</span>
          )}
        </p>
        {children}
      </div>
    </div>
  )
}

function NotificationEditor({
  row,
  channels,
  channelLabel,
  hasCustomer,
  onChange,
  onRemove,
}: {
  row: NotificationRow
  channels: NotificationChannel[]
  channelLabel: Record<NotificationChannel, string>
  hasCustomer: boolean
  onChange: (row: NotificationRow) => void
  onRemove: () => void
}) {
  const t = useTranslations('calendar.appointment')
  const workshop = channels.filter((c) => !isCustomerChannel(c))
  const customer = channels.filter((c) => isCustomerChannel(c))
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Select
        value={row.channel}
        onValueChange={(v) => onChange({ ...row, channel: v as NotificationChannel })}
      >
        <SelectTrigger className="h-9 w-[9.5rem]" aria-label={t('channelLabel')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>{t('channel.toWorkshop')}</SelectLabel>
            {workshop.map((c) => (
              <SelectItem key={c} value={c}>
                {channelLabel[c]}
              </SelectItem>
            ))}
          </SelectGroup>
          {customer.length > 0 && (
            <SelectGroup>
              <SelectLabel>{t('channel.toCustomer')}</SelectLabel>
              {customer.map((c) => (
                <SelectItem key={c} value={c} disabled={!hasCustomer}>
                  {channelLabel[c]}
                </SelectItem>
              ))}
            </SelectGroup>
          )}
        </SelectContent>
      </Select>
      <Input
        aria-label={t('amountLabel')}
        type="number"
        inputMode="numeric"
        min={0}
        value={row.amount}
        onChange={(e) => onChange({ ...row, amount: e.target.value })}
        className="h-9 w-14 px-1 text-center"
      />
      <Select
        value={row.unit}
        onValueChange={(v) => onChange({ ...row, unit: v as NotificationUnit })}
      >
        <SelectTrigger className="h-9 w-[8.5rem]" aria-label={t('unitLabel')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {NOTIFICATION_UNITS.map((u) => (
            <SelectItem key={u} value={u}>
              {t(`unit.${u}`, { count: Number(row.amount) || 0 })}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {isDayUnit(row.unit) && (
        <>
          <span className="text-sm text-muted-foreground">{t('at')}</span>
          <Input
            aria-label={t('atLabel')}
            type="time"
            value={row.atTime}
            onChange={(e) => onChange({ ...row, atTime: e.target.value })}
            className="h-9 w-[6.5rem]"
          />
        </>
      )}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-muted-foreground"
        aria-label={t('removeNotification')}
        onClick={onRemove}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  )
}
