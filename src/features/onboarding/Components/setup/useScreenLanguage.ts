'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useTransition } from 'react'
import type { Locale } from '@/i18n/config'
import { setLocale } from '@/i18n/actions'

/**
 * Switches the language this person's screens are in, as the language menu on
 * the sign-up page does, and redraws the page in it. What the owner has
 * filled in so far stays: the wizard keeps its state across the refresh.
 */
export function useScreenLanguage() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const switchTo = useCallback(
    (locale: Locale) =>
      startTransition(async () => {
        const result = await setLocale(locale)
        if (result.success) router.refresh()
      }),
    [router]
  )
  return { switchTo, pending }
}
