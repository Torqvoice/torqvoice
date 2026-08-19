'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useFormatDate } from '@/lib/use-format-date'
import { AppCard } from '@/components/app-card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { CheckOutDialog } from '@/features/tire-hotel/Components/CheckOutDialog'
import { RelocateDialog } from '@/features/tire-hotel/Components/RelocateDialog'
import type { PickerLocation } from '@/features/tire-hotel/Components/LocationPicker'
import {
  CONDITION_TOKENS,
  STATUS_TOKENS,
  barToPsi,
  mmToThirtySeconds,
  worstCondition,
  type TireCondition,
  type TireSetStatus,
} from '@/features/tire-hotel/Lib/tireConstants'
import { cn } from '@/lib/utils'
import { ArrowRightLeft, Car, Disc3, LogOut, MapPin, User, Warehouse } from 'lucide-react'

type Measurement = {
  id: string
  position: string
  treadDepthMm: number | null
  pressureBar: number | null
  condition: string
  damage: string | null
  notes: string | null
  measuredAt: Date
  measuredBy: { id: string; name: string } | null
}

type Movement = {
  id: string
  type: string
  fromCode: string | null
  toCode: string | null
  note: string | null
  createdAt: Date
  performedBy: { id: string; name: string } | null
}

type TireSet = {
  id: string
  reference: string | null
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
  status: string
  notes: string | null
  checkedInAt: Date | null
  checkedOutAt: Date | null
  location: { id: string; code: string; warehouse: { id: string; name: string } } | null
  vehicle: {
    id: string
    make: string
    model: string
    year: number
    licensePlate: string | null
  } | null
  customer: { id: string; name: string; phone: string | null; email: string | null } | null
  measurements: Measurement[]
  movements: Movement[]
}

/**
 * One stored set: what it is, where it sits, how it has worn, and everywhere
 * it has been. The measurement history is grouped by round so a season's wear
 * reads as two columns rather than eight loose numbers.
 */
