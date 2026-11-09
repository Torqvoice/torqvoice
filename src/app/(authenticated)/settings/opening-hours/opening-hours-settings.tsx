'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { CalendarCheck, UserX } from 'lucide-react'
import { AppCard } from '@/components/app-card'
import { DocsLink } from '@/components/docs-link'
import { Switch } from '@/components/ui/switch'
import { OpeningHoursCard } from '@/features/workshop-calendar/Components/OpeningHoursCard'
import { PublicHolidaysCard } from '@/features/workshop-calendar/Components/PublicHolidaysCard'
import {
  HolidayFeedsCard,
  type FeedSummary,
} from '@/features/workshop-calendar/Components/HolidayFeedsCard'
import { ClosedDaysCard } from '@/features/workshop-calendar/Components/ClosedDaysCard'
import { TimeOffList } from '@/features/workshop-calendar/Components/TimeOffList'
import type { TechnicianOption } from '@/features/workshop-calendar/Components/TimeOffDialog'
import { setClosuresEnabled } from '@/features/workshop-calendar/Actions/holidayActions'
import type { ClosureView } from '@/features/workshop-calendar/Actions/closureActions'
import type { AbsenceView } from '@/features/workshop-calendar/Actions/absenceActions'
import type { HolidayRow } from '@/features/workshop-calendar/Lib/holidays'
import type { WeekHours } from '@/features/workshop-calendar/Lib/calendar'
import { ReadOnlyBanner } from '../read-only-guard'
import { useSettingsPermission } from '../settings-permission-context'

export interface HolidaySettingsData {
  enabled: boolean
  week: WeekHours
  year: number
  country: string
  regions: string[]
  availableRegions: string[]
  fetchedAt: string | null
  fetchError: string | null
  holidays: HolidayRow[]
  feeds: FeedSummary[]
}

/**
 * When the workshop is open: hours per weekday, then (behind one switch)
 * public holidays, holiday calendars, its own closed days and time off.
 */
export function OpeningHoursSettings({
  settings,
  closures,
  absences,
  technicians,
  today,
  timeOffEditable,
}: {
  settings: HolidaySettingsData
  closures: ClosureView[]
  absences: AbsenceView[] | null
  technicians: TechnicianOption[]
  today: string
  timeOffEditable: boolean
}) {
  const t = useTranslations('workshopCalendar')
  const router = useRouter()
  const { canEdit } = useSettingsPermission()
  const [enabled, setEnabled] = useState(settings.enabled)

  const toggle = async (next: boolean) => {
    setEnabled(next)
    const res = await setClosuresEnabled(next)
    if (!res.success) {
      setEnabled(!next)
      toast.error(res.error ?? t('switch.failed'))
      return
    }
    toast.success(t('switch.saved'))
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <ReadOnlyBanner />
      <div>
        <p className="text-sm text-muted-foreground">{t('page.description')}</p>
        <DocsLink href="/docs/configuration/opening-hours" variant="hint" className="mt-1" />
      </div>

      <OpeningHoursCard week={settings.week} canEdit={canEdit} />

      <AppCard id="closures-switch" icon={CalendarCheck} title={t('switch.title')}>
        <label className="flex items-start gap-3">
          <Switch
            checked={enabled}
            disabled={!canEdit}
            onCheckedChange={toggle}
            className="mt-0.5"
            aria-label={t('switch.label')}
          />
          <span>
            <span className="text-sm font-medium">{t('switch.label')}</span>
            <span className="block text-xs text-muted-foreground">{t('switch.hint')}</span>
          </span>
        </label>
      </AppCard>

      {enabled && (
        <>
          <PublicHolidaysCard
            country={settings.country}
            regions={settings.regions}
            availableRegions={settings.availableRegions}
            holidays={settings.holidays}
            fetchedAt={settings.fetchedAt}
            fetchError={settings.fetchError}
            year={settings.year}
            canEdit={canEdit}
          />
          <HolidayFeedsCard feeds={settings.feeds} year={settings.year} canEdit={canEdit} />
          <ClosedDaysCard closures={closures} today={today} canEdit={canEdit} />
          {absences && (
            <AppCard
              id="time-off"
              icon={UserX}
              title={t('timeOff.title')}
              description={t('timeOff.description')}
            >
              <TimeOffList
                absences={absences}
                technicians={technicians}
                canEdit={timeOffEditable}
                today={today}
                onChanged={() => router.refresh()}
              />
            </AppCard>
          )}
        </>
      )}
    </div>
  )
}
