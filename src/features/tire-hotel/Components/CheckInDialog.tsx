'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Check, Loader2, Warehouse } from 'lucide-react'
import { DocsLink } from '@/components/docs-link'
import { cn } from '@/lib/utils'
import { useFormatDate } from '@/lib/use-format-date'
import { CustomerCombobox } from '@/features/quotes/Components/CustomerCombobox'
import { LocationPicker, type PickerLocation } from './LocationPicker'
import { TreadEntry, type TreadRow } from './TreadEntry'
import { TreatmentPicker } from './TreatmentPicker'
import { defaultTreatments, type TreatmentType } from '../Lib/treatments'
import { checkInTireSet, getReturningSets, returnTireSet } from '../Actions/tireSetActions'
import { groupRounds } from '../Lib/wear'
import { TIRE_SEASONS, TIRE_ROAD_POSITIONS, thirtySecondsToMm } from '../Lib/tireConstants'

type ReturningSet = NonNullable<Awaited<ReturnType<typeof getReturningSets>>['data']>[number]

type VehicleOption = {
  id: string
  make: string
  model: string
  year: number
  licensePlate: string | null
  customerId: string | null
}

/**
 * Arrival, in one pass.
 *
 * The order follows what actually happens at the counter: whose tires these
 * are, what they are, how many, then where they go. Capacity is answered
 * live as the quantity changes, so nobody fills in a whole form only to be
 * told at submit that the shelf is full.
 */
