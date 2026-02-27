import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages } from 'next-intl/server'
import { Toaster } from '@/components/ui/sonner'
import { ThemeProvider } from '@/components/theme-provider'
import { QueryProvider } from '@/lib/query-provider'
import { GlassModal } from '@/components/glass-modal'
import { TooltipProvider } from '@/components/ui/tooltip'
import './globals.css'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'),
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
    <html lang={locale} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('torqvoice-theme')||'dark';if(t==='system'){t=matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light'}document.documentElement.classList.add(t)}catch(e){}})()`,
          }}
        />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}>
        <NextIntlClientProvider messages={messages}>
          <ThemeProvider defaultTheme="dark">
            <QueryProvider>
              <TooltipProvider>
                {children}
                <GlassModal />
                <Toaster richColors position="bottom-right" />
              </TooltipProvider>
            </QueryProvider>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
