'use client'

import { useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { WifiOff, Wrench } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { reportError } from '@/lib/analytics'
import { isNetworkError } from '@/lib/network-error'

interface ErrorPageProps {
  error: Error & { digest?: string }
  reset?: () => void
  /** Next's reset that also fetches the page from the server again. */
  retry?: () => void
}

// biome-ignore lint/suspicious/noShadowRestrictedNames: Next.js error boundary convention
export default function Error({ error, reset, retry }: ErrorPageProps) {
  const t = useTranslations('common')
  const lostConnection = isNetworkError(error)

  useEffect(() => {
    // A dropped connection is the network, not a crash: nothing to report
    if (lostConnection) {
      console.warn(error)
      return
    }
    console.error(error)
    // The digest finds the error in the server log when the server threw it
    reportError(error, { error_page: 'page', digest: error.digest ?? null })
  }, [error, lostConnection])

  if (lostConnection) {
    return <ConnectionLost onRetry={retry ?? reset ?? (() => window.location.reload())} />
  }

  return (
    <div className="grid-bg flex min-h-screen items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 h-96 w-96 rounded-full bg-destructive/10 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 h-96 w-96 rounded-full bg-destructive/5 blur-3xl" />
      </div>

      <div className="glass relative z-10 w-full max-w-md rounded-2xl p-8 text-center shadow-2xl">
        <div className="mb-6 inline-flex h-20 w-20 items-center justify-center rounded-full bg-destructive/10">
          <Wrench className="h-10 w-10 text-destructive" strokeWidth={1.5} />
        </div>

        <p className="mb-2 font-mono text-6xl font-bold tracking-tighter text-destructive">500</p>
        <h1 className="text-xl font-semibold tracking-tight">{t('errorPage.title')}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t('errorPage.description')}</p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          {/*
            A full reload, not reset(). reset() only drew the page again from
            what the tab already had, so an error from the server or from the
            tab's own state came straight back and the button did nothing:
            people pressed it over and over. A tab left open for days may also
            be on an old build, and only a reload brings the new one.
          */}
          <Button onClick={() => window.location.reload()}>{t('errorPage.tryAgain')}</Button>
          <Button variant="outline" asChild>
            <a href="/">{t('errorPage.backToDashboard')}</a>
          </Button>
        </div>
      </div>
    </div>
  )
}

/**
 * Shown instead of the 500 page when the page broke because the connection
 * dropped, in the words and look of the connection notice. Try again draws
 * the page again in place, which works once the connection is back; nothing
 * in the tab is wrong, so a reload is not needed.
 */
function ConnectionLost({ onRetry }: { onRetry: () => void }) {
  const t = useTranslations('common')

  return (
    <div className="grid-bg flex min-h-screen items-center justify-center p-4">
      <div className="glass relative w-full max-w-md overflow-hidden rounded-2xl p-8 text-center shadow-2xl">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-primary to-transparent"
        />
        <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-linear-to-b from-primary/15 to-primary/5 text-primary shadow-[inset_0_1px_0_rgb(255_255_255/0.15)] ring-1 ring-primary/25 ring-inset">
          <WifiOff className="h-7 w-7" strokeWidth={1.75} aria-hidden />
        </div>
        <h1 className="text-xl font-semibold tracking-tight">{t('connectionLost.title')}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t('connectionLost.description')}</p>
        <div className="mt-8 flex justify-center">
          <Button onClick={onRetry}>{t('errorPage.tryAgain')}</Button>
        </div>
      </div>
    </div>
  )
}
