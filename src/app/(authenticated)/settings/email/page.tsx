import { redirect } from 'next/navigation'
import { settingsPageTitle } from '@/lib/page-title'

export function generateMetadata() {
  return settingsPageTitle('email')
}

/**
 * Kept as a redirect: the channel is an integration now, but docs,
 * notifications and feature hints still link to the old address, and the
 * providers page explains where it went.
 */
export default function EmailSettingsPage() {
  redirect('/settings/integrations')
}
