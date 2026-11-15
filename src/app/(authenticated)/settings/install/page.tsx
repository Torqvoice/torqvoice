import { InstallSettingsClient } from './install-client'
import { settingsPageTitle } from '@/lib/page-title'

export function generateMetadata() {
  return settingsPageTitle('install')
}

export default function InstallSettingsPage() {
  return <InstallSettingsClient />
}
