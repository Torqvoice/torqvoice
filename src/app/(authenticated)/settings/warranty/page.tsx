import { getSettings } from '@/features/settings/Actions/settingsActions'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { WARRANTY_SETTING_KEYS } from '@/features/settings/Lib/warrantyDefaults'
import { WarrantySettings } from './warranty-settings'

export default async function WarrantySettingsPage() {
  const result = await getSettings([...WARRANTY_SETTING_KEYS, SETTING_KEYS.UNIT_SYSTEM])
  const settings = result.success && result.data ? result.data : {}

  return <WarrantySettings settings={settings} />
}
