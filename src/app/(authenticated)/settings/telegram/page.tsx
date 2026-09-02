import { redirect } from 'next/navigation'

/**
 * Kept as a redirect: the channel is an integration now, but docs,
 * notifications and feature hints still link to the old address, and the
 * providers page explains where it went.
 */
export default function TelegramSettingsPage() {
  redirect('/settings/providers?tab=telegram')
}
