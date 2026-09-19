'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { useServiceType } from '@/components/service-type-context'
import { VehicleCombobox } from '@/features/quotes/Components/VehicleCombobox'
import type { ServiceDetail } from '../../service-detail/types'
import type { InitialData } from '../../service-edit/form-types'

interface JobFactsCardProps {
  record: ServiceDetail
  initialData: InitialData
  vehicleName: string
  selectedVehicleId: string | null
  setSelectedVehicleId: (id: string) => void
  techName: string
  initialVehicle?: {
    id: string
    make: string
    model: string
    year: number
    licensePlate: string | null
  } | null
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

/** A name that leads to its own page: plain until hovered, so the card does not read as a list of links. */
const nameLink =
  'rounded-sm underline-offset-2 transition-colors hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

const factLabel = 'text-[11px] font-medium uppercase tracking-wider text-muted-foreground'

/**
 * Who the job is for and what it is on, the first thing on the overhauled
 * page. It stands in for the classic "Customer & Vehicle" panel and carries
 * the same fields that panel owns: the mileage input, the hidden technician
 * name and the vehicle picker, each still in the document exactly once.
 *
 * The customer is read here and edited on the customer's own page; a work
 * order has never been the place a phone number is changed.
 */
export function JobFactsCard({
  record,
  initialData,
  vehicleName,
  selectedVehicleId,
  setSelectedVehicleId,
  techName,
  initialVehicle,
}: JobFactsCardProps) {
  const t = useTranslations('service')
  const serviceType = useServiceType()
  const [changingVehicle, setChangingVehicle] = useState(false)

  const customer = record.customer ?? record.vehicle?.customer ?? null
  const vehicle = record.vehicle
  // The picker can point the job at another vehicle before the save; the facts
  // on this card describe the saved one, so say which is which while they differ.
  const vehicleChanged = Boolean(vehicle && selectedVehicleId && selectedVehicleId !== vehicle.id)

  return (
    <section
      data-testid="job-facts"
      className="@container rounded-lg border border-card-edge bg-card text-card-foreground shadow-[0_1px_2px_rgb(0_0_0/0.05),0_12px_32px_-16px_rgb(0_0_0/0.18)]"
    >
      <div className="grid grid-cols-1 divide-y divide-card-edge @xl:grid-cols-2 @xl:divide-x @xl:divide-y-0">
        <div className="space-y-2 px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-display text-sm font-semibold tracking-tight">
              {t('basicInfo.customer')}
            </h3>
            {customer && (
              <Link
                href={`/customers/${customer.id}`}
                className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {t('modern.openCustomer')}
              </Link>
            )}
          </div>
          {customer ? (
            <>
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                  {initials(customer.name)}
                </div>
                <div className="min-w-0">
                  <Link
                    href={`/customers/${customer.id}`}
                    className={cn(nameLink, 'block truncate text-sm font-semibold leading-tight')}
                  >
                    {customer.name}
                  </Link>
                  {customer.company && (
                    <p className="truncate text-xs text-muted-foreground">{customer.company}</p>
                  )}
                </div>
              </div>
              <dl className="grid grid-cols-1 gap-x-3 gap-y-1 @xs:grid-cols-2">
                <div className="min-w-0">
                  <dt className={factLabel}>{t('modern.phone')}</dt>
                  <dd className="truncate text-sm">
                    {customer.phone ? (
                      <a href={`tel:${customer.phone}`} className="hover:underline">
                        {customer.phone}
                      </a>
                    ) : (
                      <span className="text-muted-foreground">{t('modern.notSet')}</span>
                    )}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className={factLabel}>{t('modern.email')}</dt>
                  <dd className="truncate text-sm">
                    {customer.email ? (
                      <a href={`mailto:${customer.email}`} className="hover:underline">
                        {customer.email}
                      </a>
                    ) : (
                      <span className="text-muted-foreground">{t('modern.notSet')}</span>
                    )}
                  </dd>
                </div>
              </dl>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{t('modern.noCustomer')}</p>
          )}
        </div>

        {/* A counter sale has no vehicle and nothing to pick: the classic page
            shows the picker regardless, and choosing one there turns the sale
            into a vehicle job, so the way to do that stays. */}
        <div className="space-y-2 px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-display text-sm font-semibold tracking-tight">
              {t('basicInfo.vehicle')}
            </h3>
            <div className="flex items-center gap-3">
              {selectedVehicleId && (
                <Link
                  href={`/vehicles/${selectedVehicleId}`}
                  className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  {t('modern.serviceHistory')}
                </Link>
              )}
              {vehicle && !changingVehicle && (
                <button
                  type="button"
                  onClick={() => setChangingVehicle(true)}
                  className="cursor-pointer text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:cursor-default disabled:opacity-50"
                >
                  {t('modern.changeVehicle')}
                </button>
              )}
            </div>
          </div>

          {vehicle && (
            <div className="flex items-center gap-2.5">
              {vehicle.licensePlate && (
                <Link
                  href={`/vehicles/${vehicle.id}`}
                  className="shrink-0 rounded border-2 border-foreground px-2 py-0.5 font-mono text-sm font-medium tracking-wider transition-colors hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {vehicle.licensePlate}
                </Link>
              )}
              <div className="min-w-0">
                <Link
                  href={`/vehicles/${vehicle.id}`}
                  className={cn(nameLink, 'block truncate text-sm font-semibold leading-tight')}
                >
                  {vehicle.year} {vehicle.make} {vehicle.model}
                </Link>
                {vehicle.vin && (
                  <p className="truncate font-mono text-xs text-muted-foreground">{vehicle.vin}</p>
                )}
              </div>
            </div>
          )}

          {(!vehicle || changingVehicle) && (
            <div className="space-y-1">
              <VehicleCombobox
                value={selectedVehicleId ?? ''}
                initialVehicle={
                  initialVehicle ? { ...initialVehicle, customerId: null, customer: null } : null
                }
                placeholder={vehicleName || t('basicInfo.searchVehicles')}
                noneLabel={t('basicInfo.noVehicleFound')}
                onChange={(id) => {
                  if (id) setSelectedVehicleId(id)
                }}
              />
              {vehicleChanged && (
                <p className="text-xs text-amber-600 dark:text-amber-500">
                  {t('modern.vehicleChangesOnSave')}
                </p>
              )}
            </div>
          )}

          {selectedVehicleId && (
            <div className="flex items-center gap-2">
              <Label htmlFor="mileage" className={factLabel}>
                {serviceType === 'marine' ? t('basicInfo.mileageMarine') : t('basicInfo.mileage')}
              </Label>
              <Input
                id="mileage"
                name="mileage"
                type="number"
                placeholder="50000"
                className="h-8 w-32"
                defaultValue={initialData.mileage ?? ''}
              />
            </div>
          )}
        </div>
      </div>

      <input type="hidden" name="techName" value={techName} />
    </section>
  )
}
