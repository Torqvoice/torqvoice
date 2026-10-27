'use client'

import { useTranslations } from 'next-intl'
import { useEffect } from 'react'
import { toast } from 'sonner'

const UPDATE_EVENT = 'torqvoice:update-available'
const TOAST_ID = 'app-update'
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
 * True when the error says the tab runs code of an older build: a server
 * action it calls no longer exists on the server. The reload toast is shown
 * too, so a caller only has to skip its own error message.
 */
export function reportIfOutdated(error: unknown): boolean {
  if (!isOutdatedActionError(error)) return false
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(UPDATE_EVENT))
  return true
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
    const onRejection = (event: PromiseRejectionEvent) => {
      if (isOutdatedActionError(event.reason)) show()
    }

    const timer = window.setInterval(check, POLL_MS)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    window.addEventListener('unhandledrejection', onRejection)
    window.addEventListener(UPDATE_EVENT, show)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
      window.removeEventListener('unhandledrejection', onRejection)
      window.removeEventListener(UPDATE_EVENT, show)
    }
  }, [version, t])

  return null
}
