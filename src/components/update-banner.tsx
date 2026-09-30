'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { X } from 'lucide-react'
import { markUpdateBannerShown, markVersionSeen } from '@/features/users/Actions/versionActions'
import { decideUpdateBanner } from '@/lib/update-banner-rule'
import { BANNER_PRIORITY, useBannerSlot } from './banner-slot'

/**
 * The "the app was updated" strip, shown when the running APP_VERSION is a
 * minor or major release the account has not seen. A patch release says
 * nothing: it is recorded as seen and the next comparison starts from it.
 * The rule, and the hour the strip stays up, are in
 * lib/update-banner-rule.ts; this only draws what it decides.
 *
 * Dismissing (or opening the release notes) stores the version on the user
 * record, so the banner appears exactly once per account per release, on any
 * device. So does letting it expire: the clock is on the user record too,
 * started the first time this release's banner appeared anywhere.
 */
export function UpdateBanner({
  currentVersion,
  lastSeenVersion,
  shownVersion,
  shownAt,
  releaseNotesUrl,
}: {
  currentVersion: string
  lastSeenVersion: string | null
  /** The release the banner was last stamped as shown for, and when (ISO). */
  shownVersion: string | null
  shownAt: string | null
  releaseNotesUrl: string
}) {
  const t = useTranslations('common.updateBanner')
  const [dismissed, setDismissed] = useState(false)

  const neverSeeded = lastSeenVersion === null
  const decision = neverSeeded
    ? null
    : decideUpdateBanner(
        { lastSeenVersion, updateBannerVersion: shownVersion, updateBannerShownAt: shownAt },
        currentVersion
      )
  const show = !dismissed && decision?.kind === 'show'

  const acknowledge = useCallback(() => {
    setDismissed(true)
    markVersionSeen(currentVersion)
  }, [currentVersion])

  useEffect(() => {
    if (currentVersion === 'development') return
    // First load ever for this account: seed silently so a brand-new user is
    // not greeted with "what's new" for a version they never used. A patch
    // release, and a banner whose hour ran out while the app was closed,
    // are recorded the same way, without anything on screen.
    if (neverSeeded || decision?.kind === 'silent' || decision?.kind === 'expired') {
      if (lastSeenVersion !== currentVersion) markVersionSeen(currentVersion)
      return
    }
    if (decision?.kind === 'show' && decision.stamp) markUpdateBannerShown(currentVersion)
  }, [neverSeeded, decision?.kind, currentVersion, lastSeenVersion]) // eslint-disable-line react-hooks/exhaustive-deps -- `decision.stamp` follows `kind`

  // A tab left open across the deadline: the strip lets itself out, with the
  // same write the X makes, so it clears on every device.
  useEffect(() => {
    if (!show || decision?.kind !== 'show') return
    const timer = setTimeout(acknowledge, Math.max(0, decision.expiresAt - Date.now()))
    return () => clearTimeout(timer)
  }, [show, decision, acknowledge])

  // Last in the queue. Interesting, never urgent, and it waits behind an
  // outage notice rather than sitting under one.
  const mine = useBannerSlot('update', BANNER_PRIORITY.update, show)

  if (!show || !mine) return null

  return (
    <div className="relative bg-amber-500 px-8 py-1.5 text-center text-xs font-medium text-amber-950">
      {t('updated', { version: currentVersion })}{' '}
      <a
        href={releaseNotesUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={acknowledge}
        className="underline underline-offset-2 hover:text-amber-900"
      >
        {t('whatsNew')} →
      </a>
      <button
        type="button"
        onClick={acknowledge}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-amber-950/70 transition-colors hover:text-amber-950"
      >
        <X className="h-3.5 w-3.5" />
        <span className="sr-only">{t('dismiss')}</span>
      </button>
    </div>
  )
}
