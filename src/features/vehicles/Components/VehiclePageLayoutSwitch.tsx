'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { track } from '@/lib/analytics'
import { rememberVehiclePageLayout, type VehiclePageLayout } from '@/lib/vehicle-page-layout'

const DISMISSED_KEY = 'torqvoice:vehiclePageInviteDismissed'
/** Set when somebody moves to the new page, until they have been shown the way back. */
const BACK_HINT_KEY = 'torqvoice:vehiclePageBackHint'

/**
 * Moves this browser to the other vehicle page: the choice goes in a cookie
 * the server reads, and the page renders again in that layout.
 */
export function useSwitchVehiclePageLayout() {
  const router = useRouter()
  return (layout: VehiclePageLayout, source: 'invite' | 'menu') => {
    rememberVehiclePageLayout(layout)
    // Whoever tries the new page is shown where the way back is, once.
    try {
      if (layout === 'modern') localStorage.setItem(BACK_HINT_KEY, 'true')
      else localStorage.removeItem(BACK_HINT_KEY)
    } catch {
      // Private mode: no pointer, and the menu item is still there.
    }
    track('vehicle_page:layout_switch', { to_layout: layout, source })
    router.refresh()
  }
}

/**
 * Counts a vehicle page opened, in the layout it was drawn in. Draws nothing.
 *
 * This is what says when the classic page can go: once the views with
 * `layout: classic` have dried up, nobody is left on it. `layout_chosen`
 * tells a workshop that went back to classic on purpose from one that is
 * there only because it predates the new page and never tried it.
 *
 * One event per vehicle and layout: moving between the page's lists renders
 * the page again without counting another visit, and switching layout counts
 * the view of the page it switched to.
 */
export function VehiclePageViewed({
  vehicleId,
  layout,
  chosen,
}: {
  vehicleId: string
  layout: VehiclePageLayout
  chosen: boolean
}) {
  // The vehicle is why the effect runs again, not something to send.
  useEffect(() => {
    track('vehicle_page:page_view', { layout, layout_chosen: chosen })
  }, [vehicleId, layout, chosen])
  return null
}

/**
 * The invitation on the classic vehicle page. Hiding it is remembered in this
 * browser; the way in stays in the page's menu for whoever changes their mind.
 *
 * Drawn only after mount: whether it was hidden is in localStorage, which the
 * server cannot see, and a banner that rendered and then vanished on
 * hydration would push the page down and back.
 */
export function TryNewVehiclePageBanner() {
  const t = useTranslations('vehicles.detail.layout')
  const switchLayout = useSwitchVehiclePageLayout()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    try {
      setVisible(localStorage.getItem(DISMISSED_KEY) !== 'true')
    } catch {
      setVisible(true)
    }
  }, [])

  if (!visible) return null

  const hide = () => {
    setVisible(false)
    track('vehicle_page:layout_invite_dismiss')
    try {
      localStorage.setItem(DISMISSED_KEY, 'true')
    } catch {
      // Private mode: it comes back next visit, which is no harm.
    }
  }

  return (
    <div
      data-testid="try-new-vehicle-page"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-primary/25 bg-primary/10 px-4 py-2.5"
    >
      <Sparkles className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-sm">
        <span className="font-medium">{t('inviteTitle')}</span>{' '}
        <span className="text-muted-foreground">{t('inviteBody')}</span>
      </p>
      <Button
        type="button"
        size="sm"
        className="h-8"
        onClick={() => switchLayout('modern', 'invite')}
      >
        {t('tryIt')}
      </Button>
      <button
        type="button"
        onClick={hide}
        aria-label={t('hideInvite')}
        title={t('hideInvite')}
        className="cursor-pointer rounded-md p-1 text-muted-foreground transition-colors hover:bg-background/60 hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

/**
 * Whether to point at the way back to the classic page: only on the first
 * visit after somebody chose the new one, never for a workshop that started
 * on it. Read after mount, as the invitation's flag is.
 */
export function useVehiclePageBackHint() {
  const [show, setShow] = useState(false)
  useEffect(() => {
    try {
      setShow(localStorage.getItem(BACK_HINT_KEY) === 'true')
    } catch {
      setShow(false)
    }
  }, [])
  const dismiss = () => {
    setShow(false)
    try {
      localStorage.removeItem(BACK_HINT_KEY)
    } catch {
      // Nothing to clear.
    }
  }
  return { show, dismiss }
}
