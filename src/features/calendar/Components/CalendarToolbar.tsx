'use client'

import { useTranslations } from 'next-intl'
import {
  Bell,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileText,
  Loader2,
  PanelLeft,
  Plus,
  Send,
  Wrench,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import type { CalendarView } from '../Lib/calendar-range'
import type { CalendarPreferences } from './useCalendarPreferences'

export type CreateKind = 'workOrder' | 'reminder' | 'quote' | 'message'

/** The keys the view switcher shows and the keyboard listens for. */
export const VIEW_SHORTCUTS: Record<CalendarView, string> = {
  day: 'D',
  week: 'W',
  month: 'M',
  year: 'Y',
  schedule: 'A',
  fourDays: 'X',
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
}: CalendarToolbarProps) {
  const t = useTranslations('calendar')

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
                  <DropdownMenuShortcut>{VIEW_SHORTCUTS[v]}</DropdownMenuShortcut>
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
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" className="h-9">
              <Plus className="h-4 w-4 sm:mr-1.5" />
              <span className="hidden sm:inline">{t('toolbar.create')}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onClick={() => onCreate('workOrder')}>
              <Wrench className="mr-2 h-4 w-4" />
              {t('contextMenu.newWorkOrder')}
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
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
