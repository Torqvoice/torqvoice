/**
 * Ticking customers in a list that loads more as it scrolls.
 *
 * The header box takes the customers loaded so far and says how many, a
 * bulk delete never reaches one that has not loaded, ticks stay while more
 * rows arrive, and another search or sort starts with nothing ticked.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfirmProvider } from '@/components/confirm-dialog'

const deleteCustomers = vi.fn()
const getCustomerRows = vi.fn()
const router = { push: vi.fn(), refresh: vi.fn() }

vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => '/customers',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/features/customers/Actions/customerActions', () => ({
  backfillCustomerNumbers: vi.fn(),
  deleteCustomer: vi.fn(),
  deleteCustomers: async (ids: string[]) => deleteCustomers(ids),
}))
vi.mock('@/features/customers/Actions/getCustomerRows', () => ({
  getCustomerRows: (input: unknown) => getCustomerRows(input),
}))
vi.mock('@/features/customers/Components/CustomerForm', () => ({ CustomerForm: () => null }))
vi.mock('@/features/import/Components/ImportWizard', () => ({ ImportWizard: () => null }))

import { CustomersClient } from '@/app/(authenticated)/customers/customers-client'

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

function customer(i: number) {
  return {
    id: `c${i}`,
    customerNumber: String(1000 + i),
    name: `Customer ${i}`,
    email: null,
    phone: null,
    address: null,
    company: null,
    taxId: null,
    taxExempt: false,
    notes: null,
    _count: { vehicles: 0 },
  }
}
// Small batches keep the render quick; the list does not care how big they are.
const all = Array.from({ length: 16 }, (_, i) => customer(i + 1))
const firstBatch = {
  rows: all.slice(0, 10),
  nextCursor: { v: ['x'], id: 'c10' },
  total: 16,
  renderId: 'render-1',
}

let client: QueryClient
function list(search = '') {
  return (
    <QueryClientProvider client={client}>
      <ConfirmProvider>
        <CustomersClient
          data={firstBatch}
          listScope="org-1"
          search={search}
          sortBy="name"
          sortOrder="asc"
        />
      </ConfirmProvider>
    </QueryClientProvider>
  )
}

/** The header box of the table. */
const headerBox = () => screen.getByRole('checkbox', { name: 'Select all 10 shown' })

beforeEach(() => {
  observers.length = 0
  vi.stubGlobal('IntersectionObserver', FakeObserver)
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  deleteCustomers.mockReset().mockResolvedValue({ success: true, data: { deleted: 0 } })
  getCustomerRows
    .mockReset()
    .mockResolvedValue({ success: true, data: { rows: all.slice(10), nextCursor: null } })
})

afterEach(() => {
  vi.unstubAllGlobals()
  client.clear()
})

describe('selecting customers in the scrolling list', () => {
  it('selects only the customers loaded so far, and says how many', async () => {
    render(list())
    expect(screen.getByText('10 of 16')).toBeInTheDocument()

    fireEvent.click(headerBox())
    expect(screen.getByText('10 selected')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Delete (10)' }))
    const question = await screen.findByRole('alertdialog')
    await act(async () => {
      fireEvent.click(within(question).getByRole('button', { name: 'Delete' }))
    })
    expect(deleteCustomers).toHaveBeenCalledWith(all.slice(0, 10).map((c) => c.id))
  })

  it('keeps the ticks while more rows load, and leaves the new ones unticked', async () => {
    render(list())
    fireEvent.click(headerBox())

    endInSight()
    // Each customer shows twice in jsdom: the phone card and the table row.
    await waitFor(() => expect(screen.getAllByText('Customer 16')).not.toHaveLength(0))

    expect(screen.getByText('10 selected')).toBeInTheDocument()
    const header = screen.getByRole('checkbox', { name: 'Select all 16 shown' })
    expect(header).toHaveAttribute('data-state', 'indeterminate')
    const newRow = screen.getAllByRole('checkbox', { name: 'Select Customer 16' })[0]
    expect(newRow).toHaveAttribute('data-state', 'unchecked')

    // Ticking the header again takes everything now loaded.
    fireEvent.click(header)
    expect(screen.getByText('16 selected')).toBeInTheDocument()
  })

  it('starts another search with nothing selected', () => {
    const { rerender } = render(list())
    fireEvent.click(screen.getAllByRole('checkbox', { name: 'Select Customer 3' })[0])
    expect(screen.getByText('1 selected')).toBeInTheDocument()

    rerender(list('volvo'))
    expect(screen.queryByText('1 selected')).not.toBeInTheDocument()
    expect(screen.getAllByRole('checkbox', { name: 'Select Customer 3' })[0]).toHaveAttribute(
      'data-state',
      'unchecked'
    )
  })
})
