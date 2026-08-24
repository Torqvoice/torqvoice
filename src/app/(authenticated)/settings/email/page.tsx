import { redirect } from 'next/navigation'

/**
 * Kept as a redirect: every channel now lives on one tabbed page, but docs,
 * notifications and feature hints still link to the old address.
 */
export default function EmailSettingsPage() {
  redirect('/settings/providers?tab=email')
}