export function TireSetClient({
  set,
  locations,
  imperial,
}: {
  set: TireSet
  locations: PickerLocation[]
  imperial: boolean
}) {
  const t = useTranslations('tireHotel')
  const { formatDate } = useFormatDate()
  const [showCheckOut, setShowCheckOut] = useState(false)
  const [showRelocate, setShowRelocate] = useState(false)

  const isStored = set.status === 'stored'
  const latestRound = set.measurements.length > 0 ? set.measurements[0].measuredAt : null
  const latest = set.measurements.filter(
    (m) => latestRound && m.measuredAt.getTime() === latestRound.getTime()
  )
  const grade = latest.length > 0 ? worstCondition(latest.map((m) => m.condition)) : null

  const formatTread = (mm: number | null) => {
    if (mm == null) return '-'
    return imperial ? `${mmToThirtySeconds(mm).toFixed(1)}/32"` : `${mm.toFixed(1)} mm`
  }
  const formatPressure = (bar: number | null) => {
    if (bar == null) return null
    return imperial ? `${barToPsi(bar).toFixed(0)} psi` : `${bar.toFixed(1)} bar`
  }

  const title = set.vehicle
    ? `${set.vehicle.year} ${set.vehicle.make} ${set.vehicle.model}`
    : (set.customer?.name ?? t('list.unassigned'))

  return (
    <div className="space-y-4">
      {/* Header: identity, state and the two actions that change either. */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold">{title}</h1>
            <Badge
              variant="outline"
              className={cn('text-xs', STATUS_TOKENS[set.status as TireSetStatus])}
            >
              {t(`statuses.${set.status}`)}
            </Badge>
            {set.reference && (
              <span className="font-mono text-xs text-muted-foreground">#{set.reference}</span>
            )}
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {t(`seasons.${set.season}`)}
            {set.studded ? ` · ${t('list.studded')}` : ''}
            {set.size ? ` · ${set.size}` : ''}
            {` · ${t('list.tireCount', { count: set.quantity })}`}
          </p>
        </div>

        {isStored && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowRelocate(true)}>
              <ArrowRightLeft className="mr-1.5 h-3.5 w-3.5" />
              {t('detail.move')}
            </Button>
            <Button size="sm" onClick={() => setShowCheckOut(true)}>
              <LogOut className="mr-1.5 h-3.5 w-3.5" />
              {t('detail.checkOut')}
            </Button>
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {/* Latest condition first: it is what a customer asks about. */}
          <AppCard
            icon={Disc3}
            title={t('detail.conditionTitle')}
            badge={
              grade ? (
                <Badge variant="outline" className={cn('text-xs', CONDITION_TOKENS[grade].badge)}>
                  {t(`conditions.${grade}`)}
                </Badge>
              ) : undefined
            }
            contentClassName="space-y-4"
          >
            {set.measurements.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('detail.noMeasurements')}</p>
            ) : (
              <MeasurementHistory
                measurements={set.measurements}
                formatTread={formatTread}
                formatPressure={formatPressure}
                formatDate={formatDate}
              />
            )}
          </AppCard>

          <AppCard icon={MapPin} title={t('detail.historyTitle')} contentClassName="space-y-0 p-0">
            <ul className="divide-y">
              {set.movements.map((movement) => (
                <li key={movement.id} className="flex items-start gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{t(`movements.${movement.type}`)}</p>
                    <p className="text-xs text-muted-foreground">
                      {movement.type === 'relocate' && movement.fromCode
                        ? `${movement.fromCode} → ${movement.toCode ?? '-'}`
                        : (movement.toCode ?? movement.fromCode ?? '')}
                      {movement.performedBy ? ` · ${movement.performedBy.name}` : ''}
                    </p>
                    {movement.note && (
                      <p className="mt-1 text-xs text-muted-foreground">{movement.note}</p>
                    )}
                  </div>
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">
                    {formatDate(new Date(movement.createdAt))}
                  </span>
                </li>
              ))}
            </ul>
          </AppCard>
        </div>

        <div className="space-y-4">
          <AppCard icon={Warehouse} title={t('detail.storageTitle')} contentClassName="space-y-3">
            {set.location ? (
              <>
                <Field label={t('detail.shelf')}>
                  <span className="font-mono">{set.location.code}</span>
                </Field>
                <Field label={t('detail.warehouse')}>{set.location.warehouse.name}</Field>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">{t('detail.notStored')}</p>
            )}
            {set.checkedInAt && (
              <Field label={t('detail.checkedIn')}>{formatDate(new Date(set.checkedInAt))}</Field>
            )}
            {set.checkedOutAt && (
              <Field label={t('detail.checkedOut')}>{formatDate(new Date(set.checkedOutAt))}</Field>
            )}
          </AppCard>

          <AppCard icon={Disc3} title={t('detail.tiresTitle')} contentClassName="space-y-3">
            {set.brand && <Field label={t('checkIn.brand')}>{set.brand}</Field>}
            {set.model && <Field label={t('checkIn.model')}>{set.model}</Field>}
            {set.size && (
              <Field label={t('checkIn.size')}>
                <span className="font-mono">{set.size}</span>
              </Field>
            )}
            {set.dotCode && (
              <Field label={t('checkIn.dotCode')}>
                <span className="font-mono">{set.dotCode}</span>
              </Field>
            )}
            {set.loadSpeedIndex && (
              <Field label={t('detail.loadSpeed')}>{set.loadSpeedIndex}</Field>
            )}
            <Separator />
            <div className="flex flex-wrap gap-1.5">
              {set.withRims && <Badge variant="secondary">{t('checkIn.withRims')}</Badge>}
              {set.hasTpms && <Badge variant="secondary">{t('checkIn.hasTpms')}</Badge>}
              {set.studded && <Badge variant="secondary">{t('checkIn.studded')}</Badge>}
            </div>
            {set.notes && (
              <>
                <Separator />
                <p className="text-sm text-muted-foreground">{set.notes}</p>
              </>
            )}
          </AppCard>

          {(set.customer || set.vehicle) && (
            <AppCard icon={User} title={t('detail.ownerTitle')} contentClassName="space-y-3">
              {set.customer && (
                <Field label={t('checkIn.customer')}>
                  <Link
                    href={`/customers/${set.customer.id}`}
                    className="text-primary hover:underline"
                  >
                    {set.customer.name}
                  </Link>
                </Field>
              )}
              {set.customer?.phone && (
                <Field label={t('detail.phone')}>
                  <a href={`tel:${set.customer.phone}`} className="text-primary hover:underline">
                    {set.customer.phone}
                  </a>
                </Field>
              )}
              {set.vehicle && (
                <Field label={t('checkIn.vehicle')}>
                  <Link
                    href={`/vehicles/${set.vehicle.id}`}
                    className="flex items-center gap-1.5 text-primary hover:underline"
                  >
                    <Car className="h-3.5 w-3.5" />
                    {set.vehicle.licensePlate ?? `${set.vehicle.make} ${set.vehicle.model}`}
                  </Link>
                </Field>
              )}
            </AppCard>
          )}
        </div>
      </div>

      <CheckOutDialog
        open={showCheckOut}
        onOpenChange={setShowCheckOut}
        tireSetId={set.id}
        reference={set.reference}
        locationCode={set.location?.code ?? null}
        season={set.season}
        imperial={imperial}
      />

      <RelocateDialog
        open={showRelocate}
        onOpenChange={setShowRelocate}
        tireSetId={set.id}
        reference={set.reference}
        quantity={set.quantity}
        currentLocationId={set.location?.id ?? null}
        locations={locations}
      />
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-right">{children}</span>
    </div>
  )
}

