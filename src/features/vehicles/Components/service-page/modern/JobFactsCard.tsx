'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Check, ChevronDown, Copy } from 'lucide-react'
import { useFormatCurrency } from '@/components/currency-settings-context'
import { useDateSettings } from '@/components/date-settings-context'
import { useFormatDate } from '@/lib/use-format-date'
import { inspectionDisplayDate } from '@/features/vehicles/Lib/inspectionDueInput'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { useServiceType } from '@/components/service-type-context'
import { VehicleCombobox } from '@/features/quotes/Components/VehicleCombobox'
import type { ServiceDetail } from '../../service-detail/types'
import type { InitialData } from '../../service-edit/form-types'

interface JobFactsCardProps {
  record: ServiceDetail
  currencyCode: string
  /**
   * A locked invoice. The card sits outside the page's locked fieldset so that
   * "More info" and the copy buttons keep working; it disables its own
   * editable parts (the vehicle picker and the mileage) instead.
   */
  locked?: boolean
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

/** Whether "More info" was left open, per browser. */
const INFO_OPEN_KEY = 'torqvoice:workOrderVehicleInfoOpen'

/** Stored codes and the vehicle form's words for them. Anything else is shown as stored. */
const FUEL_LABELS: Record<string, string> = {
  gasoline: 'gasoline',
  diesel: 'diesel',
  electric: 'electric',
  hybrid: 'hybrid',
  other: 'other',
  'two-stroke': 'twoStroke',
}
const TRANSMISSION_LABELS: Record<string, string> = {
  automatic: 'automatic',
  manual: 'manual',
  cvt: 'cvt',
  outboard: 'outboard',
  inboard: 'inboard',
}

/**
 * Copies one value, and says so for a moment. The VIN is the reason this
 * exists: it used to take a trip to the vehicle page and back.
 */
function useCopy(value: string) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(timer)
  }, [copied])
  const copy = () => {
    navigator.clipboard
      ?.writeText(value)
      .then(() => setCopied(true))
      .catch(() => undefined)
  }
  return { copied, copy }
}

function CopyValue({ value, label }: { value: string; label: string }) {
  const t = useTranslations('service.modern.vehicleInfo')
  const { copied, copy } = useCopy(value)
  const name = copied ? t('copied') : t('copy', { label })
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={name}
      title={name}
      className="inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
      ) : (
        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
      )}
    </button>
  )
}

/**
 * The number plate, drawn as one, and a click copies it. It used to be a
 * second link to the vehicle page, which the name beside it already is; the
 * plate is what gets typed into parts catalogues and registries.
 */
