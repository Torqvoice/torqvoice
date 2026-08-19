import { redirect } from 'next/navigation'
import { getLayoutData } from '@/lib/get-layout-data'
import { getFeatures, isCloudMode } from '@/lib/features'
import { getSettings } from '@/features/settings/Actions/settingsActions'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { FeatureLockedMessage } from '../feature-locked-message'
import { TireHotelSettings } from './tire-hotel-settings'

export default async function TireHotelSettingsPage() {
  const data = await getLayoutData()

  if (data.status === 'unauthenticated') redirect('/auth/sign-in')
  if (data.status === 'no-organization') redirect('/onboarding')

  const features = await getFeatures(data.organizationId)

  if (!features.tireHotel) {
    return (
      <FeatureLockedMessage
        feature="Tire Hotel"
        description="Store your customers' seasonal tires, track which shelf every set sits on, and see at a glance how much room is left."
        isCloud={isCloudMode()}
      />
    )
  }

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