/**
 * Readings grouped into the rounds they were taken in, newest first, so the
 * arrival and departure of one season sit side by side.
 */
function MeasurementHistory({
  measurements,
  formatTread,
  formatPressure,
  formatDate,
}: {
  measurements: Measurement[]
  formatTread: (mm: number | null) => string
  formatPressure: (bar: number | null) => string | null
  formatDate: (d: Date) => string
}) {
  const t = useTranslations('tireHotel')

  const rounds = new Map<number, Measurement[]>()
  for (const m of measurements) {
    const key = new Date(m.measuredAt).getTime()
    const list = rounds.get(key) ?? []
    list.push(m)
    rounds.set(key, list)
  }

  return (
    <div className="space-y-4">
      {[...rounds.entries()].map(([time, rows]) => (
        <div key={time}>
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              {formatDate(new Date(time))}
            </span>
            {rows[0].measuredBy && (
              <span className="text-xs text-muted-foreground">{rows[0].measuredBy.name}</span>
            )}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {rows.map((m) => {
              const pressure = formatPressure(m.pressureBar)
              return (
                <div key={m.id} className="flex items-center gap-2 rounded-lg border p-2">
                  <span className="w-20 shrink-0 text-xs text-muted-foreground">
                    {t(`positions.${m.position}`)}
                  </span>
                  <span className="flex-1 text-sm tabular-nums">
                    {formatTread(m.treadDepthMm)}
                    {pressure && (
                      <span className="ml-2 text-xs text-muted-foreground">{pressure}</span>
                    )}
                  </span>
                  <Badge
                    variant="outline"
                    className={cn(
                      'shrink-0 text-[10px]',
                      CONDITION_TOKENS[m.condition as TireCondition].badge
                    )}
                  >
                    {t(`conditions.${m.condition}`)}
                  </Badge>
                </div>
              )
            })}
          </div>
          {rows.some((m) => m.damage) && (
            <ul className="mt-2 space-y-1">
              {rows
                .filter((m) => m.damage)
                .map((m) => (
                  <li key={m.id} className="text-xs text-muted-foreground">
                    {t(`positions.${m.position}`)}: {m.damage}
                  </li>
                ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  )
}
