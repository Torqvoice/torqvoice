import type { MetadataRoute } from 'next'
import { APP_ICON_MIME_TYPES, DEFAULT_APP_NAME, getAppBranding } from '@/lib/branding'

// Read per request: the build would otherwise bake the default branding into
// a static file, and a workshop's own name and icon would never reach it.
export const dynamic = 'force-dynamic'

const DEFAULT_ICONS: MetadataRoute.Manifest['icons'] = [
  { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
  { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
]

function iconType(url: string): string {
  const ext = new URL(url, 'http://local').searchParams.get('v')?.split('.').pop()?.toLowerCase()
  return (ext && APP_ICON_MIME_TYPES[ext]) || 'image/png'
}

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const branding = await getAppBranding()
  // An icon on its own keeps the full default name.
  const named = branding.custom && branding.name !== DEFAULT_APP_NAME

  return {
    id: '/',
    name: named ? branding.name : 'TorqVoice - Workshop Management',
    short_name: named ? branding.name : 'TorqVoice',
    description:
      'Workshop management platform for automotive service businesses. Manage work orders, invoices, customers, inventory, and vehicle service history.',
    start_url: '/',
    scope: '/',
    // Chrome and Edge honour 'fullscreen' on Android and ChromeOS, which is
    // what a tablet in the bay wants. Every desktop falls back down the chain
    // to 'standalone', because no desktop browser launches a web app
    // fullscreen from the manifest. The in-app toggle covers that case.
    display_override: ['fullscreen', 'standalone'],
    display: 'standalone',
    orientation: 'any',
    background_color: '#09090b',
    theme_color: '#09090b',
    // The upload route stores every icon as a 512px square PNG.
    icons: branding.iconUrl
      ? [
          {
            src: branding.iconUrl,
            sizes: '512x512',
            type: iconType(branding.iconUrl),
            purpose: 'any',
          },
        ]
      : DEFAULT_ICONS,
  }
}
