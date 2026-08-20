'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { useFormatDate } from '@/lib/use-format-date'
import { AppCard } from '@/components/app-card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useConfirm } from '@/components/confirm-dialog'
import { CheckOutDialog } from '@/features/tire-hotel/Components/CheckOutDialog'
import { EditTireSetDialog } from '@/features/tire-hotel/Components/EditTireSetDialog'
import { RelocateDialog } from '@/features/tire-hotel/Components/RelocateDialog'
import { TreatmentCard, type TreatmentRow } from '@/features/tire-hotel/Components/TreatmentCard'
import { MessageCustomerDialog } from '@/features/tire-hotel/Components/MessageCustomerDialog'
import { NewTireJobDialog } from '@/features/tire-hotel/Components/NewTireJobDialog'
import { PrintLabelsDialog } from '@/features/tire-hotel/Components/PrintLabelsDialog'
import { TireJobsCard, type TireJobs } from '@/features/tire-hotel/Components/TireJobsCard'
import { reasonForCondition } from '@/features/tire-hotel/Lib/messageTemplates'
import { deleteTireSet, disposeTireSet } from '@/features/tire-hotel/Actions/tireSetActions'
import { groupRounds, wearSummary, seasonsLeft } from '@/features/tire-hotel/Lib/wear'
import { SettingsLink } from '@/features/tire-hotel/Components/SettingsLink'
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
import {
  ArrowRightLeft,
  Car,
  Disc3,
  Loader2,
  LogOut,
  MessageSquare,
  MapPin,
  Pencil,
  Ban,
  Printer,
  Trash2,
  TriangleAlert,
  User,
  Warehouse,
} from 'lucide-react'

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
  treatments: TreatmentRow[]
}

/**
 * One stored set: what it is, where it sits, how it has worn, and everywhere
 * it has been. The measurement history is grouped by round so a season's wear
 * reads as two columns rather than eight loose numbers.
 */