export function CheckInDialog({
  open,
  onOpenChange,
  locations,
  vehicles,
  imperial,
  defaultQuantity = 4,
  lockedVehicle,
  serviceRecordId,
  onCheckedIn,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  locations: PickerLocation[]
  vehicles: VehicleOption[]
  imperial: boolean
  defaultQuantity?: number
  /**
   * Set when check-in starts from a job. The car is already on the ramp and
   * the job already says whose it is, so asking again is a question with a
   * known answer, and a chance to pick the wrong one.
   */
  lockedVehicle?: VehicleOption
  /** The job these tires came in on. Linked to the new set on save. */
  serviceRecordId?: string
  /**
   * Called instead of navigating to the new set. Check-in from the tire hotel
   * goes straight to the labels; check-in from a job should not drag the desk
   * off the job they are still writing.
   */
  onCheckedIn?: (set: { id: string; quantity: number }) => void
}) {
  const router = useRouter()
  const t = useTranslations('tireHotel')
  const { formatDate } = useFormatDate()
  const [saving, setSaving] = useState(false)

  const [customerId, setCustomerId] = useState('')
  const [vehicleId, setVehicleId] = useState('')
  // Sets this customer has left with before. The ordinary year at a tire
  // hotel is the same tires coming back, so the question is which of theirs
  // these are, not what they are.
  const [previousSets, setPreviousSets] = useState<ReturningSet[]>([])
  const [returning, setReturning] = useState<ReturningSet | null>(null)
  const [season, setSeason] = useState<string>('winter')
  const [studded, setStudded] = useState(false)
  const [brand, setBrand] = useState('')
  const [model, setModel] = useState('')
  const [size, setSize] = useState('')
  const [dotCode, setDotCode] = useState('')
  const [withRims, setWithRims] = useState(false)
  const [hasTpms, setHasTpms] = useState(false)
  const [quantity, setQuantity] = useState(String(defaultQuantity))
  const [locationId, setLocationId] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const [treads, setTreads] = useState<TreadRow[]>(() =>
    TIRE_ROAD_POSITIONS.map((position) => ({ position, tread: '', condition: 'good' }))
  )
  const [treatments, setTreatments] = useState<TreatmentType[]>(() =>
    defaultTreatments({ withRims: false })
  )

  useEffect(() => {
    if (open) return
    setCustomerId('')
    setVehicleId('')
    setSeason('winter')
    setStudded(false)
    setBrand('')
    setModel('')
    setSize('')
    setDotCode('')
    setWithRims(false)
    setHasTpms(false)
    setQuantity(String(defaultQuantity))
    setLocationId(null)
    setNotes('')
    setTreads(TIRE_ROAD_POSITIONS.map((position) => ({ position, tread: '', condition: 'good' })))
    setTreatments(defaultTreatments({ withRims: false }))
    setVehicleId(lockedVehicle?.id ?? '')
    setCustomerId(lockedVehicle?.customerId ?? '')
    setPreviousSets([])
    setReturning(null)
  }, [open, defaultQuantity, lockedVehicle])

  // Look for their earlier sets as soon as there is somebody to look under.
  useEffect(() => {
    if (!open || (!customerId && !vehicleId)) {
      setPreviousSets([])
      return
    }
    let cancelled = false
    // Opened from a job, the car is decided, so only that car's sets are
    // offered. Widening to the customer would put their other vehicle's tires
    // one click from being filed against this one.
    getReturningSets(
      lockedVehicle
        ? { vehicleId: lockedVehicle.id }
        : { customerId: customerId || null, vehicleId: vehicleId || null }
    ).then((result) => {
      if (cancelled) return
      setPreviousSets(result.success && result.data ? result.data : [])
    })
    return () => {
      cancelled = true
    }
  }, [open, customerId, vehicleId, lockedVehicle])

  /**
   * Switches the form to a set the shop already holds a record of.
   *
   * The tire details come along even though they are no longer editable here:
   * the treatment picker needs to know about rims and sensors, and the tread
   * grading needs the season, and both would otherwise grade against whatever
   * the blank form happened to be showing.
   */
  const pickReturning = (set: ReturningSet | null) => {
    setReturning(set)
    if (!set) return
    setSeason(set.season)
    setStudded(set.studded)
    setBrand(set.brand ?? '')
    setModel(set.model ?? '')
    setSize(set.size ?? '')
    setWithRims(set.withRims)
    setHasTpms(set.hasTpms)
    setQuantity(String(set.quantity))
    // Never repoints a car the job already decided.
    if (!lockedVehicle) {
      if (set.customerId) setCustomerId(set.customerId)
      if (set.vehicleId) setVehicleId(set.vehicleId)
    }
    setTreatments(defaultTreatments({ withRims: set.withRims }))
  }

  /** Last season's readings, per position, for the set being brought back. */
  const lastReadings = (() => {
    if (!returning) return undefined
    const rounds = groupRounds(returning.measurements)
    if (rounds.length === 0) return undefined
    const out: Record<string, number | null> = {}
    for (const row of rounds[0].rows) out[row.position] = row.treadDepthMm
    return out
  })()

  const qty = Math.max(1, Number(quantity) || 1)

  // Naming the customer narrows the vehicle list to theirs. Without a
  // customer the full list stays available, so staff can still start from
  // the plate.
  const visibleVehicles = customerId
    ? vehicles.filter((v) => v.customerId === customerId)
    : vehicles

  // Picking the vehicle names its owner, which is the common case at the
  // counter: staff scan a plate, not a customer record.
  const handleVehicle = (id: string) => {
    setVehicleId(id)
    const vehicle = vehicles.find((v) => v.id === id)
    if (vehicle?.customerId && !customerId) setCustomerId(vehicle.customerId)
  }

  // Cleared here rather than in an effect: a vehicle owned by someone else
  // has just dropped out of the list, and leaving it selected would submit a
  // pairing the form no longer shows.
  const handleCustomer = (id: string) => {
    setCustomerId(id)
    const current = vehicles.find((v) => v.id === vehicleId)
    if (id && current && current.customerId !== id) setVehicleId('')
  }

  const handleSubmit = async () => {
    if (!locationId) {
      toast.error(t('checkIn.pickLocationFirst'))
      return
    }
    setSaving(true)

    const measurements = treads
      .filter((row) => row.tread.trim() !== '' || row.condition !== 'good')
      .map((row) => {
        const entered = Number(row.tread)
        const treadDepthMm = Number.isFinite(entered)
          ? imperial
            ? Number(thirtySecondsToMm(entered).toFixed(2))
            : entered
          : null
        return {
          position: row.position,
          treadDepthMm,
          condition: row.condition,
        }
      })

    // The same rubber goes back on the same record. A second record every
    // season would split one set's history in two and lose the wear.
    const result = returning
      ? await returnTireSet({
          id: returning.id,
          locationId,
          quantity: qty,
          note: notes,
          measurements,
          treatments,
          serviceRecordId: serviceRecordId ?? null,
        })
      : await checkInTireSet({
          serviceRecordId: serviceRecordId ?? null,
          customerId: customerId || null,
          vehicleId: vehicleId || null,
          season,
          studded,
          brand,
          model,
          size,
          dotCode,
          withRims,
          hasTpms,
          quantity: qty,
          locationId,
          notes,
          measurements,
          treatments,
        })

    setSaving(false)

    if (!result.success) {
      toast.error(result.error ?? t('checkIn.failed'))
      return
    }
    toast.success(
      t(returning ? 'checkIn.returned' : 'checkIn.success', {
        reference: result.data?.reference ?? '',
        code: result.data?.locationCode ?? '',
      })
    )
    onOpenChange(false)
    if (onCheckedIn && result.data?.id) {
      onCheckedIn({ id: result.data.id, quantity: qty })
      router.refresh()
      return
    }
    // Straight to the set with the label dialog open: the tech is holding the
    // tires right now, and the sticker has to go on before they reach the
    // shelf. Coming back for it later is how sets end up unlabelled.
    if (result.data?.id) {
      router.push(`/tire-hotel/${result.data.id}?print=1`)
      return
    }
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('checkIn.title')}</DialogTitle>
          <DialogDescription>{t('checkIn.description')}</DialogDescription>
          <DocsLink href="/docs/features/tire-hotel" variant="hint" className="self-start" />
        </DialogHeader>

        <div className="space-y-5">
          {lockedVehicle ? (
            // The job already answered this. Shown rather than asked, so the
            // desk can see the tires are going against the right car.
            <div className="rounded-lg border bg-muted/40 px-3 py-2">
              <p className="text-xs text-muted-foreground">{t('checkIn.vehicle')}</p>
              <p className="truncate text-sm font-medium">
                {lockedVehicle.licensePlate ? `${lockedVehicle.licensePlate} - ` : ''}
                {lockedVehicle.year} {lockedVehicle.make} {lockedVehicle.model}
              </p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t('checkIn.customer')}</Label>
                <CustomerCombobox
                  value={customerId}
                  onChange={handleCustomer}
                  placeholder={t('checkIn.selectCustomer')}
                  noneLabel={t('checkIn.noCustomer')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="checkInVehicle">{t('checkIn.vehicle')}</Label>
                <Select
                  value={vehicleId}
                  onValueChange={handleVehicle}
                  disabled={visibleVehicles.length === 0}
                >
                  <SelectTrigger id="checkInVehicle">
                    <SelectValue placeholder={t('checkIn.selectVehicle')} />
                  </SelectTrigger>
                  <SelectContent>
                    {visibleVehicles.map((vehicle) => (
                      <SelectItem key={vehicle.id} value={vehicle.id}>
                        {vehicle.licensePlate ? `${vehicle.licensePlate} - ` : ''}
                        {vehicle.year} {vehicle.make} {vehicle.model}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {customerId && visibleVehicles.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    {t('checkIn.noVehiclesForCustomer')}
                  </p>
                )}
              </div>
            </div>
          )}

          {previousSets.length > 0 && (
            <>
              <Separator />
              <div className="space-y-2">
                <Label>{t('checkIn.storedBefore')}</Label>
                <p className="text-xs text-muted-foreground">{t('checkIn.storedBeforeHint')}</p>
                <div className="divide-y rounded-lg border">
                  {previousSets.map((set) => {
                    const isOn = returning?.id === set.id
                    return (
                      <button
                        key={set.id}
                        type="button"
                        onClick={() => pickReturning(isOn ? null : set)}
                        aria-pressed={isOn}
                        className={cn(
                          'flex w-full min-w-0 items-center gap-2 px-2.5 py-1.5 text-left transition-colors',
                          'focus-visible:ring-ring focus-visible:ring-inset focus-visible:ring-2 focus-visible:outline-none',
                          isOn ? 'bg-primary/5' : 'hover:bg-muted/60'
                        )}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm">
                            {[
                              t(`seasons.${set.season}`),
                              set.brand,
                              set.size,
                              t('checkIn.pieces', { count: set.quantity }),
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                          <span className="block truncate text-[11px] text-muted-foreground">
                            {set.reference ? `${set.reference} · ` : ''}
                            {/* Which car, since a customer with two of them
                                has two sets on this list and they are not
                                interchangeable. */}
                            {set.vehicle?.licensePlate ? `${set.vehicle.licensePlate} · ` : ''}
                            {set.checkedOutAt
                              ? t('checkIn.lastOut', {
                                  date: formatDate(new Date(set.checkedOutAt)),
                                })
                              : t('checkIn.notStored')}
                          </span>
                        </span>
                        <span className="w-3.5 shrink-0">
                          {isOn && <Check className="size-3.5 text-primary" />}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </>
          )}

          <Separator />

          {returning ? (
            // Settled the first time these tires came in. What changes each
            // season is where they go and what they measure, and offering the
            // brand for editing here invites a typo that quietly turns one
            // set's history into another's.
            <div className="rounded-lg border bg-muted/40 px-3 py-2">
              <p className="text-xs text-muted-foreground">{t('checkIn.sameSet')}</p>
              <p className="truncate text-sm font-medium">
                {[
                  t(`seasons.${returning.season}`),
                  returning.brand,
                  returning.model,
                  returning.size,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
          ) : null}

          <div className={cn('grid gap-4 sm:grid-cols-2', returning && 'sm:grid-cols-1')}>
            {!returning && (
              <div className="space-y-2">
                <Label htmlFor="checkInSeason">{t('checkIn.season')}</Label>
                <Select value={season} onValueChange={setSeason}>
                  <SelectTrigger id="checkInSeason">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIRE_SEASONS.map((value) => (
                      <SelectItem key={value} value={value}>
                        {t(`seasons.${value}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="checkInQuantity">{t('checkIn.quantity')}</Label>
              <Input
                id="checkInQuantity"
                type="number"
                min="1"
                max="20"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">{t('checkIn.quantityHint')}</p>
            </div>
          </div>

          {!returning && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="checkInBrand">{t('checkIn.brand')}</Label>
                <Input
                  id="checkInBrand"
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  placeholder={t('checkIn.brandPlaceholder')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="checkInModel">{t('checkIn.model')}</Label>
                <Input id="checkInModel" value={model} onChange={(e) => setModel(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="checkInSize">{t('checkIn.size')}</Label>
                <Input
                  id="checkInSize"
                  value={size}
                  onChange={(e) => setSize(e.target.value)}
                  placeholder={t('checkIn.sizePlaceholder')}
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="checkInDot">{t('checkIn.dotCode')}</Label>
                <Input
                  id="checkInDot"
                  value={dotCode}
                  onChange={(e) => setDotCode(e.target.value)}
                  placeholder={t('checkIn.dotPlaceholder')}
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">{t('checkIn.dotHint')}</p>
              </div>
            </div>
          )}

          {!returning && (
            <div className="flex flex-wrap gap-6">
              <div className="flex items-center gap-2">
                <Switch
                  id="checkInRims"
                  checked={withRims}
                  onCheckedChange={(on) => {
                    setWithRims(on)
                    // Rims arriving almost always means the rims get washed too;
                    // unticking removes it again rather than leaving a job for
                    // parts that are not here.
                    setTreatments((current) =>
                      on
                        ? current.includes('wash_rims')
                          ? current
                          : [...current, 'wash_rims']
                        : current.filter((x) => x !== 'wash_rims')
                    )
                  }}
                />
                <Label htmlFor="checkInRims" className="font-normal">
                  {t('checkIn.withRims')}
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch id="checkInTpms" checked={hasTpms} onCheckedChange={setHasTpms} />
                <Label htmlFor="checkInTpms" className="font-normal">
                  {t('checkIn.hasTpms')}
                </Label>
              </div>
              {season === 'winter' && (
                <div className="flex items-center gap-2">
                  <Switch id="checkInStudded" checked={studded} onCheckedChange={setStudded} />
                  <Label htmlFor="checkInStudded" className="font-normal">
                    {t('checkIn.studded')}
                  </Label>
                </div>
              )}
            </div>
          )}

          <Separator />

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Warehouse className="h-4 w-4" />
              {t('checkIn.location')}
            </Label>
            <LocationPicker
              locations={locations}
              value={locationId}
              onChange={setLocationId}
              quantity={qty}
            />
          </div>

          <Separator />

          <div className="space-y-2">
            <Label>{t('treatments.title')}</Label>
            <p className="text-xs text-muted-foreground">{t('checkIn.treatmentsHint')}</p>
            <TreatmentPicker
              selected={treatments}
              onChange={setTreatments}
              withRims={withRims}
              hasTpms={hasTpms}
            />
          </div>

          <Separator />

          <div className="space-y-2">
            <Label>{t('checkIn.treadTitle')}</Label>
            <p className="text-xs text-muted-foreground">{t('checkIn.treadHint')}</p>
            <TreadEntry
              rows={treads}
              onChange={setTreads}
              imperial={imperial}
              season={season}
              previous={lastReadings}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="checkInNotes">{t('checkIn.notes')}</Label>
            <Textarea
              id="checkInNotes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={saving || !locationId}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t(returning ? 'checkIn.submitReturn' : 'checkIn.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