function CopyPlate({ plate, label }: { plate: string; label: string }) {
  const t = useTranslations('service.modern.vehicleInfo')
  const { copied, copy } = useCopy(plate)
  const name = copied ? t('copied') : t('copy', { label })
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={name}
      title={name}
      data-testid="copy-plate"
      className="relative shrink-0 cursor-copy rounded border-2 border-foreground px-2 py-0.5 font-mono text-sm font-medium tracking-wider transition-colors hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className={cn(copied && 'invisible')}>{plate}</span>
      {copied && (
        <span className="absolute inset-0 flex items-center justify-center gap-1 text-xs text-emerald-600">
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
          {t('copied')}
        </span>
      )}
    </button>
  )
}

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
  currencyCode,
  locked = false,
  initialData,
  vehicleName,
  selectedVehicleId,
  setSelectedVehicleId,
  techName,
  initialVehicle,
}: JobFactsCardProps) {
  const t = useTranslations('service')
  const tv = useTranslations('vehicles.form')
  const tInfo = useTranslations('service.modern.vehicleInfo')
  const tDetail = useTranslations('vehicles.detail')
  const serviceType = useServiceType()
  const isMarine = serviceType === 'marine'
  const { formatDate } = useFormatDate()
  const formatCurrency = useFormatCurrency()
  const { timezone } = useDateSettings()
  const [changingVehicle, setChangingVehicle] = useState(false)

  // Closed on the server and on the first paint, then as this browser left it:
  // localStorage is not readable before hydration.
  const [infoOpen, setInfoOpen] = useState(false)
  useEffect(() => {
    try {
      setInfoOpen(localStorage.getItem(INFO_OPEN_KEY) === 'true')
    } catch {
      // Private mode: closed, which is the default anyway.
    }
  }, [])
  const toggleInfo = () => {
    const next = !infoOpen
    setInfoOpen(next)
    try {
      localStorage.setItem(INFO_OPEN_KEY, String(next))
    } catch {
      // Not remembered this time; nothing else depends on it.
    }
  }

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
      {/* Two columns, and "More info" as a second row of the same grid: the
          line above the details runs straight across both halves whatever
          height each summary is. Narrow, each list stays under its own half
          (the order classes), and from @xl the cells fall back to their
          document order, summaries first. */}
      <div className="grid grid-cols-1 @xl:grid-cols-2">
        <div className="order-1 space-y-2 border-card-edge px-4 py-3 @xl:order-none @xl:border-r">
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
                      <span className="flex min-w-0 items-center gap-0.5">
                        <a href={`tel:${customer.phone}`} className="truncate hover:underline">
                          {customer.phone}
                        </a>
                        <CopyValue value={customer.phone} label={t('modern.phone')} />
                      </span>
                    ) : (
                      <span className="text-muted-foreground">{t('modern.notSet')}</span>
                    )}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className={factLabel}>{t('modern.email')}</dt>
                  <dd className="truncate text-sm">
                    {customer.email ? (
                      <span className="flex min-w-0 items-center gap-0.5">
                        <a href={`mailto:${customer.email}`} className="truncate hover:underline">
                          {customer.email}
                        </a>
                        <CopyValue value={customer.email} label={t('modern.email')} />
                      </span>
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
        <div className="order-3 space-y-2 border-t border-card-edge px-4 py-3 @xl:order-none @xl:border-t-0">
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
                  disabled={locked}
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
                <CopyPlate
                  plate={vehicle.licensePlate}
                  label={isMarine ? tv('licensePlateMarine') : tv('licensePlate')}
                />
              )}
              <div className="min-w-0">
                <Link
                  href={`/vehicles/${vehicle.id}`}
                  className={cn(nameLink, 'block truncate text-sm font-semibold leading-tight')}
                >
                  {vehicle.year} {vehicle.make} {vehicle.model}
                </Link>
                {vehicle.vin && (
                  <p className="flex min-w-0 items-center gap-0.5 font-mono text-xs text-muted-foreground">
                    <span className="truncate">{vehicle.vin}</span>
                    <CopyValue value={vehicle.vin} label={isMarine ? tv('vinMarine') : tv('vin')} />
                  </p>
                )}
              </div>
            </div>
          )}

          <fieldset disabled={locked} className="contents">
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
          </fieldset>
        </div>

        {infoOpen && (
          <>
            <div className="order-2 border-t border-card-edge px-4 py-3 @xl:order-none @xl:border-r">
              {customer && <CustomerDetails customer={customer} formatDate={formatDate} />}
            </div>
            <div className="order-4 border-t border-card-edge px-4 py-3 @xl:order-none">
              {vehicle && (
                <VehicleDetails
                  vehicle={vehicle}
                  isMarine={isMarine}
                  rows={{ tv, tInfo, t }}
                  formatDate={formatDate}
                  formatCurrency={(amount) => formatCurrency(amount, currencyCode)}
                  timeZone={timezone}
                  notRegisteredLabel={tDetail('notRegistered')}
                />
              )}
            </div>
          </>
        )}
      </div>

      {/* One switch for both halves: the customer and the car are read
          together, and the two lists line up under their own heading. */}
      {(customer || vehicle) && (
        <button
          type="button"
          onClick={toggleInfo}
          aria-expanded={infoOpen}
          aria-controls="customer-details vehicle-details"
          className="flex w-full cursor-pointer items-center justify-center gap-1 border-t border-card-edge py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
        >
          {infoOpen ? tInfo('less') : tInfo('more')}
          <ChevronDown
            className={cn('h-3.5 w-3.5 transition-transform', infoOpen && 'rotate-180')}
            aria-hidden="true"
          />
        </button>
      )}

      <input type="hidden" name="techName" value={techName} />
    </section>
  )
}

type Vehicle = NonNullable<ServiceDetail['vehicle']>
type Translate = (key: string, values?: Record<string, string | number>) => string

/**
 * Everything the vehicle page knows about the car, readable (and copyable)
 * without leaving the job. Fields the vehicle does not have are left out
 * rather than listed as empty.
 */
