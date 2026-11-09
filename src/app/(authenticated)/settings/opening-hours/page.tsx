import { getAuthContext } from '@/lib/get-auth-context'
import { workshopTimeZone } from '@/lib/workshop-timezone'
import { zonedDayKey } from '@/lib/timezone'
import { getTechnicians } from '@/features/workboard/Actions/technicianActions'
import { getHolidaySettings } from '@/features/workshop-calendar/Actions/holidayActions'
import { listClosures } from '@/features/workshop-calendar/Actions/closureActions'
import { listAbsences } from '@/features/workshop-calendar/Actions/absenceActions'
import { canEditTimeOff } from '@/features/workshop-calendar/Lib/access.server'
import { OpeningHoursSettings } from './opening-hours-settings'

export default async function OpeningHoursSettingsPage() {
  const auth = await getAuthContext()
  const [settings, closures, absences, technicians, timeZone, timeOffEditable] = await Promise.all([
    getHolidaySettings(),
    listClosures(),
    listAbsences(),
    getTechnicians(),
    auth ? workshopTimeZone(auth.organizationId) : Promise.resolve('UTC'),
    auth ? canEditTimeOff(auth.userId, auth.role) : Promise.resolve(false),
  ])
  if (!settings.success || !settings.data) {
    return <p className="text-sm text-muted-foreground">{settings.error}</p>
  }

  return (
    <OpeningHoursSettings
      settings={settings.data}
      closures={closures.data ?? []}
      // Null when this person may not see the work board's time off.
      absences={absences.success ? (absences.data ?? []) : null}
      technicians={
        technicians.success && technicians.data
          ? technicians.data
              .filter((t) => t.isActive)
              .map((t) => ({ id: t.id, name: t.name, color: t.color }))
          : []
      }
      today={zonedDayKey(new Date(), timeZone)}
      timeOffEditable={timeOffEditable}
    />
  )
}
