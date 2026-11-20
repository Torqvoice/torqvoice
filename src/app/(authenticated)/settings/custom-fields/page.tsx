import { redirect } from 'next/navigation'
import { CUSTOM_FIELDS_SETTINGS_PATH } from '@/features/custom-fields/Lib/settingsPath'
import { settingsPageTitle } from '@/lib/page-title'

export function generateMetadata() {
  return settingsPageTitle('customFields')
}

/**
 * Custom fields, meters and equipment live on the Custom Fields tab of
 * Settings, Invoice & Quotes, which is where the settings menu leads. This
 * address had no way in from the menu; it stays only so an old link or
 * bookmark lands on the tab. The browser keeps the `#section` of the link.
 */
export default function CustomFieldsPage() {
  redirect(CUSTOM_FIELDS_SETTINGS_PATH)
}
