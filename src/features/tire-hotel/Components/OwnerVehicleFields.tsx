'use client'

import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { CustomerCombobox } from '@/features/quotes/Components/CustomerCombobox'
import { X } from 'lucide-react'

export type VehicleOption = {
  id: string
  make: string
  model: string
  year: number
  licensePlate: string | null
  customerId: string | null
  /** The owner, so the form can show who the vehicle decided on. */
  customer?: { id: string; name: string } | null
}

/**
 * Whose tires these are, and which car they came off.
 *
 * One pair of fields with one rule: a car has an owner, so once a vehicle is
 * chosen the customer is read from it rather than asked for. Leaving the
 * customer editable there lets somebody file one owner's tires against
 * another owner's vehicle, and nothing downstream would ever catch it.
 *
 * The exception is a vehicle with nobody on file. Naming a customer there is
 * how that pairing gets made, so the picker stays.
 *
 * Shared by check-in and by editing a set because they ask the same question.
 * Two copies of this rule would drift, and the copy that drifts is the one
 * nobody remembers to fix.
 */
export function OwnerVehicleFields({
  vehicles,
  customerId,
  onCustomerChange,
  vehicleId,
  onVehicleChange,
  initialCustomer,
  onPairChanged,
  idPrefix,
}: {
  vehicles: VehicleOption[]
  customerId: string
  onCustomerChange: (id: string) => void
  vehicleId: string
  onVehicleChange: (id: string) => void
  /** Seeds the combobox label when editing something already saved. */
  initialCustomer?: { id: string; name: string; company: string | null } | null
  /** Called whenever the pair changes, for state that hangs off it. */
  onPairChanged?: () => void
  idPrefix: string
}) {
  const t = useTranslations('tireHotel')

  // Naming the customer narrows the vehicle list to theirs. Without a
  // customer the full list stays available, so staff can start from the plate.
  const visibleVehicles = customerId
    ? vehicles.filter((v) => v.customerId === customerId)
    : vehicles

  const selectedVehicle = vehicles.find((v) => v.id === vehicleId) ?? null
  const ownerFromVehicle = selectedVehicle?.customerId ? selectedVehicle : null

  const handleVehicle = (id: string) => {
    onVehicleChange(id)
    onPairChanged?.()
    const vehicle = vehicles.find((v) => v.id === id)
    // Overwrites rather than filling a blank: whoever was named before, this
    // car's owner is the answer now.
    if (vehicle?.customerId) onCustomerChange(vehicle.customerId)
  }

  /** Hands the question back, for a set that came in on the wrong car. */
  const clearVehicle = () => {
    onVehicleChange('')
    onCustomerChange('')
    onPairChanged?.()
  }

  // Only reachable while no owned vehicle is chosen, since the picker is not
  // offered then.
  const handleCustomer = (id: string) => {
    onCustomerChange(id)
    onPairChanged?.()
    if (id && selectedVehicle?.customerId && selectedVehicle.customerId !== id) {
      onVehicleChange('')
    }
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}Customer`}>{t('checkIn.customer')}</Label>
        {ownerFromVehicle ? (
          <>
            <div
              id={`${idPrefix}Customer`}
              className="flex h-9 items-center rounded-md border bg-muted/40 px-3 text-sm"
            >
              <span className="truncate">
                {ownerFromVehicle.customer?.name ?? t('checkIn.vehicleOwner')}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">{t('checkIn.ownerFromVehicle')}</p>
          </>
        ) : (
          <CustomerCombobox
            value={customerId}
            initialCustomer={initialCustomer ?? undefined}
            onChange={handleCustomer}
            placeholder={t('checkIn.selectCustomer')}
            noneLabel={t('checkIn.noCustomer')}
          />
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}Vehicle`}>{t('checkIn.vehicle')}</Label>
        <div className="flex items-center gap-1.5">
          <Select
            value={vehicleId}
            onValueChange={handleVehicle}
            disabled={visibleVehicles.length === 0}
          >
            <SelectTrigger id={`${idPrefix}Vehicle`} className="min-w-0 flex-1">
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
          {/* The way back to another customer, since choosing a car narrows
              the list to that customer's cars. */}
          {vehicleId && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 w-9 shrink-0 p-0"
              onClick={clearVehicle}
              aria-label={t('checkIn.clearVehicle')}
              title={t('checkIn.clearVehicle')}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
        {customerId && visibleVehicles.length === 0 && (
          <p className="text-xs text-muted-foreground">{t('checkIn.noVehiclesForCustomer')}</p>
        )}
      </div>
    </div>
  )
}
