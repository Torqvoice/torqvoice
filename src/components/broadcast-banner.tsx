'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import { useTranslations } from 'next-intl'
import { AlertTriangle, Info, OctagonAlert, X } from 'lucide-react'
import type { Broadcast } from '@/lib/broadcast'
import { BANNER_PRIORITY, useBannerSlot } from './banner-slot'
import { getLiveBroadcast, subscribe } from './broadcast-store'

const STYLES = {
  info: 'bg-sky-500 text-sky-950',
  warning: 'bg-amber-500 text-amber-950',
  critical: 'bg-red-600 text-white',
} as const

const ICONS = {
  info: Info,
  warning: AlertTriangle,
  critical: OctagonAlert,
} as const

/**
 * Remembered per browser rather than per workshop or per account.
 *
 * Dismissing a notice is one person saying "I have read this", which is not
 * something they can decide on a colleague's behalf, and not something worth a
 * round trip or a column. Keyed on when the notice last changed, so editing it
 * brings it back for everybody, including the people who already waved the
 * previous one away.
 */
const DISMISSED_KEY = 'broadcast-dismissed'

/**
 * The platform-wide notice, set by a super admin.
 *
 * Rendered from the root layout, so it reaches the sign-in page and the public
 * links a customer opens, not only the app. During an outage the person who
 * cannot sign in is the one who most needs to know why.
 */
export function BroadcastBanner({
  broadcast: fromServer,
  preview = false,
}: {
  broadcast: Broadcast | null
  /**
   * Rendered inside the admin card rather than at the top of the page.
   *
   * A preview is not a page-level strip: it takes no part in the queue, reads
   * only what it is handed, and ignores what this browser has dismissed. The
   * admin needs to see the notice they are writing even if they closed the
   * last one.
   */
  preview?: boolean
}) {
  const t = useTranslations('common.broadcast')

  // A notice posted while this page was already open arrives over the socket.
  // Undefined means none has, so what the page loaded with still stands; null
  // means one was explicitly cleared.
  const live = useSyncExternalStore(
    subscribe,
    getLiveBroadcast,
    () => undefined as Broadcast | null | undefined
  )
  const broadcast = preview || live === undefined ? fromServer : live
  // Starts hidden and appears once the browser has been asked. Rendering it
  // first and hiding it a moment later would flash a stale outage notice at
  // somebody who dismissed it days ago.
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (preview) {
      setVisible(true)
      return
    }
    if (!broadcast) return
    let seen: string | null = null
    try {
      seen = localStorage.getItem(DISMISSED_KEY)
    } catch {
      // Private mode, or storage disabled. Showing it is the safe way to be
      // wrong about a notice that matters.
    }
    setVisible(seen !== broadcast.updatedAt)
  }, [broadcast, preview])

  const mine = useBannerSlot(
    'broadcast',
    BANNER_PRIORITY.broadcast,
    !preview && Boolean(broadcast) && visible
  )

  if (!broadcast || !visible || (!preview && !mine)) return null

  const Icon = ICONS[broadcast.level]

  const dismiss = () => {
    setVisible(false)
    try {
      localStorage.setItem(DISMISSED_KEY, broadcast.updatedAt)
    } catch {
      // As above. It reappears on the next load, which is a smaller problem
      // than never showing it.
    }
  }

  return (
    <div
      // polite, not assertive: it is on screen and will not move, so there is
      // no reason to cut across whatever is being read.
      role="status"
      aria-live="polite"
      className={`flex items-center gap-2 px-4 py-1.5 text-xs font-medium ${STYLES[broadcast.level]}`}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-center">{broadcast.message}</p>
      <button
        type="button"
        onClick={dismiss}
        aria-label={t('dismiss')}
        title={t('dismiss')}
        className="shrink-0 rounded p-0.5 opacity-70 transition-opacity hover:opacity-100"
      >
        <X className="size-4" />
      </button>
    </div>
  )
}
