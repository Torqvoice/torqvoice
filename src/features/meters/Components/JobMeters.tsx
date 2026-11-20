'use client'

import { useEffect, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useFormatter, useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { setJobMeterReading } from '../Actions/jobMeterActions'
import { isLowerMeterValue, parseMeterValue } from '../Lib/meterValue'
import { ReadingQuestion } from '@/features/vehicles/Components/ReadingQuestion'
import { readingNeedsAnswer } from '@/features/vehicles/Lib/vehicleReading'
import { meterReadingKind } from '../Lib/meterAsk'
import { onRevealRequiredMeters } from '../Lib/requiredMetersReveal'
import type { JobMeterView } from '../Lib/meters.server'

/**
 * The job's reading of each of the vehicle's meters, beside the odometer.
 * Each one saves on its own when the person leaves the box, the way the
 * Reference / PO box does. A reading below the last one before this job is
 * said under the box and saved all the same. Nothing is drawn for a vehicle
 * without meters, or while meters are off.
 *
 * A meter the workshop requires carries the required mark. When the job is
 * refused for a missing reading (completing it, sending or paying its
 * invoice), the boxes named are marked and the first takes the focus, so the
 * reading is typed where the refusal was read.
 */
export function JobMeters({
  jobId,
  meters,
  locked,
  labelClassName,
}: {
  jobId: string
  meters: JobMeterView[]
  locked?: boolean
  labelClassName?: string
}) {
  if (meters.length === 0) return null
  return (
    <JobMeterList jobId={jobId} meters={meters} locked={locked} labelClassName={labelClassName} />
  )
}

function JobMeterList({
  jobId,
  meters,
  locked,
  labelClassName,
}: {
  jobId: string
  meters: JobMeterView[]
  locked?: boolean
  labelClassName?: string
}) {
  const router = useRouter()
  const box = useRef<HTMLDivElement>(null)
  // The boxes the last refusal named, and a count that moves the focus once per refusal.
  const [flagged, setFlagged] = useState<{ ids: Set<string>; turn: number }>({
    ids: new Set(),
    turn: 0,
  })
  const shown = useRef(meters)
  shown.current = meters
  useEffect(
    () =>
      onRevealRequiredMeters(jobId, (ids) => {
        setFlagged((prev) => ({ ids: new Set(ids), turn: prev.turn + 1 }))
        // A meter the page does not show yet (made required, or its item
        // picked, since the page was drawn): read the job again to draw it.
        if (ids.some((id) => !shown.current.some((m) => m.vehicleMeterId === id))) router.refresh()
      }),
    [jobId, router]
  )
  // The focus moves once per refusal: to the first box it named, as soon as
  // that box is drawn (after the refresh above, for one not shown yet).
  const focusedTurn = useRef(0)
  useEffect(() => {
    if (flagged.turn === focusedTurn.current) return
    const first = box.current?.querySelector<HTMLInputElement>('input[aria-invalid="true"]')
    if (!first) return
    focusedTurn.current = flagged.turn
    first.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
    first.focus({ preventScroll: true })
  }, [flagged, meters])

  return (
    <div className="space-y-2" data-testid="job-meters" ref={box}>
      {meters.map((meter) => (
        <JobMeterField
          key={meter.vehicleMeterId}
          jobId={jobId}
          meter={meter}
          locked={locked}
          labelClassName={labelClassName}
          flagged={flagged.ids.has(meter.vehicleMeterId)}
        />
      ))}
    </div>
  )
}

function JobMeterField({
  jobId,
  meter,
  locked,
  labelClassName,
  flagged = false,
}: {
  jobId: string
  meter: JobMeterView
  locked?: boolean
  labelClassName?: string
  /** A refusal named this meter: marked until a reading is typed. */
  flagged?: boolean
}) {
  const t = useTranslations('vehicles.meters')
  const format = useFormatter()
  const [typed, setTyped] = useState(meter.value == null ? '' : String(meter.value))
  const [last, setLast] = useState(meter.last)
  const saved = useRef(typed)
  // The same green mark the Reference / PO box shows after its own save.
  const [justSaved, setJustSaved] = useState(false)
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => void (savedTimer.current && clearTimeout(savedTimer.current)), [])

  // The job changed underneath (a reading typed on this job in another tab or
  // in the technician app, and the page refreshed): follow it, unless this
  // box holds something not yet saved, as the Reference / PO box does.
  const typedRef = useRef(typed)
  typedRef.current = typed
  useEffect(() => {
    const incoming = meter.value == null ? '' : String(meter.value)
    if (typedRef.current.trim() === saved.current.trim()) setTyped(incoming)
    saved.current = incoming
    setLast(meter.last)
  }, [meter.value, meter.last])

  const id = `job-meter-${meter.vehicleMeterId}`
  const lower = isLowerMeterValue(typed, last)
  const missing = flagged && meter.required && !locked && typed.trim() === ''
  const lastText =
    last == null
      ? ''
      : `${format.number(last, { maximumFractionDigits: 2 })}${meter.unit ? ` ${meter.unit}` : ''}`

  // A reading far above the last one waits for a yes before it is saved,
  // the question the odometer asks (vehicleReading.ts), with the limit for the
  // meter's unit (meterAsk.ts); a meter in another unit asks nothing.
  const [confirmed, setConfirmed] = useState<number | null>(null)
  const typedValue = parseMeterValue(typed)
  const askKind = meterReadingKind(meter.unit)
  const asking =
    typedValue !== null &&
    askKind !== null &&
    readingNeedsAnswer({
      value: typedValue,
      saved: parseMeterValue(saved.current),
      last,
      kind: askKind,
      confirmed,
    })

  const save = async (answered = false) => {
    if (typed.trim() === saved.current.trim()) return
    if (asking && !answered) return
    const result = await setJobMeterReading({
      jobId,
      vehicleMeterId: meter.vehicleMeterId,
      value: typed.trim() === '' ? null : typed,
    })
    if (!result.success || !result.data) {
      toast.error(result.error || t('saveError'))
      return
    }
    saved.current = typed
    setLast(result.data.last)
    setJustSaved(true)
    if (savedTimer.current) clearTimeout(savedTimer.current)
    savedTimer.current = setTimeout(() => setJustSaved(false), 2000)
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <Label
          htmlFor={id}
          className={cn(labelClassName, meter.item && 'flex-col items-start gap-0')}
        >
          <span>
            {meter.name}
            {/* The mark required custom fields carry, with words for a screen reader. */}
            {meter.required && (
              <>
                <span aria-hidden="true" className="ml-0.5 text-destructive">
                  *
                </span>
                {/* A space of its own: inside the hidden span a reader may drop it. */}{' '}
                <span className="sr-only">({t('requiredMark')})</span>
              </>
            )}
          </span>
          {/* A meter of a piece of equipment the job works on: which one. */}
          {meter.item && (
            <span className="line-clamp-2 max-w-44 text-[11px] font-normal normal-case tracking-normal text-muted-foreground">
              {meter.item.label}
            </span>
          )}
        </Label>
        <div className="flex items-center gap-1.5">
          <Input
            id={id}
            inputMode="decimal"
            autoComplete="off"
            className={cn(
              'h-8 w-32',
              missing && 'border-destructive focus-visible:ring-destructive'
            )}
            value={typed}
            aria-required={meter.required || undefined}
            aria-invalid={missing || undefined}
            disabled={locked}
            onChange={(e) => setTyped(e.target.value)}
            // Saved here, on its own: not an unsaved change of the page's form.
            onInput={(e) => e.stopPropagation()}
            onBlur={() => void save()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                e.currentTarget.blur()
              }
            }}
            aria-describedby={
              [missing && `${id}-required`, lower && `${id}-lower`].filter(Boolean).join(' ') ||
              undefined
            }
          />
          {meter.unit && <span className="text-xs text-muted-foreground">{meter.unit}</span>}
          {justSaved && (
            <span
              role="status"
              data-testid="job-meter-saved"
              className="flex items-center text-emerald-600 dark:text-emerald-500"
            >
              <Check className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only">{t('readingSaved', { name: meter.name })}</span>
            </span>
          )}
        </div>
      </div>
      {missing && (
        <p
          id={`${id}-required`}
          data-testid="job-meter-required"
          className="text-xs text-destructive"
        >
          {t('requiredMissing')}
        </p>
      )}
      {asking && last != null && typedValue !== null && (
        <ReadingQuestion
          id={`${id}-question`}
          entered={typedValue}
          last={last}
          meterUnit={meter.unit}
          onConfirm={() => {
            setConfirmed(typedValue)
            void save(true)
          }}
          onChange={() => document.getElementById(id)?.focus()}
        />
      )}
      {lower && (
        <p
          id={`${id}-lower`}
          role="status"
          className={cn('text-xs text-amber-600 dark:text-amber-500')}
        >
          {t('lowerReading', { last: lastText })}
        </p>
      )}
    </div>
  )
}
