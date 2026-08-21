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
import { Loader2 } from 'lucide-react'
import { OwnerVehicleFields, type VehicleOption } from './OwnerVehicleFields'
import { TreadEntry, type TreadRow } from './TreadEntry'
import { updateTireSet } from '../Actions/tireSetActions'
import {
  TIRE_ROAD_POSITIONS,
  TIRE_SEASONS,
  mmToThirtySeconds,
  thirtySecondsToMm,
} from '../Lib/tireConstants'

export type EditableTireSet = {
  id: string
  /** The most recent readings, so a mistyped depth can be put right. */
  measurements?: { position: string; treadDepthMm: number | null; condition: string }[]
  season: string
  studded: boolean
  brand: string | null
  model: string | null
  size: string | null
  dotCode: string | null
  loadSpeedIndex: string | null
  withRims: boolean
  rimType: string | null
  hasTpms: boolean
  quantity: number
  notes: string | null
  customer: { id: string; name: string } | null
  vehicle: { id: string } | null
}

/**
 * Correcting a stored set.
 *
 * Everything recorded at check-in is editable here except where the tires
 * sit, which moves through Relocate so the shelf counts and the movement
 * history stay in step. Raising the quantity is checked against the current
 * shelf server-side, so growing a set past what its shelf holds is refused
 * rather than silently overfilling it.
 */
