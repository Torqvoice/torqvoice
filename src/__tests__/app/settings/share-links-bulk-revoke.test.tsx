/**
 * Removing several share links at once, now that the list loads as it
 * scrolls. The header box ticks the links loaded so far; links that arrive
 * later come unticked, the ticks already made stay, and Remove selected
 * removes exactly the ticked ones.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfirmProvider } from '@/components/confirm-dialog'

const getShareLinkRows = vi.fn()
const revokeShareLinks = vi.fn()
const router = { push: vi.fn(), refresh: vi.fn() }

vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => '/settings/share-links',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/features/share-links/Actions/getShareLinkRows', () => ({
  getShareLinkRows: (input: unknown) => getShareLinkRows(input),
}))
vi.mock('@/features/share-links/Actions/revokeShareLinks', () => ({
  revokeShareLinks: (input: unknown) => revokeShareLinks(input),
}))
vi.mock('@/features/settings/Actions/settingsActions', () => ({ setSettings: vi.fn() }))
vi.mock('@/features/vehicles/Actions/serviceActions', () => ({ revokePublicLink: vi.fn() }))
vi.mock('@/features/quotes/Actions/quoteShareActions', () => ({ revokeQuotePublicLink: vi.fn() }))
vi.mock('@/features/inspections/Actions/inspectionShareActions', () => ({
  revokeInspectionPublicLink: vi.fn(),
}))
// The expiry cell is its own control; here it only has to stay out of the way.
vi.mock('@/features/share-links/Components/ShareExpiryControl', () => ({
  ShareExpiryControl: () => null,
  useShareExpiryText: () => () => '',
}))

import { ShareLinksSettings } from '@/app/(authenticated)/settings/share-links/share-links-settings'

// The end of the list coming into sight is an IntersectionObserver's call.
const observers: { callback: IntersectionObserverCallback; observer: IntersectionObserver }[] = []
class FakeObserver {
  constructor(public callback: IntersectionObserverCallback) {
    observers.push({ callback, observer: this as unknown as IntersectionObserver })
  }
  observe() {
    // The test says when the end is in sight.
  }
  unobserve() {
    // As above.
  }
  disconnect() {
    // As above.
  }
  takeRecords() {
    return []
  }
}

function endInSight() {
  act(() => {
    for (const { callback, observer } of observers) {
      callback([{ isIntersecting: true } as IntersectionObserverEntry], observer)
    }
  })
}

function link(i: number) {
  return {
    kind: 'invoice' as const,
    id: `inv-${String(i).padStart(3, '0')}`,
    token: `t${i}`,
    label: `INV-${i}`,
    detail: '',
    customer: 'Kari Nordmann',
    href: `/sales/inv-${i}`,
    sharedAt: new Date(Date.UTC(2026, 10, 1, 0, 0, 200 - i)).toISOString(),
    viewCount: 0,
    expiry: { expired: false } as never,
  }
}

const first = {
  organizationId: 'org-1',
  rows: Array.from({ length: 50 }, (_, i) => link(i)),
  nextCursor: { v: [link(49).sharedAt], id: 'invoice:inv-049' },
  total: 70,
  counts: { active: 70, expired: 0 },
}
const second = {
  organizationId: 'org-1',
  rows: Array.from({ length: 20 }, (_, i) => link(50 + i)),
  nextCursor: null,
}

const RULES = {
  invoice: { mode: 'never', days: 30 },
  quote: { mode: 'never', days: 30 },
  inspection: { mode: 'never', days: 30 },
} as const

type Filters = { status: string; kind: string; search: string }
const ALL: Filters = { status: 'active', kind: 'all', search: '' }

function renderPage() {
  const client = new QueryClient()
  const page = (links: typeof first, filters: Filters) => (
    <QueryClientProvider client={client}>
      <ConfirmProvider>
        <ShareLinksSettings
          rules={RULES}
          links={links}
          baseUrl="https://app.example"
          filters={filters}
        />
      </ConfirmProvider>
    </QueryClientProvider>
  )
  const view = render(page(first, ALL))
  return {
    /** The server page again, as a filter, search or sort change renders it. */
    show: (filters: Filters) => view.rerender(page({ ...first, rows: [...first.rows] }, filters)),
  }
}

beforeEach(() => {
  observers.length = 0
  vi.stubGlobal('IntersectionObserver', FakeObserver)
  getShareLinkRows.mockReset()
  revokeShareLinks.mockReset()
  getShareLinkRows.mockResolvedValue({ success: true, data: second })
  revokeShareLinks.mockResolvedValue({ success: true, data: { removed: 50 } })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// Seventy rows, each a table row and a card, are slow to render under a busy test run.
describe('bulk revoke on a list that loads as it scrolls', () => {
  it('ticks the links loaded so far and keeps the ticks when more arrive', async () => {
    renderPage()
    expect(screen.getByText('50 of 70')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all links shown' }))
    expect(screen.getByText('50 links selected')).toBeInTheDocument()

    endInSight()
    expect(await screen.findAllByText('INV-69')).not.toHaveLength(0)
    expect(getShareLinkRows).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'active', cursor: first.nextCursor })
    )

    // The new rows come unticked; the old ticks stay.
    expect(screen.getByText('50 links selected')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Select all links shown' })).toHaveAttribute(
      'data-state',
      'indeterminate'
    )

    fireEvent.click(screen.getByRole('button', { name: 'Remove selected' }))
    const question = await screen.findByRole('alertdialog')
    await act(async () => {
      fireEvent.click(within(question).getByRole('button', { name: 'Remove selected' }))
    })

    const sent = revokeShareLinks.mock.calls[0][0].links as { id: string }[]
    expect(sent).toHaveLength(50)
    expect(sent.map((l) => l.id)).toEqual(first.rows.map((r) => r.id))
    expect(router.refresh).toHaveBeenCalled()
  }, 20_000)

  it('ticks all seventy once they are all loaded', async () => {
    renderPage()
    endInSight()
    expect(await screen.findAllByText('INV-69')).not.toHaveLength(0)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all links shown' }))
    expect(screen.getByText('70 links selected')).toBeInTheDocument()
  }, 20_000)

  // The rows below are all invoices, so the invoice filter shows the very
  // same links: the ticks must still go, as they do on every other list.
  it.each([
    ['a filter', { ...ALL, kind: 'invoice' }],
    ['a status', { ...ALL, status: 'all' }],
    ['a search', { ...ALL, search: 'INV-1' }],
  ])(
    'clears the ticks when %s changes',
    async (_, filters) => {
      const page = renderPage()
      fireEvent.click(screen.getByRole('checkbox', { name: 'Select all links shown' }))
      expect(screen.getByText('50 links selected')).toBeInTheDocument()

      page.show(filters)

      expect(screen.queryByText(/links? selected/)).not.toBeInTheDocument()
      expect(screen.getByRole('checkbox', { name: 'Select all links shown' })).toHaveAttribute(
        'data-state',
        'unchecked'
      )
      for (const box of screen.getAllByRole('checkbox', { name: 'Select the link to INV-3' })) {
        expect(box).toHaveAttribute('data-state', 'unchecked')
      }
    },
    20_000
  )
})