export function TireSetClient({
  set,
  locations,
  vehicles,
  jobs,
  billing,
  imperial,
  thresholds,
  canEditSettings,
}: {
  set: TireSet
  locations: PickerLocation[]
  jobs: TireJobs
  billing: {
    seasonalPrice: number
    currency: string
  }
  /** The workshop's own replacement limits, which decide the projection. */
  thresholds: { summerReplace: number; winterReplace: number }
  /** Whether to offer a way into the settings behind these numbers. */
  canEditSettings: boolean
  vehicles: {
    id: string
    make: string
    model: string
    year: number
    licensePlate: string | null
    customerId: string | null
  }[]
  imperial: boolean
}) {
  const t = useTranslations('tireHotel')
  const router = useRouter()
  const confirm = useConfirm()
  const { formatDate } = useFormatDate()
  const [showCheckOut, setShowCheckOut] = useState(false)
  const [showRelocate, setShowRelocate] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [showMessage, setShowMessage] = useState(false)
  const [jobMode, setJobMode] = useState<'quote' | 'workOrder' | null>(null)
  const [showLabels, setShowLabels] = useState(false)

  // Arriving straight from check-in, with the tires still in hand.
  const searchParams = useSearchParams()
  const pathname = usePathname()
  useEffect(() => {
    if (searchParams.get('print') !== '1') return
    setShowLabels(true)
    // Consumed, and taken back out of the URL. Left there it fires again on
    // every refresh, so writing a set off or editing it would pop the label
    // dialog back up over the thing you just did.
    const rest = new URLSearchParams(searchParams.toString())
    rest.delete('print')
    const query = rest.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }, [searchParams, pathname, router])
  const [deleting, setDeleting] = useState(false)
  const [disposing, setDisposing] = useState(false)

  // Deleting is only offered once the set is off the shelf: the action
  // refuses a stored set, so the shelf count can never drift from reality.
  const handleDelete = async () => {
    const ok = await confirm({
      title: t('detail.deleteTitle'),
      description: t('detail.deleteBody'),
      confirmLabel: t('common.delete'),
      destructive: true,
    })
    if (!ok) return
    setDeleting(true)
    const result = await deleteTireSet(set.id)
    setDeleting(false)
    if (!result.success) {
      toast.error(result.error ?? t('detail.deleteFailed'))
      return
    }
    toast.success(t('detail.deleted'))
    router.push('/tire-hotel')
  }

  /**
   * Writing a set off, when the customer has bought new tires.
   *
   * Kept rather than deleted: the history and any invoice pointing at it are
   * worth having. What stops is being offered as "the same tires again" next
   * season, which is the point, since the wear on this record belongs to
   * rubber that is now in a skip.
   */
  const handleDispose = async () => {
    const ok = await confirm({
      title: t('detail.disposeTitle'),
      description: t('detail.disposeBody'),
      confirmLabel: t('detail.dispose'),
      destructive: true,
    })
    if (!ok) return
    setDisposing(true)
    const result = await disposeTireSet({ id: set.id })
    setDisposing(false)
    if (!result.success) {
      toast.error(result.error ?? t('detail.disposeFailed'))
      return
    }
    toast.success(t('detail.disposed'))
    router.refresh()
  }

  const isStored = set.status === 'stored'
  const isDisposed = set.status === 'disposed'
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

  const lowPositions = latest.filter((m) => m.condition === 'replace')
  const worstTread = latest.reduce<number | null>(
    (lowest, m) =>
      m.treadDepthMm == null
        ? lowest
        : lowest == null
          ? m.treadDepthMm
          : Math.min(lowest, m.treadDepthMm),
    null
  )
  const messageVariables = {
    customer_name: set.customer?.name ?? '',
    vehicle: set.vehicle ? `${set.vehicle.make} ${set.vehicle.model}` : '',
    plate: set.vehicle?.licensePlate ?? '',
    season: t(`seasons.${set.season}`).toLowerCase(),
    size: set.size ?? '',
    tread: formatTread(worstTread),
    positions: (lowPositions.length > 0 ? lowPositions : latest)
      .map((m) => t(`positions.${m.position}`).toLowerCase())
      .join(', '),
    shelf: set.location?.code ?? '',
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

        <div className="flex flex-wrap gap-2">
          {/* Nothing to stick a label on once the set is in a skip. */}
          {!isDisposed && (
            <Button variant="outline" size="sm" onClick={() => setShowLabels(true)}>
              <Printer className="mr-1.5 h-3.5 w-3.5" />
              {t('label.action')}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setShowEdit(true)}>
            <Pencil className="mr-1.5 h-3.5 w-3.5" />
            {t('common.edit')}
          </Button>
          {/* Writing off is rare but applies whether the tires are on a shelf
              or already back on the car: a set condemned at check-in should
              not need a fake check-out first. */}
          {!isDisposed && (
            <Button variant="outline" size="sm" onClick={handleDispose} disabled={disposing}>
              {disposing ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Ban className="mr-1.5 h-3.5 w-3.5" />
              )}
              {t('detail.dispose')}
            </Button>
          )}
          {isStored ? (
            <>
              <Button variant="outline" size="sm" onClick={() => setShowRelocate(true)}>
                <ArrowRightLeft className="mr-1.5 h-3.5 w-3.5" />
                {t('detail.move')}
              </Button>
              <Button size="sm" onClick={() => setShowCheckOut(true)}>
                <LogOut className="mr-1.5 h-3.5 w-3.5" />
                {t('detail.checkOut')}
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={handleDelete}
              disabled={deleting}
              className="text-destructive hover:text-destructive"
            >
              {deleting ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              )}
              {t('common.delete')}
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {/* Prep work leads: the tire department opens this page to find out
              what is left to do, and everything else is reference. */}
          <TreatmentCard
            tireSetId={set.id}
            treatments={set.treatments}
            withRims={set.withRims}
            hasTpms={set.hasTpms}
            canEditSettings={canEditSettings}
          />

          {/* Then condition: it is what a customer asks about. */}
          <AppCard
            icon={Disc3}
            title={t('detail.conditionTitle')}
            // Bare content: the slot supplies its own pill.
            badge={grade ? t(`conditions.${grade}`) : undefined}
            action={
              set.customer && (
                <Button
                  size="sm"
                  variant={grade === 'replace' ? 'default' : 'ghost'}
                  className="h-8"
                  onClick={() => setShowMessage(true)}
                >
                  <MessageSquare className="mr-1.5 h-3.5 w-3.5" />
                  {t('messaging.action')}
                </Button>
              )
            }
            contentClassName="space-y-4"
          >
            {/* A worn set going back on a car is worth a word, and this is
                the moment the shop can act on it. */}
            {grade === 'replace' && (
              <div className="flex gap-2.5 rounded-lg border border-red-500/30 bg-red-500/5 p-3">
                <TriangleAlert className="h-4 w-4 shrink-0 text-red-600" />
                <p className="min-w-0 text-sm">
                  <span className="font-medium text-red-700 dark:text-red-500">
                    {t('detail.belowLimit', { count: lowPositions.length })}
                  </span>{' '}
                  <span className="text-muted-foreground">{t('detail.belowLimitHint')}</span>{' '}
                  {/* Which limit is a setting, and this warning is where a
                      shop finds out theirs is set to somebody else's rules. */}
                  <SettingsLink can={canEditSettings} labelKey="settings.treadLimits" />
                </p>
              </div>
            )}

            {set.measurements.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('detail.noMeasurements')}</p>
            ) : (
              <MeasurementHistory
                measurements={set.measurements}
                formatTread={formatTread}
                formatPressure={formatPressure}
                formatDate={formatDate}
                replaceLimitMm={
                  set.season === 'winter' ? thresholds.winterReplace : thresholds.summerReplace
                }
              />
            )}
          </AppCard>

          <TireJobsCard
            tireSetId={set.id}
            jobs={jobs}
            hasVehicle={!!set.vehicle}
            hasCustomer={!!set.customer}
            currencyCode={billing.currency}
            onCreate={setJobMode}
          />

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
        thresholds={{ ...thresholds, warnMargin: 1 }}
        open={showCheckOut}
        onOpenChange={setShowCheckOut}
        tireSetId={set.id}
        reference={set.reference}
        locationCode={set.location?.code ?? null}
        season={set.season}
        imperial={imperial}
        treatments={set.treatments}
        latestMeasurements={latest}
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

      {jobMode && (
        <NewTireJobDialog
          open
          onOpenChange={(open) => !open && setJobMode(null)}
          tireSetId={set.id}
          mode={jobMode}
          hasVehicle={!!set.vehicle}
          currencyCode={billing.currency}
          defaultStoragePrice={billing.seasonalPrice}
          canEditSettings={canEditSettings}
        />
      )}

      <PrintLabelsDialog
        open={showLabels}
        onOpenChange={setShowLabels}
        tireSetId={set.id}
        quantity={set.quantity}
      />

      <MessageCustomerDialog
        open={showMessage}
        onOpenChange={setShowMessage}
        tireSetId={set.id}
        reason={reasonForCondition(grade)}
        variables={messageVariables}
      />

      <EditTireSetDialog open={showEdit} onOpenChange={setShowEdit} set={set} vehicles={vehicles} />
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
  replaceLimitMm,
}: {
  measurements: Measurement[]
  formatTread: (mm: number | null) => string
  formatPressure: (bar: number | null) => string | null
  formatDate: (d: Date) => string
  /** The workshop's own replacement threshold for this set's season. */
  replaceLimitMm: number
}) {
  const t = useTranslations('tireHotel')

  const rounds = groupRounds(measurements)
  const summary = wearSummary(rounds)
  const projection = seasonsLeft(rounds, replaceLimitMm)
  const remaining = projection ? projection.seasons : null

  return (
    <div className="space-y-4">
      {/* What the shop is uniquely able to tell this customer: nobody else has
          held the same four tires across seasons with a gauge in hand. */}
      {summary && (
        <div className="rounded-lg border bg-muted/40 px-3 py-2">
          <p className="text-sm">
            {t('wear.summary', {
              value: formatTread(summary.mm),
              from: formatDate(summary.from),
              to: formatDate(summary.to),
            })}
          </p>
          <p className="text-xs text-muted-foreground">
            {t('wear.perSeason', { value: formatTread(summary.perSeason) })}
            {remaining !== null && <span> · {t('wear.seasonsLeft', { count: remaining })}</span>}
          </p>
        </div>
      )}

      {rounds.map((round) => {
        const rows = round.rows
        return (
          <div key={round.key}>
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                {formatDate(round.at)}
              </span>
              {rows[0].measuredBy && (
                <span className="text-xs text-muted-foreground">{rows[0].measuredBy.name}</span>
              )}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {rows.map((m) => {
                const pressure = formatPressure(m.pressureBar)
                const worn = round.worn[m.position]
                return (
                  <div key={m.id} className="flex items-center gap-2 rounded-lg border p-2">
                    <span className="w-20 shrink-0 text-xs text-muted-foreground">
                      {t(`positions.${m.position}`)}
                    </span>
                    <span className="flex-1 text-sm tabular-nums">
                      {formatTread(m.treadDepthMm)}
                      {/* The change since the visit before, which is the part a
                        customer actually reacts to. */}
                      {typeof worn === 'number' && worn > 0 && (
                        <span className="ml-2 text-xs text-amber-600">
                          {t('wear.since', { value: formatTread(worn) })}
                        </span>
                      )}
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
        )
      })}
    </div>
  )
}
