import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

let pathname = '/settings'
vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('@/components/ui/sidebar', () => ({ SidebarTrigger: () => null }))
vi.mock('@/components/plate-lookup-context', () => ({
  openPlateLookup: vi.fn(),
  usePlateLookupAccess: () => false,
}))
vi.mock('@/components/white-label-cta-context', () => ({ useShowWhiteLabelCta: () => false }))
vi.mock('@/components/license-expiry-context', () => ({
  useLicenseExpiry: () => ({
    daysUntilExpiry: null,
    unverifiedDaysLeft: null,
    dismissed: false,
    dismiss: vi.fn(),
  }),
}))
vi.mock('@/components/banner-slot', () => ({
  BANNER_PRIORITY: { licence: 1 },
  useBannerSlot: () => false,
}))
vi.mock('@/components/quick-create-menu', () => ({ QuickCreateMenu: () => null }))
vi.mock('@/components/docs-link', () => ({ DocsLink: () => null }))
vi.mock('@/features/time-tracking/Components/RunningClockPill', () => ({
  RunningClockPill: () => null,
}))
vi.mock('@/components/service-type-context', () => ({ useServiceType: () => 'automotive' }))

import { PageHeader } from '@/components/page-header'

/**
 * Every settings page says where you are. Report Schedule, Alerts and ten more
 * were missing from the breadcrumb map, so the header read "Home" on them.
 */
describe('settings breadcrumbs', () => {
  beforeEach(() => {
    pathname = '/settings'
  })

  it('names a settings page the way the settings menu does', () => {
    pathname = '/settings/report-schedule'
    render(<PageHeader />)
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings')
    expect(screen.getByText('Report Schedule')).toBeInTheDocument()
    expect(screen.queryByText('Home')).toBeNull()
  })

  it('still says Settings on a settings page the menu does not list', () => {
    pathname = '/settings/telegram'
    render(<PageHeader />)
    expect(screen.getByText('Settings')).toBeInTheDocument()
    expect(screen.queryByText('Home')).toBeNull()
  })
})
