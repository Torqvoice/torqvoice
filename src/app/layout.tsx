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
import { DemoBanner } from '@/components/demo-banner'
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
        url: '/images/torqvoice_opengraph.jpg',
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
    images: ['/images/torqvoice_opengraph.jpg'],
  },
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const locale = await getLocale()
  const messages = await getMessages()

  return (
    <html lang={locale} translate="no" suppressHydrationWarning>
      <head>
        <meta name="google" content="notranslate" />
        <meta name="theme-color" content="#09090b" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{if(location.pathname.indexOf('/share/')===0||location.pathname.indexOf('/share/')>0){document.documentElement.classList.add('light');return}var t=localStorage.getItem('torqvoice-theme')||'dark';if(t==='system'){t=matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light'}document.documentElement.classList.add(t)}catch(e){}})()`,
          }}
        />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}>
        <PostHogProvider
          isCloud={isCloudMode()}
          posthogKey={process.env.POSTHOG_KEY}
          posthogHost={process.env.POSTHOG_HOST}
        >
          <NextIntlClientProvider messages={messages}>
            <ThemeProvider defaultTheme="dark">
              <QueryProvider>
                <TooltipProvider>
                  <DemoBanner />
                  {children}
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
