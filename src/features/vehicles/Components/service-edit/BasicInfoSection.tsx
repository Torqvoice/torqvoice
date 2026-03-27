'use client'

import { useTranslations } from 'next-intl'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import { useServiceType } from '@/components/service-type-context'
import type { InitialData } from './form-types'
import { VehicleCombobox } from '@/features/quotes/Components/VehicleCombobox'

interface CustomerInfo {
  id: string
  name: string
  company: string | null
}

interface BasicInfoSectionProps {
  initialData: InitialData
  vehicleId: string
  vehicleName: string
  selectedVehicleId: string
  setSelectedVehicleId: (id: string) => void
  techName: string
  customer?: CustomerInfo | null
  initialVehicle?: { id: string; make: string; model: string; year: number; licensePlate: string | null } | null
}

export function BasicInfoSection({
  initialData,
  vehicleName,
  selectedVehicleId,
  setSelectedVehicleId,
  techName,
  customer,
  initialVehicle,
}: BasicInfoSectionProps) {
  const t = useTranslations('service.basicInfo')
  const serviceType = useServiceType()

  return (
    <div className="rounded-lg border p-3 space-y-3">
      <h3 className="text-sm font-semibold">{t('customerInfo')}</h3>

      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <Label className="text-xs">{t('vehicle')}</Label>
          <Link
            href={`/vehicles/${selectedVehicleId}`}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {t('open')}
            <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
        <VehicleCombobox
          value={selectedVehicleId}
          initialVehicle={initialVehicle ? { ...initialVehicle, customerId: null, customer: null } : null}
          placeholder={vehicleName || t('searchVehicles')}
          noneLabel={t('noVehicleFound')}
          onChange={(id) => {
            if (id) setSelectedVehicleId(id)
          }}
        />
      </div>

      {customer && (
        <div className="flex items-center justify-between rounded-md border px-3 py-2">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{t('customer')}</p>
            <Link
              href={`/customers/${customer.id}`}
              className="text-sm font-medium hover:underline"
            >
              {customer.name}
            </Link>
            {customer.company && (
              <p className="text-xs text-muted-foreground">{customer.company}</p>
            )}
          </div>
          <Link
            href={`/customers/${customer.id}`}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {t('open')}
            <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      )}

      <div className="space-y-1">
        <Label htmlFor="mileage" className="text-xs">{serviceType === 'boat' ? t('mileageBoat') : t('mileage')}</Label>
        <Input
          id="mileage"
          name="mileage"
          type="number"
          placeholder="50000"
          defaultValue={initialData.mileage ?? ''}
        />
      </div>

      <input type="hidden" name="techName" value={techName} />
    </div>
  )
}
