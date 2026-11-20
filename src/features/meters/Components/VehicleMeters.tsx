'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useFormatter, useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Gauge, MoreHorizontal, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useConfirm } from '@/components/confirm-dialog'
import { useDateSettings } from '@/components/date-settings-context'
import { useServiceType } from '@/components/service-type-context'
import { zonedDayKey } from '@/lib/timezone'
import { cn } from '@/lib/utils'
import {
  addMeterReading,
  addVehicleMeter,
  markMeterReadingWrong,
  removeVehicleMeter,
  replaceVehicleMeter,
} from '../Actions/vehicleMeterActions'
import { isLowerMeterValue, parseMeterValue } from '../Lib/meterValue'
import type { MeterTypeView, VehicleMeterView } from '../Lib/meters.server'

/** "4,256.7 hrs" in the viewer's number format. */
function useMeterText() {
  const format = useFormatter()
  return (value: number, unit: string) => {
    const number = format.number(value, { maximumFractionDigits: 2 })
    return unit.trim() ? `${number} ${unit.trim()}` : number
  }
}

/** A reading's date on the workshop's clock. */
function useReadingDate() {
  const format = useFormatter()
  const { timezone } = useDateSettings()
  return (iso: string) =>
    format.dateTime(new Date(iso), { dateStyle: 'medium', timeZone: timezone || undefined })
}

/** Today on the workshop's calendar, for a reading date field. */
function useToday() {
  const { timezone } = useDateSettings()
  return () => zonedDayKey(new Date(), timezone || 'UTC')
}

type Dialogs =
  | { kind: 'add' }
  | { kind: 'reading'; meter: VehicleMeterView }
  | { kind: 'replace'; meter: VehicleMeterView }
  | { kind: 'history'; meter: VehicleMeterView }
  | null

/**
 * The vehicle's meters besides the odometer, each with what it reads now,
 * and everything done to them: fitting one, a reading, its history, a
 * reading marked as wrong, a meter replaced. Draws nothing while the
 * workshop has no meters (or a plan without them).
 */
