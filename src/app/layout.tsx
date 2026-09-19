import type { Metadata } from 'next'
import {
  Atkinson_Hyperlegible_Mono,
  Atkinson_Hyperlegible_Next,
  Barlow_Condensed,
  Geist,
  Geist_Mono,
  IBM_Plex_Mono,
  IBM_Plex_Sans,
  Inter,
  Inter_Tight,
  JetBrains_Mono,
} from 'next/font/google'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages } from 'next-intl/server'
import { Toaster } from '@/components/ui/sonner'
import { ThemeProvider } from '@/components/theme-provider'
import { QueryProvider } from '@/lib/query-provider'
import { GlassModal } from '@/components/glass-modal'
import { UpgradeGateDialog } from '@/components/upgrade-gate'
import { TooltipProvider } from '@/components/ui/tooltip'
import { PWAServiceWorker } from '@/components/pwa-service-worker'
import { PostHogProvider } from '@/components/posthog-provider'
import { isCloudMode } from '@/lib/features'
import { isDemoMode } from '@/lib/demo'
import { DemoBanner } from '@/components/demo-banner'
import { BroadcastBanner } from '@/components/broadcast-banner'
import { BannerSlotProvider } from '@/components/banner-slot'
import { getBroadcast, isCustomerFacingPath } from '@/lib/broadcast'
import { headers } from 'next/headers'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import './globals.css'

// Declared under *-base: globals.css points --font-geist-sans at it, or at
// another face when a font set is chosen (see src/lib/font-sets.ts).
const geistSans = Geist({
  variable: '--font-geist-sans-base',
  subsets: ['latin', 'latin-ext'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono-base',
  subsets: ['latin', 'latin-ext'],
})

// The "workshop" font set (Settings → Appearance). Not preloaded: a browser
// fetches a font file only when some text is actually set in it, so whoever
// stays on the default never downloads these.
const plexSans = IBM_Plex_Sans({
  variable: '--font-plex-sans',
  weight: ['400', '500', '600', '700'],
  subsets: ['latin', 'latin-ext', 'cyrillic'],
  preload: false,
})

const plexMono = IBM_Plex_Mono({
  variable: '--font-plex-mono',
  weight: ['400', '500', '600'],
  subsets: ['latin', 'latin-ext', 'cyrillic'],
  preload: false,
})

const barlowCondensed = Barlow_Condensed({
  variable: '--font-barlow-condensed',
  weight: ['500', '600', '700'],
  subsets: ['latin', 'latin-ext'],
  preload: false,
})

// The "precise" set. Variable fonts, so one file covers every weight.
const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin', 'latin-ext', 'cyrillic'],
  preload: false,
})

const interTight = Inter_Tight({
  variable: '--font-inter-tight',
  subsets: ['latin', 'latin-ext', 'cyrillic'],
  preload: false,
})

const jetBrainsMono = JetBrains_Mono({
  variable: '--font-jetbrains-mono',
  subsets: ['latin', 'latin-ext', 'cyrillic'],
  preload: false,
})

// The "legible" set. Latin only: the family has no Cyrillic.
//
// adjustFontFallback is off for these two. next/font sizes a stand-in system
// font to match each face while it loads, from a table of font metrics shipped
// with Next, and these families are newer than that table: it found nothing,
// skipped the stand-in anyway, and said so on every compile. The fallback is
// named here instead, so the text is still set in something sensible for the
// moment before the font arrives.
const atkinson = Atkinson_Hyperlegible_Next({
  variable: '--font-atkinson',
  subsets: ['latin', 'latin-ext'],
  preload: false,
  adjustFontFallback: false,
  fallback: ['system-ui', 'sans-serif'],
})

