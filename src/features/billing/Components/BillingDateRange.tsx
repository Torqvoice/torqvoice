'use client'

import { CalendarIcon, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import type { DateRange } from 'react-day-picker'
import { useDateSettings } from '@/components/date-settings-context'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useFormatDate } from '@/lib/use-format-date'
import { cn } from '@/lib/utils'
import { addDaysToDayKey, dayKeyToLocalDate, workshopTodayKey } from '@/lib/workshop-datetime'

/** The YYYY-MM-DD a date picker's local midnight stands for. */
function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/** The first day of the month `months` away from the one `key` is in. */
function monthStart(key: string, months = 0): string {
  const [y, m] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1 + months, 1)).toISOString().slice(0, 10)
}

export interface DayRange {
  from: string
  to: string
}

/**
 * The ranges a workshop reaches for, as workshop calendar days. Built from
 * day keys rather than Dates, so "last month" is last month on the
 * workshop's calendar wherever the viewer sits.
 */
export function dayRangePresets(today: string): { key: string; range: DayRange | null }[] {
  const [y, m] = today.split('-').map(Number)
  const quarterStart = `${y}-${String(Math.floor((m - 1) / 3) * 3 + 1).padStart(2, '0')}-01`
  return [
    { key: 'today', range: { from: today, to: today } },
    {
      key: 'yesterday',
      range: { from: addDaysToDayKey(today, -1), to: addDaysToDayKey(today, -1) },
    },
    { key: 'last7', range: { from: addDaysToDayKey(today, -6), to: today } },
    { key: 'last30', range: { from: addDaysToDayKey(today, -29), to: today } },
    { key: 'last90', range: { from: addDaysToDayKey(today, -89), to: today } },
    { key: 'thisMonth', range: { from: monthStart(today), to: today } },
    {
      key: 'lastMonth',
      range: { from: monthStart(today, -1), to: addDaysToDayKey(monthStart(today), -1) },
    },
    { key: 'thisQuarter', range: { from: quarterStart, to: today } },
    { key: 'thisYear', range: { from: `${y}-01-01`, to: today } },
    { key: 'lastYear', range: { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` } },
    // Every invoice: the range comes off rather than reaching back to a year.
    { key: 'allTime', range: null },
  ]
}

/**
 * The billing list's invoice-date filter: a button that says the range (or
 * "All dates"), a calendar with the usual presets, and a cross to clear it.
 */
export function BillingDateRange({
  from,
  to,
  onChange,
  disabled,
  className,
}: {
  from: string
  to: string
  onChange: (range: DayRange | null) => void
  disabled?: boolean
  className?: string
}) {
  const t = useTranslations('billing.history')
  const tRange = useTranslations('reports.dateRange')
  const { formatDay } = useFormatDate()
  const { timezone } = useDateSettings()
  const today = workshopTodayKey(timezone || '')
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState<DateRange | undefined>()
  const active = Boolean(from || to)

  const label = active
    ? `${from ? formatDay(from) : ''} – ${to ? formatDay(to) : ''}`.trim()
    : t('allDates')

  const apply = (range: DayRange | null) => {
    setOpen(false)
    onChange(range)
  }

  return (
    <div className={cn('flex min-w-0 items-center', className)}>
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (next) {
            setPending({
              from: from ? dayKeyToLocalDate(from) : undefined,
              to: to ? dayKeyToLocalDate(to) : undefined,
            })
          }
        }}
      >
        <PopoverTrigger asChild>
          <Button
            variant={active ? 'secondary' : 'outline'}
            size="sm"
            disabled={disabled}
            aria-label={`${t('dateRange')}: ${label}`}
            className={cn(
              'h-9 min-w-0 flex-1 justify-start font-normal sm:h-8',
              active && 'rounded-r-none border border-r-0'
            )}
          >
            <CalendarIcon className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{label}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto max-w-[calc(100vw-1rem)] p-0" align="end">
          <div className="flex flex-col sm:flex-row">
            <Calendar
              mode="range"
              selected={pending}
              onSelect={setPending}
              defaultMonth={pending?.from ?? dayKeyToLocalDate(today)}
              numberOfMonths={1}
              captionLayout="dropdown"
              startMonth={new Date(2000, 0)}
              endMonth={dayKeyToLocalDate(monthStart(today, 12))}
            />
            <div className="grid grid-cols-3 gap-0.5 border-t p-2 sm:flex sm:min-w-[130px] sm:flex-col sm:border-t-0 sm:border-l">
              {dayRangePresets(today).map((preset) => (
                <Button
                  key={preset.key}
                  variant="ghost"
                  size="sm"
                  className="h-7 justify-start px-2 text-xs"
                  onClick={() => apply(preset.range)}
                >
                  {tRange(`presets.${preset.key}`)}
                </Button>
              ))}
            </div>
          </div>
          <div className="flex justify-end border-t p-3">
            <Button
              size="sm"
              disabled={!pending?.from}
              onClick={() =>
                pending?.from &&
                apply({
                  from: localDateKey(pending.from),
                  to: localDateKey(pending.to ?? pending.from),
                })
              }
            >
              {tRange('apply')}
            </Button>
          </div>
        </PopoverContent>
      </Popover>
      {active && (
        <Button
          variant="secondary"
          size="sm"
          className="h-9 w-8 shrink-0 rounded-l-none border border-l-0 p-0 sm:h-8"
          onClick={() => onChange(null)}
          disabled={disabled}
          aria-label={t('clearDates')}
          title={t('clearDates')}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  )
}
