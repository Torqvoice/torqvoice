'use client'

import { useTranslations } from 'next-intl'
import { useEffect } from 'react'
import { WifiOff } from 'lucide-react'
import { showNotice } from '@/components/notice-toast'
import { isNetworkError } from '@/lib/network-error'

const TOAST_ID = 'connection-lost'

/**
 * How long after a click or a keystroke a request that never arrived is
 * taken to be the person's own. On a weak connection a save can take several
 * seconds to fail, so this is generous. A request the page makes by itself,
 * such as when a laptop wakes up on another network, has nobody waiting for
 * it and stays quiet.
 */
export const RECENT_INPUT_MS = 60 * 1000

export { isNetworkError }

/**
 * Says so when something the person just did did not reach the server.
 *
 * A server action that cannot reach the server throws instead of returning a
 * result, and most screens only handle the result: the error they would show
 * is never reached, the row they deleted stays, and nothing on screen says
 * why. This catches what no screen caught, the same way UpdateWatcher
 * catches an action of an older build.
 */
export function ConnectionWatcher() {
  const t = useTranslations('common.connectionLost')
  const tDismiss = useTranslations('common.updateBanner')

  useEffect(() => {
    let lastInputAt = Number.NEGATIVE_INFINITY

    const onInput = () => {
      lastInputAt = Date.now()
    }

    const onRejection = (event: PromiseRejectionEvent) => {
      if (!isNetworkError(event.reason)) return
      if (Date.now() - lastInputAt > RECENT_INPUT_MS) return
      showNotice({
        id: TOAST_ID,
        icon: WifiOff,
        title: t('title'),
        description: t('description'),
        dismissLabel: tDismiss('dismiss'),
      })
    }

    // A screen reader can press a button with a click alone, no pointer or
    // key before it, so the click counts as well
    const inputEvents = ['pointerdown', 'keydown', 'click'] as const
    for (const type of inputEvents) window.addEventListener(type, onInput, { capture: true })
    window.addEventListener('unhandledrejection', onRejection)
    return () => {
      for (const type of inputEvents) window.removeEventListener(type, onInput, { capture: true })
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [t, tDismiss])

  return null
}
