'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import {
  Calendar,
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Clock,
  Columns3,
  Monitor,
  Plus,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { useTranslations, useLocale } from 'next-intl'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { type BoardDensity, DENSITY_ORDER } from '../hooks/useBoardPreferences'
import type { LaneGrouping } from '../utils/lanes'

export type BoardView = 'week' | 'day'

/**
 * ISO 8601 week number, taken from the middle of the shown range.
 *
 * European workshops schedule by week number before they schedule by date
 * ("that's a KW 36 job"), and the planner this view was modelled on leads with
 * it. Sampling the midpoint keeps the number right whichever weekday the shop
 * starts its week on.
 */
export function isoWeekNumber(weekStart: string): number {
  const mid = new Date(weekStart + 'T12:00:00')
  mid.setDate(mid.getDate() + 3)
  const utc = new Date(Date.UTC(mid.getFullYear(), mid.getMonth(), mid.getDate()))
  utc.setUTCDate(utc.getUTCDate() + 4 - (utc.getUTCDay() || 7))
  const yearStart = Date.UTC(utc.getUTCFullYear(), 0, 1)
  return Math.ceil(((utc.getTime() - yearStart) / 86_400_000 + 1) / 7)
}

function formatWeekRange(weekStart: string, locale?: string) {
  const start = new Date(weekStart + 'T12:00:00')
  const end = new Date(start)
  end.setDate(end.getDate() + 6)

  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  const startStr = start.toLocaleDateString(locale, opts)
  const endStr = end.toLocaleDateString(locale, {
    ...opts,
    year: 'numeric',
  })
  return `${startStr} – ${endStr}`
}

function formatDayDate(date: string, locale?: string) {
  const d = new Date(date + 'T12:00:00')
  return d.toLocaleDateString(locale, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

export function WorkBoardToolbar({
  weekStart,
  selectedDate,
  view,
  grouping,
  density,
  showWeekends,
  onPrevWeek,
  onNextWeek,
  onPrevDay,
  onNextDay,
  onToday,
  onAddTech,
  onAddBay,
  onViewChange,
  onGroupingChange,
  onDensityChange,
  onToggleWeekends,
}: {
  weekStart: string
  selectedDate: string
  view: BoardView
  grouping: LaneGrouping
  density: BoardDensity
  showWeekends: boolean
  onPrevWeek: () => void
  onNextWeek: () => void
  onPrevDay: () => void
  onNextDay: () => void
  onToday: () => void
  onAddTech: () => void
  onAddBay: () => void
  onViewChange: (view: BoardView) => void
  onGroupingChange: (grouping: LaneGrouping) => void
  onDensityChange: (density: BoardDensity) => void
  onToggleWeekends: () => void
}) {
  const t = useTranslations('workBoard.toolbar')
  const locale = useLocale()

  const densityIndex = DENSITY_ORDER.indexOf(density)

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onToday}>
          <Calendar className="mr-1.5 h-3.5 w-3.5" />
          {t('today')}
        </Button>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={view === 'week' ? onPrevWeek : onPrevDay}
            aria-label={view === 'week' ? t('previousWeek') : t('previousDay')}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="flex min-w-[180px] items-center justify-center gap-2 text-sm font-medium">
            {view === 'week' && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground">
                {t('weekNumber', { number: isoWeekNumber(weekStart) })}
              </span>
            )}
            {view === 'week'
              ? formatWeekRange(weekStart, locale)
              : formatDayDate(selectedDate, locale)}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={view === 'week' ? onNextWeek : onNextDay}
            aria-label={view === 'week' ? t('nextWeek') : t('nextDay')}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {view === 'week' && (
          <>
            <Select
              value={grouping}
              onValueChange={(value) => onGroupingChange(value as LaneGrouping)}
            >
              <SelectTrigger size="sm" className="min-w-[150px]" aria-label={t('groupBy')}>
                <Columns3 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="technician">{t('byTechnician')}</SelectItem>
                <SelectItem value="bay">{t('byBay')}</SelectItem>
                <SelectItem value="none">{t('byNothing')}</SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant={showWeekends ? 'secondary' : 'outline'}
              size="sm"
              onClick={onToggleWeekends}
              aria-pressed={showWeekends}
            >
              <CalendarRange className="mr-1.5 h-3.5 w-3.5" />
              {t('weekends')}
            </Button>

            <div className="flex items-center rounded-md border">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-r-none"
                disabled={densityIndex <= 0}
                onClick={() => onDensityChange(DENSITY_ORDER[densityIndex - 1])}
                aria-label={t('zoomOut')}
              >
                <ZoomOut className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-l-none"
                disabled={densityIndex >= DENSITY_ORDER.length - 1}
                onClick={() => onDensityChange(DENSITY_ORDER[densityIndex + 1])}
                aria-label={t('zoomIn')}
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
            </div>
          </>
        )}

        <div className="flex rounded-md border">
          <button
            type="button"
            onClick={() => onViewChange('day')}
            className={cn(
              'flex items-center gap-1 rounded-l-md px-2.5 py-1.5 text-xs font-medium transition-colors',
              view === 'day'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted'
            )}
          >
            <Clock className="h-3.5 w-3.5" />
            {t('day')}
          </button>
          <button
            type="button"
            onClick={() => onViewChange('week')}
            className={cn(
              'flex items-center gap-1 rounded-r-md px-2.5 py-1.5 text-xs font-medium transition-colors',
              view === 'week'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted'
            )}
          >
            <CalendarDays className="h-3.5 w-3.5" />
            {t('week')}
          </button>
        </div>

        <Button variant="outline" size="sm" asChild>
          <Link href="/work-board/presenter" target="_blank">
            <Monitor className="mr-1.5 h-3.5 w-3.5" />
            {t('presenter')}
          </Link>
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm">
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              {t('add')}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onAddTech}>{t('addTechnician')}</DropdownMenuItem>
            <DropdownMenuItem onClick={onAddBay}>{t('addBay')}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
