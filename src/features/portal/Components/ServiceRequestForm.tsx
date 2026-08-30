'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { AppCard } from '@/components/app-card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, Plus, Wrench } from 'lucide-react'
import { createServiceRequest } from '@/features/portal/Actions/portalActions'

type Vehicle = {
  id: string
  make: string
  model: string
  year: number
  licensePlate: string | null
}

/** Sentinel for "my vehicle isn't listed" — never collides with a cuid. */
const NEW_VEHICLE = '__new__'

export function ServiceRequestForm({ orgId, vehicles }: { orgId: string; vehicles: Vehicle[] }) {
  const t = useTranslations('portal.requestService')
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  // A customer with no registered vehicles starts straight in "new vehicle"
  // mode — before this form allowed that, they were told to phone the shop.
  const [vehicleId, setVehicleId] = useState(vehicles.length === 0 ? NEW_VEHICLE : '')
  const [make, setMake] = useState('')
  const [model, setModel] = useState('')
  const [year, setYear] = useState('')
  const [plate, setPlate] = useState('')
  const [description, setDescription] = useState('')
  const [preferredDate, setPreferredDate] = useState('')

  const isNewVehicle = vehicleId === NEW_VEHICLE

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!vehicleId) {
      toast.error(t('selectVehicle'))
      return
    }
    if (isNewVehicle && (!make.trim() || !model.trim())) {
      toast.error(t('fillVehicleDetails'))
      return
    }
    if (!description.trim()) {
      toast.error(t('describeIssue'))
      return
    }

    startTransition(async () => {
      const result = await createServiceRequest({
        vehicleId: isNewVehicle ? undefined : vehicleId,
        newVehicle: isNewVehicle
          ? {
              make: make.trim(),
              model: model.trim(),
              year: year ? Number(year) : undefined,
              licensePlate: plate.trim() || undefined,
            }
          : undefined,
        description: description.trim(),
        preferredDate: preferredDate || undefined,
      })

      if (result.success) {
        toast.success(t('submitSuccess'))
        setDescription('')
        setPreferredDate('')
        setVehicleId(vehicles.length === 0 ? NEW_VEHICLE : '')
        setMake('')
        setModel('')
        setYear('')
        setPlate('')
        router.refresh()
      } else {
        toast.error(result.error ?? t('submitError'))
      }
    })
  }

  return (
    <AppCard icon={Wrench} title={t('newServiceRequest')} description={t('formDescription')}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="vehicle">{t('vehicleLabel')}</Label>
          <Select value={vehicleId} onValueChange={setVehicleId}>
            <SelectTrigger id="vehicle">
              <SelectValue placeholder={t('vehiclePlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              {vehicles.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.year} {v.make} {v.model}
                  {v.licensePlate ? ` (${v.licensePlate})` : ''}
                </SelectItem>
              ))}
              {vehicles.length > 0 && <SelectSeparator />}
              <SelectItem value={NEW_VEHICLE}>
                <span className="flex items-center gap-1.5">
                  <Plus className="h-3.5 w-3.5" />
                  {t('notListedOption')}
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isNewVehicle && (
          <div className="space-y-4 rounded-lg border border-card-edge bg-muted/30 p-4">
            <p className="text-xs text-muted-foreground">{t('newVehicleHint')}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="nv-make">{t('makeLabel')}</Label>
                <Input
                  id="nv-make"
                  value={make}
                  onChange={(e) => setMake(e.target.value)}
                  placeholder={t('makePlaceholder')}
                  maxLength={60}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nv-model">{t('modelLabel')}</Label>
                <Input
                  id="nv-model"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder={t('modelPlaceholder')}
                  maxLength={60}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nv-year">
                  {t('yearLabel')}{' '}
                  <span className="text-muted-foreground">{t('preferredDateOptional')}</span>
                </Label>
                <Input
                  id="nv-year"
                  type="number"
                  inputMode="numeric"
                  min={1900}
                  max={new Date().getFullYear() + 1}
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nv-plate">
                  {t('plateLabel')}{' '}
                  <span className="text-muted-foreground">{t('preferredDateOptional')}</span>
                </Label>
                <Input
                  id="nv-plate"
                  value={plate}
                  onChange={(e) => setPlate(e.target.value)}
                  maxLength={20}
                  className="font-mono uppercase"
                />
              </div>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="description">{t('descriptionLabel')}</Label>
          <Textarea
            id="description"
            placeholder={t('descriptionPlaceholder')}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            rows={4}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="preferred-date">
            {t('preferredDate')}{' '}
            <span className="text-muted-foreground">{t('preferredDateOptional')}</span>
          </Label>
          <Input
            id="preferred-date"
            type="date"
            value={preferredDate}
            onChange={(e) => setPreferredDate(e.target.value)}
            min={new Date().toISOString().split('T')[0]}
          />
        </div>

        <div className="flex justify-end">
          <Button type="submit" disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('submitRequest')}
          </Button>
        </div>
      </form>
    </AppCard>
  )
}