const atkinsonMono = Atkinson_Hyperlegible_Mono({
  variable: '--font-atkinson-mono',
  subsets: ['latin', 'latin-ext'],
  preload: false,
  adjustFontFallback: false,
  fallback: ['ui-monospace', 'monospace'],
})

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'),
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'TorqVoice',
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
  title: {
    default: 'TorqVoice - Workshop Management Platform',
    template: '%s | TorqVoice',
  },
  description:
    'Self-hosted workshop management platform for automotive service businesses. Manage work orders, invoices, customers, inventory, and vehicle service history.',
  keywords: [
    'workshop management',
    'automotive service',
    'vehicle service',
    'work orders',
    'invoicing',
    'inventory management',
    'repair shop software',
    'self-hosted',
  ],
  authors: [{ name: 'TorqVoice' }],
  creator: 'TorqVoice',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    siteName: 'TorqVoice',
    title: 'TorqVoice - Workshop Management Platform',
    description:
      'Self-hosted workshop management platform for automotive service businesses. Manage work orders, invoices, customers, inventory, and vehicle service history.',
    images: [
      {
        url: '/images/torqvoice_opengraph.png',
        width: 1200,
        height: 630,
        alt: 'TorqVoice - Workshop Management Platform',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'TorqVoice - Workshop Management Platform',
    description:
      'Self-hosted workshop management platform for automotive service businesses. Manage work orders, invoices, customers, inventory, and vehicle service history.',
    images: ['/images/torqvoice_opengraph.png'],
  },
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const locale = await getLocale()
  const messages = await getMessages()
  // Staff only, deliberately. This layout also wraps the invoice, quote and
  // portal pages a workshop's own customers open, and those carry the
  // workshop's branding, not ours. A white-label licence exists precisely so
  // Torqvoice does not appear on that paperwork, and a platform notice there
  // would be both off-brand and none of the customer's business.
  const pathname = (await headers()).get('x-pathname')
  const broadcast = isCustomerFacingPath(pathname) ? null : await getBroadcast()

  return (
    <html lang={locale} translate="no" suppressHydrationWarning>
      <head>
        <meta name="google" content="notranslate" />
        <meta name="theme-color" content="#09090b" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var c=document.documentElement.classList;var p=location.pathname;if(p.indexOf('/share/')===0||p.indexOf('/portal')===0){c.add('light');return}var M={light:'light',dark:'dark',graphite:'light',ocean:'light',forest:'light',midnight:'dark',carbon:'dark'};var t=localStorage.getItem('torqvoice-theme')||'dark';if(t==='system'){t=matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light'}var m=M[t];if(!m){t='dark';m='dark'}c.add(m);if(t!==m){c.add('theme-'+t)}var f=localStorage.getItem('torqvoice-font');if(f==='workshop'||f==='precise'||f==='legible'){c.add('font-set-'+f)}}catch(e){}})()`,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${plexSans.variable} ${plexMono.variable} ${barlowCondensed.variable} ${inter.variable} ${interTight.variable} ${jetBrainsMono.variable} ${atkinson.variable} ${atkinsonMono.variable} font-sans antialiased`}
      >
        <PostHogProvider
          enabled={isCloudMode() || isDemoMode}
          posthogKey={process.env.POSTHOG_KEY}
          posthogHost={process.env.POSTHOG_HOST}
        >
          <NextIntlClientProvider messages={messages}>
            <ThemeProvider defaultTheme="dark">
              <QueryProvider>
                <TooltipProvider>
                  {/* One strip at a time. These used to render independently
                      in three layouts, so a notice and a new-version note
                      pushed the app down by two bars at once. */}
                  <BannerSlotProvider>
                    <BroadcastBanner broadcast={broadcast} />
                    <DemoBanner isDemo={isDemoMode} />
                    {children}
                  </BannerSlotProvider>
                  <GlassModal />
                  <UpgradeGateDialog />
                  {/* Centred at the bottom, and lifted clear of the mobile
                      bottom nav so a toast never lands on the tab bar. */}
                  <Toaster
                    richColors
                    position="bottom-center"
                    mobileOffset={{ bottom: 'calc(4.5rem + env(safe-area-inset-bottom))' }}
                  />
                  <PWAServiceWorker />
                </TooltipProvider>
              </QueryProvider>
            </ThemeProvider>
          </NextIntlClientProvider>
        </PostHogProvider>
      </body>
    </html>
  )
}
