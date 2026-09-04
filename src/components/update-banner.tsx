'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { X } from 'lucide-react'
import { markVersionSeen } from '@/features/users/Actions/versionActions'
import { BANNER_PRIORITY, useBannerSlot } from './banner-slot'

/**
 * How long the banner stays up when nobody touches it. Six hours is a full
 * working day of chances to read it; past that it has stopped being a notice
 * and become part of the header.
 */
const AUTO_DISMISS_MS = 6 * 60 * 60 * 1000

/** `<version>|<epoch ms>`: when this release's banner first appeared here. */
const FIRST_SEEN_KEY = 'update-banner-first-seen'

function firstSeenAt(version: string): number {
  try {
    const [seenVersion, at] = (localStorage.getItem(FIRST_SEEN_KEY) ?? '').split('|')
    return seenVersion === version ? Number(at) || 0 : 0
  } catch {
    // localStorage unavailable; the clock restarts on this visit
    return 0
  }
}

function rememberFirstSeen(version: string, at: number) {
  try {
    localStorage.setItem(FIRST_SEEN_KEY, `${version}|${at}`)
  } catch {
    // localStorage unavailable; the banner then runs its six hours from now
  }
}

/**
 * One-time "the app was updated" notice, shown when the running APP_VERSION
 * differs from the version stored on the user record. Dismissing (or opening
 * the release notes) stores the current version server-side, so the banner
 * appears exactly once per account per release, on any device.
 */
export function UpdateBanner({
  currentVersion,
  lastSeenVersion,
  releaseNotesUrl,
}: {
  currentVersion: string
  lastSeenVersion: string | null
  releaseNotesUrl: string
}) {
  const t = useTranslations('common.updateBanner')
  const [dismissed, setDismissed] = useState(false)

  const neverSeeded = lastSeenVersion === null
  const show =
    !dismissed &&
    !neverSeeded &&
    currentVersion !== 'development' &&
    lastSeenVersion !== currentVersion

  const acknowledge = useCallback(() => {
    setDismissed(true)
    markVersionSeen(currentVersion)
  }, [currentVersion])

  // First load ever for this account: seed silently so a brand-new user is
  // not greeted with "what's new" for a version they never used.
  useEffect(() => {
    if (neverSeeded && currentVersion !== 'development') {
      markVersionSeen(currentVersion)
    }
  }, [neverSeeded, currentVersion])

  // Hardly anyone presses the X, so the banner otherwise rides along until the
  // next release. Six hours after it first appeared it acknowledges itself.
  // The clock lives in this browser, but the acknowledgement is the same
  // server-side write as the X, so it clears the banner on every device.
  useEffect(() => {
    if (!show) return

    const now = Date.now()
    let since = firstSeenAt(currentVersion)
    if (!since) {
      since = now
      rememberFirstSeen(currentVersion, now)
    }

    const remaining = since + AUTO_DISMISS_MS - now
    if (remaining <= 0) {
      acknowledge()
      return
    }

    // Also covers a tab left open across the deadline.
    const timer = setTimeout(acknowledge, remaining)
    return () => clearTimeout(timer)
  }, [show, currentVersion, acknowledge])

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
