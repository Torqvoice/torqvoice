import { getSettings } from '@/features/settings/Actions/settingsActions'
import { LocalizationSettings } from './localization-settings'
import { settingsPageTitle } from '@/lib/page-title'

export function generateMetadata() {
  return settingsPageTitle('localization')
}

export default async function LocalizationSettingsPage() {
  const result = await getSettings()
  const settings = result.success && result.data ? result.data : {}

  return <LocalizationSettings settings={settings} />
}
