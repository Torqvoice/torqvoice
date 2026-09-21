'use client'

import { type ReactNode, useEffect, useState } from 'react'
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
import { Checkbox } from '@/components/ui/checkbox'
import { useFormatCurrency } from '@/components/currency-settings-context'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Car,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  ClipboardCheck,
  History,
  Loader2,
  Receipt,
  Ruler,
  Sparkles,
  StickyNote,
  Warehouse,
  type LucideIcon,
} from 'lucide-react'
import { DocsLink } from '@/components/docs-link'
import { cn } from '@/lib/utils'
import { useFormatDate } from '@/lib/use-format-date'
import { LocationPicker, type PickerLocation } from './LocationPicker'
import { OwnerVehicleFields, type VehicleOption } from './OwnerVehicleFields'
import { TreadEntry, type TreadRow } from './TreadEntry'
import { TreatmentPicker } from './TreatmentPicker'
import { defaultTreatments, type TreatmentPrices, type TreatmentType } from '../Lib/treatments'
import { checkInTireSet, getReturningSets, returnTireSet } from '../Actions/tireSetActions'
import { groupRounds } from '../Lib/wear'
import { TIRE_SEASONS, TIRE_ROAD_POSITIONS, thirtySecondsToMm } from '../Lib/tireConstants'

/** The three steps, in order. Keys only; the labels are translated where they are drawn. */
const STEPS = ['tires', 'storage', 'review'] as const

type ReturningSet = NonNullable<Awaited<ReturnType<typeof getReturningSets>>['data']>[number]

/**
 * Arrival, in one pass.
 *
 * The order follows what actually happens at the counter: whose tires these
 * are and what they are, then where they go and what gets done to them, then
 * a read-back with the charges before anything is saved. Three steps rather
 * than one long form, because a form that scrolls hides the button that
 * finishes it. Capacity is answered live as the quantity changes, so nobody
 * gets to the end only to be told the shelf is full.
 */
