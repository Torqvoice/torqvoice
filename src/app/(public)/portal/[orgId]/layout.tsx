import type { Metadata } from 'next'
import { PortalRoot } from '@/features/portal/Components/PortalRoot'
import { loadPortalLook } from '@/features/portal/Lib/portalLook.server'
import { DEFAULT_PORTAL_LOOK } from '@/features/portal/Lib/theme'
import { resolvePortalOrg } from '@/lib/portal-slug'
// The four themes' typefaces, from npm like the app's own (see
// src/app/fonts.css for why not next/font/google). Inter and Barlow
// Condensed are already loaded by the root layout. A browser only fetches
// the faces the chosen theme sets text in.
import '@fontsource-variable/archivo/wght.css'
import '@fontsource/barlow/400.css'
import '@fontsource/barlow/500.css'
import '@fontsource/barlow/600.css'
import '@fontsource-variable/newsreader/wght.css'
import '@fontsource-variable/newsreader/wght-italic.css'
import '@fontsource-variable/instrument-sans/wght.css'
import '@fontsource-variable/plus-jakarta-sans/wght.css'
import '@/features/portal/portal-themes.css'

// A customer's tab reads the workshop's name. The portal is the workshop's own
// page, so neither TorqVoice nor an install's white-label name is appended,
// and like every other customer page it stays out of search engines.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ orgId: string }>
}): Promise<Metadata> {
  const { orgId } = await params
  const robots: Metadata['robots'] = { index: false, follow: false }
  const org = await resolvePortalOrg(orgId).catch(() => null)
  if (!org) return { robots }
  return {
    title: { absolute: org.name, template: `%s | ${org.name}` },
    appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: org.name },
    robots,
  }
}

/**
 * Every page of a workshop's portal, signed in or not, and its loading and
 * error screens, is drawn inside `PortalRoot`: the element that carries the
 * workshop's theme and colour. A page never renders its own.
 */
export default async function PortalOrgLayout({
  params,
  children,
}: {
  params: Promise<{ orgId: string }>
  children: React.ReactNode
}) {
  const { orgId } = await params
  const org = await resolvePortalOrg(orgId).catch(() => null)
  const look = org ? await loadPortalLook(org.id) : DEFAULT_PORTAL_LOOK
  return <PortalRoot look={look}>{children}</PortalRoot>
}
