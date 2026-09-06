'use client'

import { useTranslations } from 'next-intl'
import { Calendar } from '@/components/ui/calendar'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import { typePalette } from './calendar-utils'
import type { CalendarEventType } from '../Actions/calendarActions'

export type TypeFilters = Record<CalendarEventType, boolean>

const FILTER_ORDER: CalendarEventType[] = ['service', 'reminder', 'quote', 'message', 'external']

const FILTER_LABEL: Record<CalendarEventType, string> = {
  service: 'services',
  reminder: 'reminders',
  quote: 'quotes',
  message: 'messages',
  external: 'external',
}

interface CalendarSidebarProps {
  selectedDate: Date
  /** The month the mini calendar shows; follows the main view. */
  month: Date
  busyDates: Date[]
  filters: TypeFilters
  counts: Record<CalendarEventType, number>
  total: number
  onSelectDate: (date: Date) => void
  onMonthChange: (date: Date) => void
  onFilterChange: (type: CalendarEventType, checked: boolean) => void
}

/**
 * The left rail: a mini month to jump around by, and the list of what the
 * calendar draws with a checkbox and a count for each, the way a desktop
 * calendar lists its calendars.
 */
export function CalendarSidebar({
  selectedDate,
  month,
  busyDates,
  filters,
  counts,
  total,
  onSelectDate,
  onMonthChange,
  onFilterChange,
}: CalendarSidebarProps) {
  const t = useTranslations('calendar')

  return (
    <aside className="hidden w-64 shrink-0 flex-col gap-2 overflow-y-auto border-r border-border/70 lg:flex">
      <Calendar
        mode="single"
        selected={selectedDate}
        onSelect={(date) => date && onSelectDate(date)}
        month={month}
        onMonthChange={onMonthChange}
        modifiers={{ busy: busyDates }}
        modifiersClassNames={{ busy: '[&_button]:font-semibold [&_button]:text-primary' }}
        className="w-full bg-transparent p-3 [--cell-size:2rem]"
      />

      <div className="px-3 pb-3">
        <div className="mb-1.5 flex items-baseline justify-between px-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t('sidebar.calendars')}
          </p>
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {t('monthTotal', { count: total })}
          </span>
        </div>
        <ul className="space-y-0.5">
          {FILTER_ORDER.map((type) => {
            if (type === 'external' && counts.external === 0) return null
            const palette = typePalette(type)
            return (
              <li key={type}>
                <label
                  className={cn(
                    'flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent',
                    !filters[type] && 'text-muted-foreground'
                  )}
                >
                  <Checkbox
                    checked={filters[type]}
                    onCheckedChange={(checked) => onFilterChange(type, !!checked)}
                    aria-label={t(`filters.${FILTER_LABEL[type]}`)}
                  />
                  <span className={cn('h-2.5 w-2.5 shrink-0 rounded-sm', palette.dot)} />
                  <span className="min-w-0 flex-1 truncate">
                    {t(`filters.${FILTER_LABEL[type]}`)}
                  </span>
                  <span className="text-xs tabular-nums text-muted-foreground">{counts[type]}</span>
                </label>
              </li>
            )
          })}
        </ul>

        <div className="mt-4 space-y-1 px-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t('sidebar.legend')}
          </p>
          <ul className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <li className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              {t('events.status.completed')}
            </li>
            <li className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-orange-500" />
              {t('events.status.waitingParts')}
            </li>
            <li className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-red-500" />
              {t('events.status.overdue')}
            </li>
            <li className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-red-500" />
              {t('events.status.failed')}
            </li>
          </ul>
        </div>
      </div>
    </aside>
  )
}
