'use client'

import { useEffect, useRef, useState } from 'react'
import { Check } from 'lucide-react'
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
import type { JobMeterView } from '../Lib/meters.server'

/**
 * The job's reading of each of the vehicle's meters, beside the odometer.
 * Each one saves on its own when the person leaves the box, the way the
 * Reference / PO box does. A reading below the last one before this job is
 * said under the box and saved all the same. Nothing is drawn for a vehicle
 * without meters, or while meters are off.
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
    <div className="space-y-2" data-testid="job-meters">
      {meters.map((meter) => (
        <JobMeterField
          key={meter.vehicleMeterId}
          jobId={jobId}
          meter={meter}
          locked={locked}
          labelClassName={labelClassName}
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
}: {
  jobId: string
  meter: JobMeterView
  locked?: boolean
  labelClassName?: string
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
  const id = `job-meter-${meter.vehicleMeterId}`
  const lower = isLowerMeterValue(typed, last)
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
          {meter.name}
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
            className="h-8 w-32"
            value={typed}
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
            aria-describedby={lower ? `${id}-lower` : undefined}
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
