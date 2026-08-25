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
  LayoutGrid,
  Monitor,
  ListFilter,
  Plus,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { useTranslations, useLocale } from 'next-intl'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { type BoardDensity, type BoardLayout, DENSITY_ORDER } from '../hooks/useBoardPreferences'
import type { BoardLane, LaneGrouping } from '../utils/lanes'

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
  layout,
  density,
  showWeekends,
  lanes,
  hiddenLaneIds,
  busyLaneIds,
  onToggleLane,
  onShowAllLanes,
  onShowBusyLanes,
  onPrevWeek,
  onNextWeek,
  onPrevDay,
  onNextDay,
  onToday,
  onAddTech,
  onAddBay,
  onViewChange,
  onGroupingChange,
  onLayoutChange,
  onDensityChange,
  onToggleWeekends,
}: {
  weekStart: string
  selectedDate: string
  view: BoardView
  grouping: LaneGrouping
  layout: BoardLayout
  density: BoardDensity
  showWeekends: boolean
  /** Every lane the grouping offers, filtered or not. */
  lanes: BoardLane[]
  hiddenLaneIds: string[]
  /** Lanes carrying work this week, for the "only these" shortcut. */
  busyLaneIds: string[]
  onToggleLane: (laneId: string) => void
  onShowAllLanes: () => void
  onShowBusyLanes: () => void
  onPrevWeek: () => void
  onNextWeek: () => void
  onPrevDay: () => void
  onNextDay: () => void
  onToday: () => void
  onAddTech: () => void
  onAddBay: () => void
  onViewChange: (view: BoardView) => void
  onGroupingChange: (grouping: LaneGrouping) => void
  onLayoutChange: (layout: BoardLayout) => void
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
            <Select value={layout} onValueChange={(value) => onLayoutChange(value as BoardLayout)}>
              <SelectTrigger size="sm" className="min-w-[130px]" aria-label={t('layout')}>
                <LayoutGrid className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="timeline">{t('layoutTimeline')}</SelectItem>
                <SelectItem value="cards">{t('layoutCards')}</SelectItem>
              </SelectContent>
            </Select>

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

            {lanes.length > 1 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant={hiddenLaneIds.length > 0 ? 'secondary' : 'outline'} size="sm">
                    <ListFilter className="mr-1.5 h-3.5 w-3.5" />
                    {t('lanes')}
                    <span className="ml-1.5 tabular-nums text-muted-foreground">
                      {lanes.length - hiddenLaneIds.length}/{lanes.length}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="w-60 p-0"
                  // Returning focus to the trigger on close scrolls whatever
                  // ancestor has to move to show it, which yanked the board
                  // underneath the menu.
                  onCloseAutoFocus={(event) => event.preventDefault()}
                >
                  <div className="p-1">
                    <DropdownMenuItem onClick={onShowAllLanes}>
                      {t('showAllLanes')}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={onShowBusyLanes} disabled={busyLaneIds.length === 0}>
                      {t('onlyBusyLanes')}
                    </DropdownMenuItem>
                  </div>
                  <DropdownMenuSeparator className="my-0" />
                  {/* Only the list scrolls, so the two actions above stay put
                      however many lanes a shop has. */}
                  <div className="max-h-[50vh] overflow-y-auto p-1">
                    <DropdownMenuLabel className="py-1">{t('lanes')}</DropdownMenuLabel>
                    {lanes.map((lane) => (
                      <DropdownMenuCheckboxItem
                        key={lane.id}
                        checked={!hiddenLaneIds.includes(lane.id)}
                        onSelect={(event) => {
                          // Keep the menu open: hiding lanes is done in batches.
                          event.preventDefault()
                          onToggleLane(lane.id)
                        }}
                      >
                        <span className="flex items-center gap-2">
                          <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ backgroundColor: lane.color }}
                          />
                          {lane.name}
                        </span>
                      </DropdownMenuCheckboxItem>
                    ))}
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            <Button
              variant={showWeekends ? 'secondary' : 'outline'}
              size="sm"
              onClick={onToggleWeekends}
              aria-pressed={showWeekends}
            >
              <CalendarRange className="mr-1.5 h-3.5 w-3.5" />
              {t('weekends')}
            </Button>

            <div
              className={cn(
                'flex items-center rounded-md border',
                layout !== 'timeline' && 'hidden'
              )}
            >
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
