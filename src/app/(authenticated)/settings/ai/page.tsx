import { redirect } from 'next/navigation'

/**
 * AI moved into the integrations catalog, where every other vendor with a key
 * lives. The route stays as a redirect: it is in menus, bookmarks and the
 * docs, and a workshop following an old link should land on the catalog
 * rather than on a 404.
 */
export default function AiSettingsPage() {
  redirect('/settings/integrations')
}