export function VehicleMeters({
  vehicleId,
  types,
  meters,
  className,
}: {
  vehicleId: string
  /** The workshop's meters in use; empty means meters are off. */
  types: MeterTypeView[]
  meters: VehicleMeterView[]
  className?: string
}) {
  const t = useTranslations('vehicles.meters')
  const isMarine = useServiceType() === 'marine'
  const meterText = useMeterText()
  const readingDate = useReadingDate()
  const [dialog, setDialog] = useState<Dialogs>(null)
  if (types.length === 0) return null

  const fitted = new Set(meters.map((m) => m.meterTypeId))
  const available = types.filter((type) => !fitted.has(type.id))

  return (
    <div className={cn('space-y-2', className)} data-testid="vehicle-meters">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[13px] font-semibold">{t('title')}</h2>
        {available.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => setDialog({ kind: 'add' })}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            {t('addMeter')}
          </Button>
        )}
      </div>

      {meters.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {t(isMarine ? 'noMetersMarine' : 'noMeters')}
        </p>
      ) : (
        <ul className="space-y-1">
          {meters.map((meter) => (
            <li
              key={meter.id}
              className="flex items-start gap-2 rounded-md px-1 py-1 text-[13px]"
              data-testid={`vehicle-meter-${meter.meterTypeId}`}
            >
              <Gauge className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                  <span className="text-muted-foreground">{meter.name}</span>
                  <span className="font-medium tabular-nums">
                    {meter.current == null ? '-' : meterText(meter.current, meter.unit)}
                  </span>
                </div>
                {(meter.currentAt || (meter.replaced && meter.total != null)) && (
                  <p className="text-xs text-muted-foreground">
                    {meter.currentAt && t('readOn', { date: readingDate(meter.currentAt) })}
                    {meter.replaced && meter.total != null && (
                      <> · {t('total', { total: meterText(meter.total, meter.unit) })}</>
                    )}
                  </p>
                )}
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    aria-label={t('meterActions', { name: meter.name })}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setDialog({ kind: 'reading', meter })}>
                    {t('addReading')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setDialog({ kind: 'history', meter })}>
                    {t('history')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setDialog({ kind: 'replace', meter })}>
                    {t('replace')}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <RemoveMeterItem meter={meter} />
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
      )}

      <AddMeterDialog
        open={dialog?.kind === 'add'}
        onClose={() => setDialog(null)}
        vehicleId={vehicleId}
        types={available}
      />
      {dialog?.kind === 'reading' && (
        <ReadingDialog meter={dialog.meter} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === 'replace' && (
        <ReplaceDialog meter={dialog.meter} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === 'history' && (
        <HistoryDialog meter={dialog.meter} onClose={() => setDialog(null)} />
      )}
    </div>
  )
}

function RemoveMeterItem({ meter }: { meter: VehicleMeterView }) {
  const t = useTranslations('vehicles.meters')
  const isMarine = useServiceType() === 'marine'
  const router = useRouter()
  const confirm = useConfirm()
  return (
    <DropdownMenuItem
      className="text-destructive focus:text-destructive"
      onSelect={async () => {
        const ok = await confirm({
          title: t(isMarine ? 'removeTitleMarine' : 'removeTitle', { name: meter.name }),
          description: t('removeHint'),
          confirmLabel: t(isMarine ? 'removeMarine' : 'remove'),
          destructive: true,
        })
        if (!ok) return
        const result = await removeVehicleMeter(meter.id)
        if (!result.success) {
          toast.error(result.error || t('saveError'))
          return
        }
        toast.success(t('removed', { name: meter.name }))
        router.refresh()
      }}
    >
      {t(isMarine ? 'removeMarine' : 'remove')}
    </DropdownMenuItem>
  )
}

/** A reading field: what is typed, the meter's unit beside it. */
function ReadingField({
  id,
  label,
  unit,
  value,
  onChange,
  describedBy,
  autoFocus,
}: {
  id: string
  label: string
  unit: string
  value: string
  onChange: (value: string) => void
  describedBy?: string
  autoFocus?: boolean
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          className="w-40"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-describedby={describedBy}
          autoFocus={autoFocus}
        />
        {unit && <span className="text-sm text-muted-foreground">{unit}</span>}
      </div>
    </div>
  )
}

function AddMeterDialog({
  open,
  onClose,
  vehicleId,
  types,
}: {
  open: boolean
  onClose: () => void
  vehicleId: string
  types: MeterTypeView[]
}) {
  const t = useTranslations('vehicles.meters')
  const tc = useTranslations('common.buttons')
  const isMarine = useServiceType() === 'marine'
  const router = useRouter()
  const today = useToday()
  const [typeId, setTypeId] = useState<string | null>(null)
  const [value, setValue] = useState('')
  const [day, setDay] = useState('')
  const [saving, setSaving] = useState(false)
  const chosen = types.find((type) => type.id === typeId) ?? types[0]

  const close = () => {
    setTypeId(null)
    setValue('')
    setDay('')
    onClose()
  }

  const save = async () => {
    if (!chosen) return
    if (value.trim() && parseMeterValue(value) === null) {
      toast.error(t('invalidReading'))
      return
    }
    setSaving(true)
    const result = await addVehicleMeter({
      vehicleId,
      meterTypeId: chosen.id,
      value: value.trim() || undefined,
      readOn: day || today(),
    })
    setSaving(false)
    if (!result.success) {
      toast.error(result.error || t('saveError'))
      return
    }
    toast.success(t('added', { name: chosen.name }))
    close()
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('addMeterTitle')}</DialogTitle>
          <DialogDescription>
            {t(isMarine ? 'addMeterHintMarine' : 'addMeterHint')}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="space-y-1.5">
            <Label>{t('meter')}</Label>
            <div className="flex flex-wrap gap-2">
              {types.map((type) => (
                <Button
                  key={type.id}
                  type="button"
                  size="sm"
                  variant={chosen?.id === type.id ? 'default' : 'outline'}
                  aria-pressed={chosen?.id === type.id}
                  onClick={() => setTypeId(type.id)}
                >
                  {type.name}
                </Button>
              ))}
            </div>
          </div>
          <ReadingField
            id="meter-first-reading"
            label={t('firstReading')}
            unit={chosen?.unit ?? ''}
            value={value}
            onChange={setValue}
          />
          <div className="space-y-1.5">
            <Label>{t('readingDate')}</Label>
            <DateInput value={day || today()} onChange={setDay} />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={close}>
            {tc('cancel')}
          </Button>
          <Button type="button" onClick={save} disabled={saving || !chosen}>
            {t('addMeter')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ReadingDialog({ meter, onClose }: { meter: VehicleMeterView; onClose: () => void }) {
  const t = useTranslations('vehicles.meters')
  const tc = useTranslations('common.buttons')
  const router = useRouter()
  const today = useToday()
  const meterText = useMeterText()
  const [value, setValue] = useState('')
  const [day, setDay] = useState('')
  const [saving, setSaving] = useState(false)
  // Checked against the reading as it stands now; the server checks against
  // the last one before the chosen day and says so if it differs.
  const lower = isLowerMeterValue(value, meter.current)

  const save = async () => {
    if (parseMeterValue(value) === null) {
      toast.error(t('invalidReading'))
      return
    }
    setSaving(true)
    const result = await addMeterReading({
      vehicleMeterId: meter.id,
      value,
      readOn: day || today(),
    })
    setSaving(false)
    if (!result.success || !result.data) {
      toast.error(result.error || t('saveError'))
      return
    }
    if (result.data.lower && result.data.last != null) {
      toast.warning(
        t('savedLower', { name: meter.name, last: meterText(result.data.last, meter.unit) })
      )
    } else toast.success(t('readingSaved', { name: meter.name }))
    onClose()
    router.refresh()
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('addReadingTitle', { name: meter.name })}</DialogTitle>
          {meter.current != null && (
            <DialogDescription>
              {t('currentIs', { reading: meterText(meter.current, meter.unit) })}
            </DialogDescription>
          )}
        </DialogHeader>
        <DialogBody className="space-y-4">
          <ReadingField
            id="meter-reading"
            label={t('reading')}
            unit={meter.unit}
            value={value}
            onChange={setValue}
            describedBy={lower ? 'meter-reading-lower' : undefined}
            autoFocus
          />
          {lower && meter.current != null && (
            <p
              id="meter-reading-lower"
              role="status"
              className="text-xs text-amber-600 dark:text-amber-500"
            >
              {t('lowerReading', { last: meterText(meter.current, meter.unit) })}
            </p>
          )}
          <div className="space-y-1.5">
            <Label>{t('readingDate')}</Label>
            <DateInput value={day || today()} onChange={setDay} />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {tc('cancel')}
          </Button>
          <Button type="button" onClick={save} disabled={saving || !value.trim()}>
            {t('saveReading')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ReplaceDialog({ meter, onClose }: { meter: VehicleMeterView; onClose: () => void }) {
  const t = useTranslations('vehicles.meters')
  const tc = useTranslations('common.buttons')
  const router = useRouter()
  const today = useToday()
  const [oldEnd, setOldEnd] = useState(meter.current != null ? String(meter.current) : '')
  const [newStart, setNewStart] = useState('0')
  const [day, setDay] = useState('')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (parseMeterValue(oldEnd) === null || parseMeterValue(newStart) === null) {
      toast.error(t('invalidReading'))
      return
    }
    setSaving(true)
    const result = await replaceVehicleMeter({
      vehicleMeterId: meter.id,
      oldEnd,
      newStart,
      readOn: day || today(),
    })
    setSaving(false)
    if (!result.success) {
      toast.error(result.error || t('saveError'))
      return
    }
    toast.success(t('replacedSaved', { name: meter.name }))
    onClose()
    router.refresh()
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('replaceTitle', { name: meter.name })}</DialogTitle>
          <DialogDescription>{t('replaceHint')}</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <ReadingField
            id="meter-old-end"
            label={t('oldEnd')}
            unit={meter.unit}
            value={oldEnd}
            onChange={setOldEnd}
          />
          <ReadingField
            id="meter-new-start"
            label={t('newStart')}
            unit={meter.unit}
            value={newStart}
            onChange={setNewStart}
          />
          <div className="space-y-1.5">
            <Label>{t('replacedOn')}</Label>
            <DateInput value={day || today()} onChange={setDay} />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {tc('cancel')}
          </Button>
          <Button type="button" onClick={save} disabled={saving}>
            {t('replaceSave')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function HistoryDialog({ meter, onClose }: { meter: VehicleMeterView; onClose: () => void }) {
  const t = useTranslations('vehicles.meters')
  const tc = useTranslations('common.buttons')
  const router = useRouter()
  const meterText = useMeterText()
  const readingDate = useReadingDate()
  const [readings, setReadings] = useState(meter.readings)
  const [busy, setBusy] = useState<string | null>(null)

  const mark = async (id: string, wrong: boolean) => {
    setBusy(id)
    const result = await markMeterReadingWrong({ readingId: id, wrong })
    setBusy(null)
    if (!result.success) {
      toast.error(result.error || t('saveError'))
      return
    }
    setReadings((rows) => rows.map((row) => (row.id === id ? { ...row, wrong } : row)))
    router.refresh()
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('historyTitle', { name: meter.name })}</DialogTitle>
          <DialogDescription>{t('historyHint')}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          {readings.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('noReadings')}</p>
          ) : (
            <ul className="divide-y" data-testid="meter-history">
              {readings.map((row) => (
                <li key={row.id} className="flex items-start gap-3 py-2.5 text-sm">
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          'font-medium tabular-nums',
                          row.wrong && 'text-muted-foreground line-through'
                        )}
                      >
                        {meterText(row.value, meter.unit)}
                      </span>
                      {row.wrong && <Badge variant="outline">{t('wrongBadge')}</Badge>}
                      {row.replacedFrom != null && (
                        <Badge variant="secondary">{t('replacedBadge')}</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {readingDate(row.readAt)}
                      {row.job && (
                        <>
                          {' · '}
                          {row.job.vehicleId ? (
                            <Link
                              href={`/vehicles/${row.job.vehicleId}/service/${row.job.id}`}
                              className="underline-offset-2 hover:underline"
                            >
                              {row.job.invoiceNumber || row.job.title}
                            </Link>
                          ) : (
                            row.job.invoiceNumber || row.job.title
                          )}
                        </>
                      )}
                      {row.source === 'tech' && <> · {t('fromApp')}</>}
                    </p>
                    {row.replacedFrom != null && (
                      <p className="text-xs text-muted-foreground">
                        {t('replacedLine', {
                          oldEnd: meterText(row.replacedFrom, meter.unit),
                          newStart: meterText(row.value, meter.unit),
                        })}
                      </p>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 shrink-0 px-2 text-xs"
                    disabled={busy === row.id}
                    onClick={() => mark(row.id, !row.wrong)}
                  >
                    {row.wrong ? t('countAgain') : t('markWrong')}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {t('close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