function VehicleDetails({
  vehicle,
  isMarine,
  rows: { tv, tInfo, t },
  formatDate,
  formatCurrency,
  timeZone,
  notRegisteredLabel,
}: {
  vehicle: Vehicle
  isMarine: boolean
  rows: { tv: Translate; tInfo: Translate; t: Translate }
  formatDate: (date: Date | string) => string
  formatCurrency: (amount: number) => string
  timeZone: string
  notRegisteredLabel: string
}) {
  const inspection = vehicle.inspectionStatus
  const dueAt = inspection?.dueAt
    ? inspectionDisplayDate(inspection.dueAt, inspection.source, timeZone)
    : null
  const lastAt = inspection?.lastAt
    ? inspectionDisplayDate(inspection.lastAt, inspection.source, timeZone)
    : null
  const daysLeft = dueAt ? (dueAt.getTime() - Date.now()) / 86_400_000 : null
  const dueTone =
    daysLeft === null
      ? undefined
      : daysLeft < 0
        ? 'text-destructive'
        : daysLeft < 30
          ? 'text-amber-700 dark:text-amber-400'
          : undefined

  const fuel = vehicle.fuelType
    ? FUEL_LABELS[vehicle.fuelType]
      ? tv(FUEL_LABELS[vehicle.fuelType])
      : vehicle.fuelType
    : null
  const transmission = vehicle.transmission
    ? TRANSMISSION_LABELS[vehicle.transmission]
      ? tv(TRANSMISSION_LABELS[vehicle.transmission])
      : vehicle.transmission
    : null

  const rows: {
    key: string
    label: string
    value: string | null
    copy?: boolean
    tone?: string
  }[] = [
    { key: 'vin', label: isMarine ? tv('vinMarine') : tv('vin'), value: vehicle.vin, copy: true },
    {
      key: 'plate',
      label: isMarine ? tv('licensePlateMarine') : tv('licensePlate'),
      value: vehicle.licensePlate,
      copy: true,
    },
    {
      key: 'vehicle',
      label: t('basicInfo.vehicle'),
      value: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
      copy: true,
    },
    { key: 'color', label: tv('color'), value: vehicle.color ?? null },
    { key: 'engineCode', label: tv('engineCode'), value: vehicle.engineCode ?? null, copy: true },
    {
      key: 'engineSize',
      label: isMarine ? tv('engineSizeMarine') : tv('engineSize'),
      value: vehicle.engineSize ?? null,
    },
    { key: 'fuel', label: tv('fuelType'), value: fuel },
    {
      key: 'transmission',
      label: isMarine ? tv('transmissionMarine') : tv('transmission'),
      value: transmission,
    },
    {
      key: 'inspectionDue',
      label: tv('inspectionDue'),
      value: dueAt
        ? daysLeft !== null && daysLeft < 0
          ? `${formatDate(dueAt)} (${tInfo('overdue')})`
          : formatDate(dueAt)
        : null,
      tone: dueTone,
    },
    {
      key: 'inspectionLast',
      label: tInfo('lastInspection'),
      value: lastAt ? formatDate(lastAt) : null,
    },
    {
      key: 'purchaseDate',
      label: tInfo('purchaseDate'),
      value: vehicle.purchaseDate ? formatDate(vehicle.purchaseDate) : null,
    },
    {
      key: 'purchasePrice',
      label: tInfo('purchasePrice'),
      value: vehicle.purchasePrice ? formatCurrency(vehicle.purchasePrice) : null,
    },
  ]

  return (
    <div id="vehicle-details" data-testid="vehicle-details">
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-1">
        {rows
          .filter((row) => row.value)
          .map((row) => (
            <div key={row.key} className="contents" data-testid={`vehicle-detail-${row.key}`}>
              <dt className={factLabel}>{row.label}</dt>
              <dd className={cn('flex min-w-0 items-center gap-0.5 text-sm', row.tone)}>
                <span className={cn('truncate', row.copy && 'font-mono text-[13px]')}>
                  {row.value}
                </span>
                {row.copy && row.value && <CopyValue value={row.value} label={row.label} />}
              </dd>
            </div>
          ))}
      </dl>
      {inspection?.registered === false && (
        <p className="mt-1 text-xs font-medium text-destructive">{notRegisteredLabel}</p>
      )}
    </div>
  )
}

type Customer = NonNullable<ServiceDetail['customer']>

/**
 * What the customer page would otherwise be opened for mid-job: the number
 * the customer quotes on the phone, the address and VAT number for a company
 * invoice, whether they are taken off campaigns, and the workshop's notes.
 */
function CustomerDetails({
  customer,
  formatDate,
}: {
  customer: Customer
  formatDate: (date: Date | string) => string
}) {
  const t = useTranslations('service.modern.vehicleInfo')
  const tForm = useTranslations('customers.form')
  const tDetail = useTranslations('customers.detail')
  const tCommon = useTranslations('common.form')

  const rows: {
    key: string
    label: string
    value: string | null
    copy?: boolean
    multiline?: boolean
  }[] = [
    {
      key: 'number',
      label: tForm('customerNumber'),
      value: customer.customerNumber ?? null,
      copy: true,
    },
    {
      key: 'address',
      label: tCommon('address'),
      value: customer.address ?? null,
      copy: true,
      multiline: true,
    },
    { key: 'taxId', label: tDetail('taxIdLabel'), value: customer.taxId ?? null, copy: true },
    {
      key: 'since',
      label: t('customerSince'),
      value: customer.createdAt ? formatDate(customer.createdAt) : null,
    },
    { key: 'notes', label: tCommon('notes'), value: customer.notes ?? null, multiline: true },
  ]

  const badges = [
    customer.taxExempt ? tDetail('taxExemptBadge') : null,
    customer.reminderOptOut ? tForm('reminderOptOut') : null,
  ].filter((badge): badge is string => Boolean(badge))

  return (
    <div id="customer-details" data-testid="customer-details">
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-4 gap-y-1">
        {rows
          .filter((row) => row.value?.trim())
          .map((row) => (
            <div key={row.key} className="contents" data-testid={`customer-detail-${row.key}`}>
              <dt className={cn(factLabel, 'pt-1')}>{row.label}</dt>
              <dd className="flex min-w-0 items-start gap-0.5 text-sm">
                <span
                  className={cn(
                    'min-w-0 pt-0.5',
                    row.multiline ? 'line-clamp-4 whitespace-pre-line break-words' : 'truncate'
                  )}
                >
                  {row.value}
                </span>
                {row.copy && row.value && <CopyValue value={row.value} label={row.label} />}
              </dd>
            </div>
          ))}
      </dl>
      {badges.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {badges.map((badge) => (
            <span
              key={badge}
              className="rounded-md border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400"
            >
              {badge}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
