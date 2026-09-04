'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Maximize, Minimize } from 'lucide-react'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { useInstallPrompt } from '@/components/pwa-install-prompt'

/**
 * Kept in localStorage, not in workshop settings, unlike the feature hints.
 *
 * This one is genuinely per-device. The desk machine has a keyboard and other
 * windows to switch between; the tablet in the bay is held in one hand and
 * wants every pixel. The same person wants opposite answers on each, so a
 * workshop-wide setting would be wrong on one of them.
 */
const PREF_KEY = 'app-fullscreen'

/**
 * A refused fullscreen request is not worth reporting.
 *
 * The browser refuses for reasons the person cannot act on, such as a
 * permissions policy on an embedded install, and the button not visibly doing
 * anything says everything a toast would. The button's own state resyncs from
 * the fullscreenchange event either way.
 */
function ignoreRefusal() {
  return undefined
}

function prefersFullscreen(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) === 'true'
  } catch {
    return false
  }
}

/** Whether the browser offers fullscreen at all, and whether it is on now. */
function useFullscreenState() {
  const [supported, setSupported] = useState(false)
  const [active, setActive] = useState(false)

  useEffect(() => {
    setSupported(typeof document !== 'undefined' && document.fullscreenEnabled)
    const sync = () => setActive(document.fullscreenElement !== null)
    sync()
    document.addEventListener('fullscreenchange', sync)
    return () => document.removeEventListener('fullscreenchange', sync)
  }, [])

  return { supported, active }
}

/**
 * Fullscreen for the installed app.
 *
 * An installed web app cannot ask to launch fullscreen on a desktop: Chrome
 * and Edge honour the manifest's fullscreen display mode on Android and
 * ChromeOS, and fall back to a plain window everywhere else. The only route on
 * a desktop is the Fullscreen API, which needs a user gesture and so cannot
 * fire on load.
 *
 * So the preference is remembered and spent on the first gesture after launch:
 * open the app, click anything, and it fills the screen. That is as close to
 * "launches fullscreen" as the platform allows, and it stays honest about
 * needing the click rather than failing silently on load.
 *
 * Only ever automatic for the installed app. Doing this to a browser tab would
 * hijack the first click on a page somebody opened alongside others.
 *
 * Renders nothing. It lives apart from the menu item because that item sits
 * in a dropdown that is not mounted until somebody opens it, and the first
 * gesture after launch has to be caught before then.
 */
export function FullscreenLauncher() {
  const { installed } = useInstallPrompt()
  const { supported } = useFullscreenState()

  // Spend the remembered preference on the first click or keypress. Listening
  // once, in capture, so the gesture still reaches whatever was clicked.
  useEffect(() => {
    if (!installed || !supported) return
    if (!prefersFullscreen()) return
    if (document.fullscreenElement) return

    const enter = () => {
      void document.documentElement.requestFullscreen().catch(ignoreRefusal)
    }
    document.addEventListener('pointerdown', enter, { once: true, capture: true })
    document.addEventListener('keydown', enter, { once: true, capture: true })
    return () => {
      document.removeEventListener('pointerdown', enter, { capture: true })
      document.removeEventListener('keydown', enter, { capture: true })
    }
  }, [installed, supported])

  return null
}

/** The fullscreen switch, as an entry in the account menu. */
export function FullscreenMenuItem() {
  const t = useTranslations('common.shared')
  const { supported, active } = useFullscreenState()

  const toggle = useCallback(() => {
    if (document.fullscreenElement) {
      // Turning it off is also a decision: the next launch should respect it.
      try {
        localStorage.setItem(PREF_KEY, 'false')
      } catch {
        // Private mode, or storage disabled. The toggle still works for now.
      }
      void document.exitFullscreen().catch(ignoreRefusal)
      return
    }
    try {
      localStorage.setItem(PREF_KEY, 'true')
    } catch {
      // As above.
    }
    void document.documentElement.requestFullscreen().catch(ignoreRefusal)
  }, [])

  if (!supported) return null

  return (
    <DropdownMenuItem onClick={toggle}>
      {active ? <Minimize className="mr-2 size-4" /> : <Maximize className="mr-2 size-4" />}
      {active ? t('exitFullscreen') : t('enterFullscreen')}
    </DropdownMenuItem>
  )
}
