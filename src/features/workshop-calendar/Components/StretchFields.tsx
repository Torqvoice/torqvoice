'use client'

import { useTranslations } from 'next-intl'
import { DateInput } from '@/components/ui/date-input'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { MAX_SPAN_DAYS } from '../Schema/calendarSchema'
import { daysBetween, isDateKey, isTime, minutesOf } from '../Lib/calendar'

export interface StretchValue {
  startDate: string
  endDate: string
  /** Times are only kept while `partOfDay` is on. */
  partOfDay: boolean
  startTime: string
  endTime: string
}

export function stretchFromRow(row: {
  startDate: string
  endDate: string
  startTime?: string | null
  endTime?: string | null
}): StretchValue {
  return {
    startDate: row.startDate,
    endDate: row.endDate,
    partOfDay: !!(row.startTime || row.endTime),
    startTime: row.startTime ?? '',
    endTime: row.endTime ?? '',
  }
}

/** What to send to the server: times only when part of the day was chosen. */
export function stretchPayload(value: StretchValue) {
  return {
    startDate: value.startDate,
    endDate: value.endDate,
    startTime: value.partOfDay && value.startTime ? value.startTime : null,
    endTime: value.partOfDay && value.endTime ? value.endTime : null,
  }
}

/** The first problem with the stretch, as a key under `workshopCalendar.stretch`. */
export function stretchProblem(value: StretchValue): string | null {
  if (!isDateKey(value.startDate) || !isDateKey(value.endDate)) return 'pickDate'
  const days = daysBetween(value.startDate, value.endDate)
  if (days < 0) return 'endBeforeStart'
  if (days >= MAX_SPAN_DAYS) return 'tooLong'
  if (value.partOfDay) {
    const start = isTime(value.startTime) ? value.startTime : null
    const end = isTime(value.endTime) ? value.endTime : null
    if (days === 0 && start && end && minutesOf(start) >= minutesOf(end)) return 'timesCross'
  }
  return null
}

/**
 * First and last day, and optionally the times the stretch starts on its
 * first day and ends on its last: the fields a closed day and time off share.
 */
export function StretchFields({
  idPrefix,
  value,
  onChange,
}: {
  idPrefix: string
  value: StretchValue
  onChange: (value: StretchValue) => void
}) {
  const t = useTranslations('workshopCalendar.stretch')
  const set = (patch: Partial<StretchValue>) => onChange({ ...value, ...patch })
  const problem = stretchProblem(value)

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-from`}>{t('from')}</Label>
          <DateInput
            id={`${idPrefix}-from`}
            value={value.startDate}
            onChange={(startDate) =>
              // Moving the first day past the last carries the last day along.
              set({
                startDate,
                endDate:
                  isDateKey(startDate) && (!value.endDate || value.endDate < startDate)
                    ? startDate
                    : value.endDate,
              })
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-to`}>{t('to')}</Label>
          <DateInput
            id={`${idPrefix}-to`}
            value={value.endDate}
            onChange={(endDate) => set({ endDate })}
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <Switch
          checked={value.partOfDay}
          onCheckedChange={(partOfDay) => set({ partOfDay })}
          aria-label={t('partOfDay')}
        />
        {value.partOfDay ? t('partOfDay') : t('allDay')}
      </label>

      {value.partOfDay && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-start-time`}>{t('startTime')}</Label>
            <Input
              id={`${idPrefix}-start-time`}
              type="time"
              value={value.startTime}
              onChange={(e) => set({ startTime: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">{t('startTimeHint')}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-end-time`}>{t('endTime')}</Label>
            <Input
              id={`${idPrefix}-end-time`}
              type="time"
              value={value.endTime}
              onChange={(e) => set({ endTime: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">{t('endTimeHint')}</p>
          </div>
        </div>
      )}

      {problem && problem !== 'pickDate' && (
        <p role="alert" className="text-sm text-destructive">
          {t(problem)}
        </p>
      )}
    </div>
  )
}
