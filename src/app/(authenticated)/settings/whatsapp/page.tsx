import { redirect } from 'next/navigation'
import { pageTitle } from '@/lib/page-title'

export function generateMetadata() {
  return pageTitle('whatsapp')
}

/**
 * Kept as a redirect: the channel is an integration now, but docs,
 * notifications and feature hints still link to the old address, and the
 * providers page explains where it went.
 */
export default function WhatsappSettingsPage() {
  redirect('/settings/integrations')
}
