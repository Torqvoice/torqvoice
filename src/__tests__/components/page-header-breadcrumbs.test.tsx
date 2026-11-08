import { cleanup, render, screen } from '@testing-library/react'
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

/** The crumbs in the header, in order. */
function crumbs() {
  return Array.from(
    document.querySelectorAll('[data-slot="breadcrumb-link"], [data-slot="breadcrumb-page"]')
  ).map((el) => el.textContent)
}

/** A page that sits at the top level is named once, not as "Reports > Reports". */
describe('top-level breadcrumbs', () => {
  it('names the reports page once', () => {
    pathname = '/reports'
    render(<PageHeader />)
    expect(crumbs()).toEqual(['Reports'])
  })

  it.each([
    '/',
    '/vehicles',
    '/customers',
    '/work-orders',
    '/quotes',
    '/billing',
    '/inventory',
    '/reports',
    '/timesheets',
    '/reminders',
    '/work-board',
    '/audit-log',
    '/tire-hotel',
  ])('never repeats the crumb before it on %s', (path) => {
    pathname = path
    render(<PageHeader />)
    const names = crumbs()
    expect(names.length).toBeGreaterThan(0)
    names.slice(1).forEach((name, i) => expect(name).not.toBe(names[i]))
    cleanup()
  })
})

/** Calendar, Messages, Inspections and four more fell through to "Home". */
describe('pages outside settings', () => {
  it.each([
    ['/calendar', ['Calendar']],
    ['/messages', ['Messages']],
    ['/inspections', ['Inspections']],
    ['/inspections/insp-1', ['Inspections', 'Inspection Details']],
    ['/labor-presets', ['Labor Presets']],
    ['/sales/rec-1', ['Work Orders', 'Service Details']],
  ])('%s says where you are', (path, expected) => {
    pathname = path
    render(<PageHeader />)
    expect(crumbs()).toEqual(expected)
    expect(screen.queryByText('Home')).toBeNull()
    cleanup()
  })
})
