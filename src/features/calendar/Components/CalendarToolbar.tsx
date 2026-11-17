'use client'

import { useShortcutKey } from '@/features/shortcuts/Components/ShortcutsProvider'
import { useTranslations } from 'next-intl'
import {
  Bell,
  CalendarPlus,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileText,
  Loader2,
  PanelLeft,
  Plus,
  Send,
  UserX,
  Wrench,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import type { CalendarView } from '../Lib/calendar-range'
import type { CalendarPreferences } from './useCalendarPreferences'
import type { CalendarEventType } from '../Actions/calendarActions'
import { FILTER_LABEL, listedTypes, type TypeFilters } from './CalendarSidebar'
import { typePalette } from './calendar-utils'

export type CreateKind = 'workOrder' | 'appointment' | 'reminder' | 'quote' | 'message' | 'timeOff'

/** The key that switches to a view, from the shortcut registry, so a changed key reads changed. */
function ViewShortcut({ view }: { view: CalendarView }) {
  const shortcut = useShortcutKey(`calendar.${view}`)
  if (!shortcut) return null
  return <DropdownMenuShortcut>{shortcut.text}</DropdownMenuShortcut>
}

const VIEW_ORDER: CalendarView[] = ['day', 'week', 'month', 'year', 'schedule', 'fourDays']

interface CalendarToolbarProps {
  title: string
  view: CalendarView
  loading: boolean
  sidebarOpen: boolean
  preferences: CalendarPreferences
  onViewChange: (view: CalendarView) => void
  onPrev: () => void
  onNext: () => void
  onToday: () => void
  onToggleSidebar: () => void
  onPreferenceChange: (patch: Partial<CalendarPreferences>) => void
  onCreate: (kind: CreateKind) => void
  /** Whether this person may set technicians on leave, and the workshop tracks it. */
  canSetTimeOff?: boolean
  /** The kinds shown, for the menu copy of the sidebar list where the sidebar is not drawn. */
  filters: TypeFilters
  counts: Record<CalendarEventType, number>
  onFilterChange: (type: CalendarEventType, checked: boolean) => void
}

/**
 * The strip above the grid: today, back and forward, what is showing, and
 * on the right the view switcher and the create menu. Laid out the way
 * every desktop calendar lays it out, so nobody has to learn it.
 */
export function CalendarToolbar({
  title,
  view,
  loading,
  sidebarOpen,
  preferences,
  onViewChange,
  onPrev,
  onNext,
  onToday,
  onToggleSidebar,
  onPreferenceChange,
  onCreate,
  filters,
  counts,
  onFilterChange,
  canSetTimeOff = false,
}: CalendarToolbarProps) {
  const t = useTranslations('calendar')
  const tTimeOff = useTranslations('workshopCalendar.timeOff')

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border/70 px-2 py-2 sm:px-3">
      <Button
        variant="ghost"
        size="icon"
        className="hidden h-9 w-9 lg:inline-flex"
        onClick={onToggleSidebar}
        aria-label={sidebarOpen ? t('toolbar.hideSidebar') : t('toolbar.showSidebar')}
        aria-pressed={sidebarOpen}
      >
        <PanelLeft className="h-4 w-4" />
      </Button>

      <Button variant="outline" size="sm" className="h-9" onClick={onToday}>
        {t('today')}
      </Button>
      <div className="flex items-center">
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          onClick={onPrev}
          aria-label={t('toolbar.previous')}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          onClick={onNext}
          aria-label={t('toolbar.next')}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <h2 className="min-w-0 truncate text-lg font-semibold sm:text-xl" aria-live="polite">
        {title}
      </h2>
      <Loader2
        className={cn(
          'h-4 w-4 animate-spin text-muted-foreground transition-opacity',
          loading ? 'opacity-100' : 'opacity-0'
        )}
        aria-hidden={!loading}
      />

      <div className="ml-auto flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 min-w-[7rem] justify-between">
              {t(`views.${view}`)}
              <ChevronDown className="ml-1 h-4 w-4 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuRadioGroup
              value={view}
              onValueChange={(value) => onViewChange(value as CalendarView)}
            >
              {VIEW_ORDER.map((v) => (
                <DropdownMenuRadioItem key={v} value={v}>
                  {t(`views.${v}`)}
                  <ViewShortcut view={v} />
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              checked={preferences.showWeekends}
              onCheckedChange={(checked) => onPreferenceChange({ showWeekends: !!checked })}
            >
              {t('options.showWeekends')}
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={preferences.showCompleted}
              onCheckedChange={(checked) => onPreferenceChange({ showCompleted: !!checked })}
            >
              {t('options.showCompleted')}
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={preferences.showWeekNumbers}
              onCheckedChange={(checked) => onPreferenceChange({ showWeekNumbers: !!checked })}
            >
              {t('options.showWeekNumbers')}
            </DropdownMenuCheckboxItem>
            {/* The sidebar's list, for widths where the sidebar is not drawn or
                when it is closed, so a hidden kind can always be shown again. */}
            <DropdownMenuGroup className={cn(sidebarOpen && 'lg:hidden')}>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                {t('sidebar.calendars')}
              </DropdownMenuLabel>
              {listedTypes(counts, filters).map((type) => (
                <DropdownMenuCheckboxItem
                  key={type}
                  checked={filters[type]}
                  onCheckedChange={(checked) => onFilterChange(type, !!checked)}
                  onSelect={(event) => event.preventDefault()}
                >
                  <span
                    className={cn('mr-2 h-2.5 w-2.5 shrink-0 rounded-sm', typePalette(type).dot)}
                  />
                  <span className="flex-1">{t(`filters.${FILTER_LABEL[type]}`)}</span>
                  <span className="ml-2 text-xs tabular-nums text-muted-foreground">
                    {counts[type]}
                  </span>
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" className="h-9">
              <Plus className="h-4 w-4 sm:mr-1.5" />
              <span className="hidden sm:inline">{t('toolbar.create')}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuItem onClick={() => onCreate('workOrder')}>
              <Wrench className="mr-2 h-4 w-4" />
              {t('contextMenu.newWorkOrder')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onCreate('appointment')}>
              <CalendarPlus className="mr-2 h-4 w-4" />
              {t('contextMenu.bookAppointment')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onCreate('reminder')}>
              <Bell className="mr-2 h-4 w-4" />
              {t('contextMenu.newReminder')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onCreate('quote')}>
              <FileText className="mr-2 h-4 w-4" />
              {t('contextMenu.newQuote')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onCreate('message')}>
              <Send className="mr-2 h-4 w-4" />
              {t('contextMenu.scheduleMessage')}
            </DropdownMenuItem>
            {canSetTimeOff && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onCreate('timeOff')}>
                  <UserX className="mr-2 h-4 w-4" />
                  {tTimeOff('add')}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
