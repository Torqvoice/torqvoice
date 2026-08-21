import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages } from 'next-intl/server'
import { Toaster } from '@/components/ui/sonner'
import { ThemeProvider } from '@/components/theme-provider'
import { QueryProvider } from '@/lib/query-provider'
import { GlassModal } from '@/components/glass-modal'
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

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin', 'latin-ext'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin', 'latin-ext'],
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
            __html: `(function(){try{var c=document.documentElement.classList;var p=location.pathname;if(p.indexOf('/share/')===0||p.indexOf('/portal')===0){c.add('light');return}var M={light:'light',dark:'dark',graphite:'light',ocean:'light',forest:'light',midnight:'dark',carbon:'dark'};var t=localStorage.getItem('torqvoice-theme')||'dark';if(t==='system'){t=matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light'}var m=M[t];if(!m){t='dark';m='dark'}c.add(m);if(t!==m){c.add('theme-'+t)}}catch(e){}})()`,
          }}
        />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}>
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
                  <Toaster richColors position="bottom-right" />
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
