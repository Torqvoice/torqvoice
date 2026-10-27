'use client'
import { useTranslations } from 'next-intl'
import { useEffect } from 'react'
import { toast } from 'sonner'
import { leaveForSignInNow, signInUrlFor } from '@/lib/signed-out'

const SIGNED_OUT_TOAST_ID = 'signed-out'

/**
 * Marks the account as online, and notices when its session is gone.
 *
 * The ping answers 401 once the session has run out or was signed out from
 * another device. Without this a tab left open for days still looks signed in,
 * and Next does not run the layout's sign-in redirect on a client navigation,
 * so clicks into the app showed nothing useful until a full reload. Checked on
 * mount, every minute and whenever the tab comes back to the front.
 */
export function OnlineTracker() {
  const t = useTranslations('common.signedOut')

  useEffect(() => {
    let lastInputAt = 0
    let signedOut = false

    const goToSignIn = () => {
      window.location.assign(signInUrlFor(window.location.pathname, window.location.search))
    }

    const onSignedOut = () => {
      if (signedOut) return
      signedOut = true
      if (leaveForSignInNow(lastInputAt, Date.now())) {
        goToSignIn()
        return
      }
      // Typing just now: a page change would lose it, so ask instead
      toast(t('title'), {
        id: SIGNED_OUT_TOAST_ID,
        description: t('description'),
        duration: Number.POSITIVE_INFINITY,
        action: { label: t('signIn'), onClick: goToSignIn },
      })
    }

    const ping = async () => {
      if (signedOut || document.visibilityState !== 'visible') return
      try {
        const response = await fetch('/api/protected/ping', { method: 'POST' })
        if (response.status === 401) onSignedOut()
      } catch {
        // Offline or mid-deploy: the next ping will tell
      }
    }

    const onInput = () => {
      lastInputAt = Date.now()
    }

    void ping()
    const interval = setInterval(ping, 60_000)
    document.addEventListener('visibilitychange', ping)
    window.addEventListener('keydown', onInput, { capture: true })
    window.addEventListener('input', onInput, { capture: true })

    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', ping)
      window.removeEventListener('keydown', onInput, { capture: true })
      window.removeEventListener('input', onInput, { capture: true })
    }
  }, [t])

  return null
}
