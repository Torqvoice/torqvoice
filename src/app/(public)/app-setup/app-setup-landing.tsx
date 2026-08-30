'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { useTranslations } from 'next-intl'
import { Download, Smartphone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PLAY_STORE_URL } from '@/lib/app-links'

/**
 * Reads the code out of the fragment and tells the technician what to do.
 *
 * The fragment, deliberately: it never leaves the browser, so the code stays
 * out of server logs, out of any Referer, and out of the analytics on this
 * page. That also means this has to be a client component, because the server
 * rendering it cannot see the code at all.
 */
export function AppSetupLanding() {
  const t = useTranslations('settings')
  const [code, setCode] = useState<string | null>(null)

  useEffect(() => {
    const raw = decodeURIComponent(window.location.hash.replace(/^#/, '')).trim()
    // Only what a code can look like. A fragment carrying anything else is
    // not something to render back onto the page.
    setCode(/^[A-Z0-9]{6,12}$/i.test(raw) ? raw.toUpperCase() : null)
  }, [])

  const display = code ? `${code.slice(0, 4)}-${code.slice(4)}` : null

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-6">
      <div className="rounded-xl border bg-background p-6 shadow-sm">
        <div className="flex items-center gap-3 border-b pb-4">
          <Image
            src="/torqvoice_app_logo.png"
            alt="Torqvoice"
            width={32}
            height={32}
            className="object-contain"
          />
          <span className="font-bold text-lg uppercase tracking-wider">Torqvoice</span>
        </div>

        <h1 className="pt-6 font-semibold text-xl">{t('team.setupPageTitle')}</h1>
        <p className="pt-2 text-muted-foreground text-sm">{t('team.setupPageBody')}</p>

        {display && (
          <div className="mt-6 rounded-lg border bg-muted/40 p-4 text-center">
            <p className="text-muted-foreground text-xs">{t('team.setupPageCode')}</p>
            <p className="pt-1 font-mono font-semibold text-2xl tracking-[0.2em]">{display}</p>
          </div>
        )}

        {/* Opens the app when it is installed, and does nothing visible when it
            is not, which is why the instruction above stands on its own and
            this is the second thing on the page rather than the first. */}
        {code && (
          <Button
            className="mt-4 w-full"
            onClick={() => {
              window.location.href = `torqvoicetech://setup-code?code=${encodeURIComponent(code)}&url=${encodeURIComponent(window.location.origin)}`
            }}
          >
            <Smartphone className="mr-2 h-4 w-4" />
            {t('team.setupPageOpenApp')}
          </Button>
        )}

        {/* For a phone that does not have it yet. The button above opens the
            app and does nothing visible when it is missing, which is exactly
            the moment somebody needs this. */}
        <a
          href={PLAY_STORE_URL}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-2 text-muted-foreground text-sm underline underline-offset-4 hover:text-foreground"
        >
          <Download className="h-4 w-4" />
          {t('team.setupPageInstall')}
        </a>

        <p className="pt-6 text-muted-foreground text-xs">{t('team.setupPageExpiry')}</p>
      </div>
    </div>
  )
}
