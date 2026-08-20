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
import { Loader2, Warehouse } from 'lucide-react'
import { CustomerCombobox } from '@/features/quotes/Components/CustomerCombobox'
import { LocationPicker, type PickerLocation } from './LocationPicker'
import { TreadEntry, type TreadRow } from './TreadEntry'
import { TreatmentPicker } from './TreatmentPicker'
import { defaultTreatments, type TreatmentType } from '../Lib/treatments'
import { checkInTireSet } from '../Actions/tireSetActions'
import { TIRE_SEASONS, TIRE_ROAD_POSITIONS, thirtySecondsToMm } from '../Lib/tireConstants'

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
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  locations: PickerLocation[]
  vehicles: VehicleOption[]
  imperial: boolean
  defaultQuantity?: number
}) {
  const router = useRouter()
  const t = useTranslations('tireHotel')
  const [saving, setSaving] = useState(false)

  const [customerId, setCustomerId] = useState('')
  const [vehicleId, setVehicleId] = useState('')
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
  }, [open, defaultQuantity])

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

    const result = await checkInTireSet({
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
      t('checkIn.success', {
        reference: result.data?.reference ?? '',
        code: result.data?.locationCode ?? '',
      })
    )
    onOpenChange(false)
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
        </DialogHeader>

        <div className="space-y-5">
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

          <Separator />

          <div className="grid gap-4 sm:grid-cols-2">
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
            <TreadEntry rows={treads} onChange={setTreads} imperial={imperial} season={season} />
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
            {t('checkIn.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
