'use client'

import { useTranslations } from 'next-intl'
import { useEffect } from 'react'
import { toast } from 'sonner'

const TOAST_ID = 'app-update'
/**
 * The header Next's server puts on its answer to a server action it does not
 * have, which is what an old tab's actions get after a deploy. Next's client
 * reads it and throws, but callers catch that error to show their own message,
 * so the header is watched instead: it is seen on every action call, caught
 * or not.
 */
export const ACTION_NOT_FOUND_HEADER = 'x-nextjs-action-not-found'
/** How often an open tab asks which build is running */
const POLL_MS = 5 * 60 * 1000
/** A tab coming back to the front asks at most this often */
const FOCUS_MIN_GAP_MS = 30 * 1000

/**
 * The error Next.js throws in the browser when a server action of this page
 * is not on the server any more. Matched by name and text rather than with
 * unstable_isUnrecognizedActionError, which is an unstable export.
 */
export function isOutdatedActionError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return (
    error.name === 'UnrecognizedActionError' ||
    /Server Action .* was not found on the server|Failed to find Server Action/.test(error.message)
  )
}

/**
 * Notices a deploy while a page is open and offers a reload. Without it a tab
 * left open for days keeps the old build: its saves call server actions that
 * are gone, and a click on a link waits for a whole page render before Next
 * gives up and reloads, with nothing on screen in between.
 */
export function UpdateWatcher({ version }: { version: string }) {
  const t = useTranslations('common.appUpdated')

  useEffect(() => {
    if (version === 'development' || version === 'unknown') return

    let shown = false
    let lastCheck = 0

    const show = () => {
      if (shown) return
      shown = true
      toast(t('title'), {
        id: TOAST_ID,
        description: t('description'),
        duration: Number.POSITIVE_INFINITY,
        action: { label: t('reload'), onClick: () => window.location.reload() },
      })
    }

    const check = async () => {
      if (shown) return
      lastCheck = Date.now()
      try {
        const response = await fetch('/api/public/version', { cache: 'no-store' })
        if (!response.ok) return
        const { version: running } = (await response.json()) as { version?: string }
        if (running && running !== 'unknown' && running !== version) show()
      } catch {
        // Offline or mid-deploy: the next check will tell
      }
    }

    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastCheck > FOCUS_MIN_GAP_MS) {
        void check()
      }
    }
    // A fallback for a Next version that stops sending the header
    const onRejection = (event: PromiseRejectionEvent) => {
      if (isOutdatedActionError(event.reason)) show()
    }

    // Next's router calls the global fetch for every server action, so this
    // sees each answer. It only looks at the headers; the response is handed
    // back untouched.
    const originalFetch = window.fetch
    const watchedFetch: typeof window.fetch = async (input, init) => {
      const response = await originalFetch.call(window, input, init)
      if (response.headers.get(ACTION_NOT_FOUND_HEADER) === '1') show()
      return response
    }
    window.fetch = watchedFetch

    const timer = window.setInterval(check, POLL_MS)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    window.addEventListener('unhandledrejection', onRejection)
    return () => {
      // Put fetch back only if nothing else replaced it in the meantime
      if (window.fetch === watchedFetch) window.fetch = originalFetch
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [version, t])

  return null
}
