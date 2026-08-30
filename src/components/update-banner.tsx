'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { X } from 'lucide-react'
import { markVersionSeen } from '@/features/users/Actions/versionActions'
import { BANNER_PRIORITY, useBannerSlot } from './banner-slot'

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

  // First load ever for this account: seed silently so a brand-new user is
  // not greeted with "what's new" for a version they never used.
  useEffect(() => {
    if (neverSeeded && currentVersion !== 'development') {
      markVersionSeen(currentVersion)
    }
  }, [neverSeeded, currentVersion])

  // Last in the queue. Interesting, never urgent, and it waits behind an
  // outage notice rather than sitting under one.
  const mine = useBannerSlot('update', BANNER_PRIORITY.update, show)

  if (!show || !mine) return null

  const acknowledge = () => {
    setDismissed(true)
    markVersionSeen(currentVersion)
  }

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
