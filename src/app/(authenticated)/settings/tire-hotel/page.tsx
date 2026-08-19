import { getSettings } from '@/features/settings/Actions/settingsActions'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { TireHotelSettings } from './tire-hotel-settings'

export default async function TireHotelSettingsPage() {
  const result = await getSettings([
    SETTING_KEYS.TIRE_HOTEL_ENABLED,
    SETTING_KEYS.TIRE_HOTEL_SUMMER_REPLACE_MM,
    SETTING_KEYS.TIRE_HOTEL_WINTER_REPLACE_MM,
    SETTING_KEYS.TIRE_HOTEL_DEFAULT_CAPACITY,
    SETTING_KEYS.TIRE_HOTEL_CAPACITY_WARN_PERCENT,
    SETTING_KEYS.UNIT_SYSTEM,
  ])
  const settings = result.success && result.data ? result.data : {}

  return <TireHotelSettings settings={settings} />
}