export function CheckInDialog({
  open,
  onOpenChange,
  locations,
  vehicles,
  imperial,
  thresholds,
  defaultQuantity = 4,
  lockedVehicle,
  serviceRecordId,
  billing,
  onCheckedIn,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  locations: PickerLocation[]
  vehicles: VehicleOption[]
  imperial: boolean
  /**
   * The workshop's own replacement limits. Without them the grade falls back
   * to built-in figures, and a shop that set its winter limit to 3 mm would
   * still see 3.5 mm called Replace.
   */
  thresholds?: { summerReplace: number; winterReplace: number; warnMargin: number }
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
   * What the workshop charges, when the job can take the charge. Given, the
   * dialog offers to put the storage fee and the priced prep on the job in the
   * same save: the desk is looking at the bill right now, and a fee that has
   * to be remembered later is a fee that does not get charged.
   */
  billing?: { storagePrice: number; treatmentPrices: TreatmentPrices }
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
  const formatCurrency = useFormatCurrency()
  const [saving, setSaving] = useState(false)
  const [step, setStep] = useState(0)

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
  // On by default: a stored set is nearly always a second set of wheels, and
  // the odd loose set is one switch away. Washing the rims follows it.
  const [withRims, setWithRims] = useState(true)
  const [hasTpms, setHasTpms] = useState(false)
  const [quantity, setQuantity] = useState(String(defaultQuantity))
  const [locationId, setLocationId] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const [treads, setTreads] = useState<TreadRow[]>(() =>
    TIRE_ROAD_POSITIONS.map((position) => ({ position, tread: '', condition: 'good' }))
  )
  const [treatments, setTreatments] = useState<TreatmentType[]>(() =>
    defaultTreatments({ withRims: true })
  )
  const [billStorage, setBillStorage] = useState(false)
  const [storageAmount, setStorageAmount] = useState('')
  // Kept as the prep left off the bill rather than the prep on it, so work
  // ticked after the dialog opened is charged without a second click.
  const [unbilledPrep, setUnbilledPrep] = useState<TreatmentType[]>([])

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
    setWithRims(true)
    setHasTpms(false)
    setQuantity(String(defaultQuantity))
    setLocationId(null)
    setNotes('')
    setTreads(TIRE_ROAD_POSITIONS.map((position) => ({ position, tread: '', condition: 'good' })))
    setTreatments(defaultTreatments({ withRims: true }))
    setVehicleId(lockedVehicle?.id ?? '')
    setCustomerId(lockedVehicle?.customerId ?? '')
    setPreviousSets([])
    setReturning(null)
    // A shop with a price wants it charged; one without has to opt in, since
    // a zero line on the job is only something to delete.
    setBillStorage((billing?.storagePrice ?? 0) > 0)
    setStorageAmount(billing?.storagePrice ? String(billing.storagePrice) : '')
    setUnbilledPrep([])
    setStep(0)
  }, [open, defaultQuantity, lockedVehicle, billing])

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

  // Only the prep somebody asked for and the shop has priced can be billed.
  const pricedPrep = billing
    ? treatments.flatMap((type) => {
        const price = billing.treatmentPrices[type] ?? 0
        return price > 0 ? [{ type, price }] : []
      })
    : []
  const billedPrep = pricedPrep.filter((line) => !unbilledPrep.includes(line.type))
  const storageFee = billStorage ? Math.max(0, Number(storageAmount) || 0) : 0
  const billTotal = storageFee + billedPrep.reduce((sum, line) => sum + line.price, 0)
  const jobBilling =
    billing && serviceRecordId && (billStorage || billedPrep.length > 0)
      ? {
          ...(billStorage ? { storageAmount: storageFee } : {}),
          treatments: billedPrep.map((line) => line.type),
        }
      : null

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
          billing: jobBilling,
        })
      : await checkInTireSet({
          serviceRecordId: serviceRecordId ?? null,
          billing: jobBilling,
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

  const shelf = locations.find((l) => l.id === locationId) ?? null
  const canBillJob = Boolean(billing && serviceRecordId)
  const last = step === STEPS.length - 1
  // The one thing a set cannot be stored without. Asked for on the step that
  // has the picker, so nobody reaches the end to be sent back.
  const blocked = step >= 1 && !locationId

  const stepLabels = [t('list.tires'), t('checkIn.stepStorage'), t('checkIn.stepReview')]
  const measured = treads.filter((row) => row.tread.trim() !== '')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Three short steps rather than one long form. Each fits the dialog, so
          nothing scrolls on an ordinary screen and the button that moves on is
          always in the same place. The body keeps a floor under its height
          so the dialog does not jump between steps, but only on a screen tall
          enough for it: on a short one the floor would push the footer out of
          the dialog, and scrolling is the lesser evil there. */}
      <DialogContent className="flex max-h-[92vh] flex-col gap-0 !overflow-hidden p-0 sm:max-w-5xl">
        <DialogHeader className="border-b px-6 py-4 pr-14">
          <div className="flex items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Warehouse className="size-4.5" />
            </span>
            <div className="min-w-0 space-y-1 text-left">
              <DialogTitle>{t('checkIn.title')}</DialogTitle>
              <DialogDescription>{t('checkIn.description')}</DialogDescription>
            </div>
            <DocsLink
              href="/docs/features/tire-hotel"
              variant="hint"
              className="ml-auto hidden shrink-0 sm:inline-flex"
            />
          </div>
        </DialogHeader>

        {/* Where you are. A finished step can be gone back to; the way
            forward is the button, which is where the shelf is checked. */}
        <ol className="flex items-center gap-2 border-b bg-muted/30 px-6 py-2.5">
          {STEPS.map((key, index) => {
            const done = index < step
            const current = index === step
            return (
              <li key={key} className="flex min-w-0 items-center gap-2">
                {index > 0 && <span aria-hidden className="h-px w-6 shrink-0 bg-border sm:w-10" />}
                <button
                  type="button"
                  onClick={() => setStep(index)}
                  disabled={!done}
                  aria-current={current ? 'step' : undefined}
                  className={cn(
                    'flex min-w-0 items-center gap-2 rounded-md text-sm transition-colors',
                    'focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none',
                    current ? 'font-medium text-foreground' : 'text-muted-foreground',
                    done && 'hover:text-foreground'
                  )}
                >
                  <span
                    className={cn(
                      'flex size-6 shrink-0 items-center justify-center rounded-full border text-xs tabular-nums',
                      current && 'border-primary bg-primary text-primary-foreground',
                      done && 'border-primary/40 bg-primary/10 text-primary'
                    )}
                  >
                    {done ? <Check className="size-3.5" /> : index + 1}
                  </span>
                  <span className={cn('truncate', !current && 'hidden sm:inline')}>
                    {stepLabels[index]}
                  </span>
                </button>
              </li>
            )
          })}
        </ol>

        <div className="grid min-h-0 flex-1 items-start gap-4 overflow-y-auto bg-muted/30 p-4 sm:p-6 md:grid-cols-2 md:[@media(min-height:760px)]:min-h-[30rem]">
          {step === 0 && (
            <>
              {/* Whose tires, and whether the shop has held them before. */}
              <div className="space-y-4">
                <Section
                  icon={Car}
                  title={lockedVehicle ? t('checkIn.vehicle') : t('checkIn.sectionOwner')}
                >
                  {lockedVehicle ? (
                    // The job already answered this. Shown rather than asked, so
                    // the desk can see the tires are going against the right car.
                    <div className="flex items-center gap-3 rounded-lg border bg-muted/40 px-3 py-2">
                      {lockedVehicle.licensePlate && (
                        <span className="shrink-0 rounded border bg-background px-2 py-0.5 font-mono text-sm font-semibold">
                          {lockedVehicle.licensePlate}
                        </span>
                      )}
                      <p className="truncate text-sm font-medium">
                        {lockedVehicle.year} {lockedVehicle.make} {lockedVehicle.model}
                      </p>
                    </div>
                  ) : (
                    <OwnerVehicleFields
                      vehicles={vehicles}
                      customerId={customerId}
                      onCustomerChange={setCustomerId}
                      vehicleId={vehicleId}
                      onVehicleChange={setVehicleId}
                      // A set chosen under the old pairing is not this pairing's set.
                      onPairChanged={() => setReturning(null)}
                      idPrefix="checkIn"
                    />
                  )}
                </Section>

                {previousSets.length > 0 && (
                  <Section
                    icon={History}
                    title={t('checkIn.storedBefore')}
                    hint={t('checkIn.storedBeforeHint')}
                  >
                    {/* Its own short scroller: a fleet customer can have a
                        dozen sets, and the step must not grow with them. */}
                    <div className="max-h-44 divide-y overflow-y-auto rounded-lg border">
                      {previousSets.map((set) => {
                        const isOn = returning?.id === set.id
                        return (
                          <button
                            key={set.id}
                            type="button"
                            onClick={() => pickReturning(isOn ? null : set)}
                            aria-pressed={isOn}
                            className={cn(
                              'flex w-full min-w-0 items-center gap-2 px-3 py-2 text-left transition-colors',
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
                  </Section>
                )}
              </div>

              {/* What they are. */}
              <Section icon={CircleDot} title={t('list.tires')}>
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
                        <SelectTrigger id="checkInSeason" className="w-full">
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
                  </div>
                  <p className="-mt-2 text-xs text-muted-foreground sm:col-span-full">
                    {t('checkIn.quantityHint')}
                  </p>
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
                      <Input
                        id="checkInModel"
                        value={model}
                        onChange={(e) => setModel(e.target.value)}
                      />
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
                  <div className="divide-y rounded-lg border">
                    <SwitchRow
                      id="checkInRims"
                      label={t('checkIn.withRims')}
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
                    <SwitchRow
                      id="checkInTpms"
                      label={t('checkIn.hasTpms')}
                      checked={hasTpms}
                      onCheckedChange={setHasTpms}
                    />
                    {season === 'winter' && (
                      <SwitchRow
                        id="checkInStudded"
                        label={t('checkIn.studded')}
                        checked={studded}
                        onCheckedChange={setStudded}
                      />
                    )}
                  </div>
                )}
              </Section>
            </>
          )}

          {step === 1 && (
            <>
              {/* Where they go and what gets done to them. */}
              <div className="space-y-4">
                <Section icon={Warehouse} title={t('checkIn.location')}>
                  <LocationPicker
                    locations={locations}
                    value={locationId}
                    onChange={setLocationId}
                    quantity={qty}
                  />
                </Section>

                <Section
                  icon={Sparkles}
                  title={t('treatments.title')}
                  hint={t('checkIn.treatmentsHint')}
                >
                  <TreatmentPicker
                    selected={treatments}
                    onChange={setTreatments}
                    withRims={withRims}
                    hasTpms={hasTpms}
                    className="sm:grid-cols-2"
                  />
                </Section>
              </div>

              {/* What they measured on the way in. */}
              <Section icon={Ruler} title={t('checkIn.treadTitle')} hint={t('checkIn.treadHint')}>
                <TreadEntry
                  rows={treads}
                  onChange={setTreads}
                  imperial={imperial}
                  season={season}
                  thresholds={thresholds}
                  previous={lastReadings}
                />
              </Section>
            </>
          )}

          {step === 2 && (
            <>
              {/* Read back before it is saved, with room for what the form
                  had no field for. */}
              <div className="space-y-4">
                <Section icon={ClipboardCheck} title={t('checkIn.stepReview')}>
                  <dl className="divide-y rounded-lg border text-sm">
                    {lockedVehicle && (
                      <SummaryRow label={t('checkIn.vehicle')}>
                        {[lockedVehicle.licensePlate, lockedVehicle.make, lockedVehicle.model]
                          .filter(Boolean)
                          .join(' ')}
                      </SummaryRow>
                    )}
                    <SummaryRow label={t('list.tires')}>
                      {[
                        t('list.tireCount', { count: qty }),
                        t(`seasons.${season}`),
                        brand,
                        model,
                        size,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </SummaryRow>
                    <SummaryRow label={t('list.location')}>
                      {shelf ? (
                        <>
                          <span className="font-mono font-medium">{shelf.code}</span>
                          <span className="ml-2 text-xs text-muted-foreground">
                            {shelf.warehouseName}
                          </span>
                        </>
                      ) : (
                        '-'
                      )}
                    </SummaryRow>
                    <SummaryRow label={t('treatments.title')}>
                      {treatments.length > 0
                        ? treatments.map((type) => t(`treatments.types.${type}`)).join(', ')
                        : '-'}
                    </SummaryRow>
                    {measured.length > 0 && (
                      <SummaryRow label={t('checkIn.treadTitle')}>
                        <span className="tabular-nums">
                          {measured
                            .map((row) => `${row.tread} ${imperial ? '/32"' : 'mm'}`)
                            .join(' · ')}
                        </span>
                      </SummaryRow>
                    )}
                  </dl>
                </Section>

                {canBillJob && (
                  <Section icon={StickyNote} title={t('checkIn.notes')}>
                    <Textarea
                      id="checkInNotes"
                      aria-label={t('checkIn.notes')}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={3}
                    />
                  </Section>
                )}
              </div>

              {canBillJob && billing ? (
                // What this visit costs, last thing before the button that saves it.
                <Section icon={Receipt} title={t('job.addToWorkOrder')} hint={t('job.pricesHint')}>
                  <div className="divide-y rounded-lg border">
                    <div className="flex min-h-11 items-center gap-2.5 px-3 py-1.5">
                      <Checkbox
                        id="checkInBillStorage"
                        checked={billStorage}
                        onCheckedChange={(value) => setBillStorage(value === true)}
                      />
                      <Label
                        htmlFor="checkInBillStorage"
                        className="flex-1 cursor-pointer font-normal"
                      >
                        {t('job.storage')}
                      </Label>
                      {billStorage && (
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          inputMode="decimal"
                          value={storageAmount}
                          onChange={(e) => setStorageAmount(e.target.value)}
                          aria-label={t('job.storageFee')}
                          className="h-8 w-28 text-right text-sm tabular-nums"
                        />
                      )}
                    </div>
                    {pricedPrep.map((line) => (
                      <label
                        key={line.type}
                        className="flex min-h-11 cursor-pointer items-center gap-2.5 px-3 py-1.5 hover:bg-muted/50"
                      >
                        <Checkbox
                          checked={!unbilledPrep.includes(line.type)}
                          onCheckedChange={(value) =>
                            setUnbilledPrep((current) =>
                              value === true
                                ? current.filter((x) => x !== line.type)
                                : [...current, line.type]
                            )
                          }
                        />
                        <span className="min-w-0 flex-1 truncate text-sm">
                          {t(`treatments.types.${line.type}`)}
                        </span>
                        <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                          {formatCurrency(line.price)}
                        </span>
                      </label>
                    ))}
                    <div className="flex items-center justify-between gap-2 bg-muted/40 px-3 py-2">
                      <span className="text-sm font-medium">{t('job.total')}</span>
                      <span className="text-sm font-semibold tabular-nums">
                        {formatCurrency(billTotal)}
                      </span>
                    </div>
                  </div>
                </Section>
              ) : (
                <Section icon={StickyNote} title={t('checkIn.notes')}>
                  <Textarea
                    id="checkInNotes"
                    aria-label={t('checkIn.notes')}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={6}
                  />
                </Section>
              )}
            </>
          )}
        </div>

        <DialogFooter className="items-center border-t px-6 py-3 sm:justify-between">
          {/* What is about to be saved, read back in one line, or the one
              thing still missing. */}
          {blocked ? (
            <p className="text-sm text-amber-600">{t('checkIn.pickLocationFirst')}</p>
          ) : (
            <p className="flex min-w-0 flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
              <span>{t('list.tireCount', { count: qty })}</span>
              <span aria-hidden>·</span>
              <span>{t(`seasons.${season}`)}</span>
              {shelf && (
                <>
                  <span aria-hidden>·</span>
                  <span className="font-mono font-medium text-foreground">{shelf.code}</span>
                </>
              )}
              {jobBilling && (
                <>
                  <span aria-hidden>·</span>
                  <span className="tabular-nums">+ {formatCurrency(billTotal)}</span>
                </>
              )}
            </p>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            {step === 0 ? (
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                {t('common.cancel')}
              </Button>
            ) : (
              <Button variant="outline" onClick={() => setStep(step - 1)} disabled={saving}>
                <ChevronLeft className="mr-1 h-4 w-4" />
                {t('checkIn.back')}
              </Button>
            )}
            {last ? (
              <Button onClick={handleSubmit} disabled={saving || !locationId}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t(returning ? 'checkIn.submitReturn' : 'checkIn.submit')}
              </Button>
            ) : (
              <Button onClick={() => setStep(step + 1)} disabled={blocked}>
                {t('checkIn.next')}
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** One line of the read-back: what it is on the left, what was entered on the right. */
function SummaryRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline gap-3 px-3 py-2">
      <dt className="w-28 shrink-0 text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 flex-1 break-words">{children}</dd>
    </div>
  )
}

/** One titled panel of the form. */
function Section({
  icon: Icon,
  title,
  hint,
  children,
}: {
  icon: LucideIcon
  title: string
  hint?: string
  children: ReactNode
}) {
  return (
    <section className="space-y-4 rounded-xl border bg-card p-4 shadow-xs">
      <div className="space-y-1">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Icon className="size-4 text-muted-foreground" />
          {title}
        </h3>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  )
}

/** A yes/no fact about the set: the whole row is the label, the switch sits right. */
function SwitchRow({
  id,
  label,
  checked,
  onCheckedChange,
}: {
  id: string
  label: string
  checked: boolean
  onCheckedChange: (on: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2.5">
      <Label htmlFor={id} className="flex-1 cursor-pointer font-normal">
        {label}
      </Label>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  )
}