export function EditTireSetDialog({
  open,
  onOpenChange,
  set,
  vehicles,
  imperial = false,
  thresholds,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  set: EditableTireSet
  vehicles: VehicleOption[]
  imperial?: boolean
  /** The workshop's own limits, so a corrected reading grades correctly. */
  thresholds?: { summerReplace: number; winterReplace: number; warnMargin: number }
}) {
  const router = useRouter()
  const t = useTranslations('tireHotel')
  const [saving, setSaving] = useState(false)

  const [customerId, setCustomerId] = useState('')
  const [vehicleId, setVehicleId] = useState('')
  const [season, setSeason] = useState('summer')
  const [studded, setStudded] = useState(false)
  const [brand, setBrand] = useState('')
  const [model, setModel] = useState('')
  const [size, setSize] = useState('')
  const [dotCode, setDotCode] = useState('')
  const [loadSpeedIndex, setLoadSpeedIndex] = useState('')
  const [withRims, setWithRims] = useState(false)
  const [rimType, setRimType] = useState('')
  const [hasTpms, setHasTpms] = useState(false)
  const [quantity, setQuantity] = useState('4')
  const [notes, setNotes] = useState('')
  const [treads, setTreads] = useState<TreadRow[]>(() =>
    TIRE_ROAD_POSITIONS.map((position) => ({ position, tread: '', condition: 'good' }))
  )

  // Re-seed on every open, so a cancelled edit never leaks into the next one.
  useEffect(() => {
    if (!open) return
    setCustomerId(set.customer?.id ?? '')
    setVehicleId(set.vehicle?.id ?? '')
    setSeason(set.season)
    setStudded(set.studded)
    setBrand(set.brand ?? '')
    setModel(set.model ?? '')
    setSize(set.size ?? '')
    setDotCode(set.dotCode ?? '')
    setLoadSpeedIndex(set.loadSpeedIndex ?? '')
    setWithRims(set.withRims)
    setRimType(set.rimType ?? '')
    setHasTpms(set.hasTpms)
    setQuantity(String(set.quantity))
    setNotes(set.notes ?? '')
    // Seeded from the latest reading per position, in the workshop's unit,
    // so an edit starts from what is on file rather than from blanks.
    // Readings arrive newest first, and Map keeps the last value written for
    // a key, so the first sighting of each position is the one to keep.
    const rows = set.measurements ?? []
    const latest = new Map<string, (typeof rows)[number]>()
    for (const row of rows) {
      if (!latest.has(row.position)) latest.set(row.position, row)
    }
    setTreads(
      TIRE_ROAD_POSITIONS.map((position) => {
        const row = latest.get(position)
        const mm = row?.treadDepthMm ?? null
        return {
          position,
          tread:
            mm == null ? '' : String(Math.round((imperial ? mmToThirtySeconds(mm) : mm) * 10) / 10),
          condition: (row?.condition ?? 'good') as TreadRow['condition'],
        }
      })
    )
  }, [open, set])

  const handleSubmit = async () => {
    setSaving(true)
    const result = await updateTireSet({
      id: set.id,
      customerId: customerId || null,
      vehicleId: vehicleId || null,
      season,
      studded,
      brand,
      model,
      size,
      dotCode,
      loadSpeedIndex,
      withRims,
      rimType,
      hasTpms,
      quantity: Math.max(1, Number(quantity) || 1),
      notes,
      measurements: treads
        .filter((row) => row.tread.trim() !== '' || row.condition !== 'good')
        .map((row) => {
          const entered = Number(row.tread)
          return {
            position: row.position,
            treadDepthMm: Number.isFinite(entered)
              ? imperial
                ? Number(thirtySecondsToMm(entered).toFixed(2))
                : entered
              : null,
            condition: row.condition,
          }
        }),
    })
    setSaving(false)

    if (!result.success) {
      toast.error(result.error ?? t('edit.failed'))
      return
    }
    toast.success(t('edit.success'))
    onOpenChange(false)
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('edit.title')}</DialogTitle>
          <DialogDescription>{t('edit.description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <OwnerVehicleFields
            vehicles={vehicles}
            customerId={customerId}
            onCustomerChange={setCustomerId}
            vehicleId={vehicleId}
            onVehicleChange={setVehicleId}
            initialCustomer={set.customer ? { ...set.customer, company: null } : null}
            idPrefix="edit"
          />

          <Separator />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="editSeason">{t('checkIn.season')}</Label>
              <Select value={season} onValueChange={setSeason}>
                <SelectTrigger id="editSeason">
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
              <Label htmlFor="editQuantity">{t('checkIn.quantity')}</Label>
              <Input
                id="editQuantity"
                type="number"
                min="1"
                max="20"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">{t('edit.quantityHint')}</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="editBrand">{t('checkIn.brand')}</Label>
              <Input
                id="editBrand"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder={t('checkIn.brandPlaceholder')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editModel">{t('checkIn.model')}</Label>
              <Input id="editModel" value={model} onChange={(e) => setModel(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editSize">{t('checkIn.size')}</Label>
              <Input
                id="editSize"
                value={size}
                onChange={(e) => setSize(e.target.value)}
                placeholder={t('checkIn.sizePlaceholder')}
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editDot">{t('checkIn.dotCode')}</Label>
              <Input
                id="editDot"
                value={dotCode}
                onChange={(e) => setDotCode(e.target.value)}
                placeholder={t('checkIn.dotPlaceholder')}
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editLoadSpeed">{t('detail.loadSpeed')}</Label>
              <Input
                id="editLoadSpeed"
                value={loadSpeedIndex}
                onChange={(e) => setLoadSpeedIndex(e.target.value)}
                placeholder="94V"
              />
            </div>
            {withRims && (
              <div className="space-y-2">
                <Label htmlFor="editRimType">{t('edit.rimType')}</Label>
                <Input
                  id="editRimType"
                  value={rimType}
                  onChange={(e) => setRimType(e.target.value)}
                  placeholder={t('edit.rimTypePlaceholder')}
                />
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-6">
            <div className="flex items-center gap-2">
              <Switch id="editRims" checked={withRims} onCheckedChange={setWithRims} />
              <Label htmlFor="editRims" className="font-normal">
                {t('checkIn.withRims')}
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="editTpms" checked={hasTpms} onCheckedChange={setHasTpms} />
              <Label htmlFor="editTpms" className="font-normal">
                {t('checkIn.hasTpms')}
              </Label>
            </div>
            {season === 'winter' && (
              <div className="flex items-center gap-2">
                <Switch id="editStudded" checked={studded} onCheckedChange={setStudded} />
                <Label htmlFor="editStudded" className="font-normal">
                  {t('checkIn.studded')}
                </Label>
              </div>
            )}
          </div>

          <Separator />

          <div className="space-y-2">
            <Label>{t('checkIn.treadTitle')}</Label>
            {/* Changing a reading records a new round rather than rewriting
                the old one, so the history says when it was measured again. */}
            <p className="text-xs text-muted-foreground">{t('edit.treadHint')}</p>
            <TreadEntry
              rows={treads}
              onChange={setTreads}
              imperial={imperial}
              season={season}
              thresholds={thresholds}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="editNotes">{t('checkIn.notes')}</Label>
            <Textarea
              id="editNotes"
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
          <Button onClick={handleSubmit} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
