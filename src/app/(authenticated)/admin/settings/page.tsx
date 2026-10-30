import { getSystemSettings } from '@/features/admin/Actions/getSystemSettings'
import { AdminSettings } from '@/features/admin/Components/admin-settings'
import { SYSTEM_SETTING_KEYS } from '@/features/admin/Schema/systemSettingsSchema'
import { appIconUrl } from '@/lib/branding'
import { installHasLicense, isCloudMode } from '@/lib/features'

export default async function AdminSettingsPage() {
  const result = await getSystemSettings()
  const data = result.data ?? {}

  // Browser branding is a white-label licence feature on self-hosted installs.
  const brandingAvailable = !isCloudMode() && (await installHasLicense())
  const iconFile = data[SYSTEM_SETTING_KEYS.BRANDING_APP_ICON]
  const brandingIconUrl = iconFile ? appIconUrl(iconFile) : null

  return (
    <AdminSettings
      initial={data}
      mode={isCloudMode() ? 'cloud' : 'self-hosted'}
      brandingAvailable={brandingAvailable}
      brandingIconUrl={brandingIconUrl}
    />
  )
}
