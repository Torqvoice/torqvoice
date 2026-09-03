import { getSettings } from '@/features/settings/Actions/settingsActions'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { getAuthContext } from '@/lib/get-auth-context'
import { loadInspectionReminderSettings } from '@/features/inspection-reminders/Lib/settings'
import { InspectionReminderSettings } from './inspection-reminder-settings'

export default async function InspectionReminderSettingsPage() {
  const result = await getSettings([
    SETTING_KEYS.INSPECTION_DURATION_MINUTES,
    SETTING_KEYS.INSPECTION_BOOKING_LEAD_DAYS,
    SETTING_KEYS.INSPECTION_BOOKING_HORIZON_WEEKS,
    SETTING_KEYS.INSPECTION_BOOKING_RESERVE,
    SETTING_KEYS.INSPECTION_LINK_VALID_DAYS,
    SETTING_KEYS.INSPECTION_BOOKING_MODE,
    SETTING_KEYS.INSPECTION_CONTACT_PHONE,
    SETTING_KEYS.WORKSHOP_PHONE,
  ])
  const settings = result.success && result.data ? result.data : {}
  const auth = await getAuthContext()
  const effective = auth ? await loadInspectionReminderSettings(auth.organizationId) : null
  return (
    <InspectionReminderSettings
      settings={settings}
      timeZone={effective?.timeZone ?? 'UTC'}
      timeZoneDetected={effective?.timeZoneDetected ?? true}
    />
  )
}
