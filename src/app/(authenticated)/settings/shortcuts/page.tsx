import { redirect } from 'next/navigation'
import { getAuthContext } from '@/lib/get-auth-context'
import { settingsPageTitle } from '@/lib/page-title'
import { ShortcutsSettings } from '@/features/shortcuts/Components/ShortcutsSettings'

export function generateMetadata() {
  return settingsPageTitle('shortcuts')
}

export default async function ShortcutsSettingsPage() {
  const ctx = await getAuthContext()
  if (!ctx) redirect('/sign-in')

  return <ShortcutsSettings />
}
