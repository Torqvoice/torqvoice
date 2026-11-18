import { redirect } from 'next/navigation'
import { getAuthContext } from '@/lib/get-auth-context'
import { AppearanceSettings } from './appearance-settings'
import { settingsPageTitle } from '@/lib/page-title'

export function generateMetadata() {
  return settingsPageTitle('appearance')
}

export default async function AppearanceSettingsPage() {
  const ctx = await getAuthContext()
  if (!ctx) redirect('/sign-in')

  return <AppearanceSettings />
}
