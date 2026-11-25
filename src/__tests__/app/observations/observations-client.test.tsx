/**
 * The observations list shows open observations unless told otherwise, and
 * its status dropdown says so. Picking "All statuses" has to stay in the
 * address as ?status=all, or the page would read the missing status as
 * "Open" again and the choice would not stick.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const router = { push: vi.fn(), refresh: vi.fn() }
let searchParams = new URLSearchParams()

vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => '/observations',
  useSearchParams: () => searchParams,
}))

// The first batch is all there is here; nothing more is asked for.
vi.mock('@/features/vehicles/Actions/getObservationRows', () => ({
  getObservationRows: vi.fn(),
}))

import { ObservationsClient } from '@/app/(authenticated)/observations/observations-client'

function renderList(statusFilter: string) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ObservationsClient
        data={{ rows: [], nextCursor: null, total: 0 }}
        search=""
        statusFilter={statusFilter}
        severityFilter="all"
      />
    </QueryClientProvider>
  )
}

/** The status dropdown is the first of the two. */
const statusDropdown = () => screen.getAllByRole('combobox')[0]

async function pickStatus(name: string) {
  fireEvent.keyDown(statusDropdown(), { key: 'Enter' })
  fireEvent.click(await screen.findByRole('option', { name }))
}

beforeEach(() => {
  router.push.mockReset()
  searchParams = new URLSearchParams()
  // Radix Select asks for these, which jsdom does not have.
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= vi.fn()
  Element.prototype.scrollIntoView ??= vi.fn()
})

describe('the observations status filter', () => {
  it('keeps "All statuses" in the address, since no status means open', async () => {
    renderList('open')
    expect(statusDropdown()).toHaveTextContent('Open')

    await pickStatus('All Statuses')
    expect(router.push).toHaveBeenCalledWith('/observations?status=all')
  })

  it('drops the status from the address when going back to open', async () => {
    searchParams = new URLSearchParams('status=all')
    renderList('all')
    expect(statusDropdown()).toHaveTextContent('All Statuses')

    await pickStatus('Open')
    expect(router.push).toHaveBeenCalledWith('/observations?')
  })
})
