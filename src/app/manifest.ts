import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'TorqVoice - Workshop Management',
    short_name: 'TorqVoice',
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
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  }
}
