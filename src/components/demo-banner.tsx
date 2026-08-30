'use client'

import { useTranslations } from 'next-intl'
import { BANNER_PRIORITY, useBannerSlot } from './banner-slot'

/**
 * Permanent context for the public demo.
 *
 * Takes `isDemo` as a prop rather than reading it: DEMO_MODE has no
 * NEXT_PUBLIC prefix, so it is server-only, and this became a client component
 * in order to queue behind a platform notice rather than stack under one.
 */
export function DemoBanner({ isDemo }: { isDemo: boolean }) {
  const t = useTranslations('common.shared')
  const mine = useBannerSlot('demo', BANNER_PRIORITY.demo, isDemo)

  if (!isDemo || !mine) return null

  return (
    <div className="bg-amber-500 text-center text-xs font-medium text-amber-950 py-1.5 px-4">
      Demo instance — data resets every few hours. Outgoing email, SMS, Telegram and team invites
      are disabled.{' '}
      <a
        href="https://torqvoice.com/docs/installation"
        className="underline underline-offset-2 hover:text-amber-900"
      >
        {t('installOwn')} →
      </a>
    </div>
  )
}
