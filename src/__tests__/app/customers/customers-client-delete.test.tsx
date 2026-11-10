/**
 * The customer list says so when a delete does not reach the server, for one
 * customer and for a selection. The action throws in that case instead of
 * answering, and the list only read the answer: nothing was shown, and the
 * selection's Delete button stayed busy until the page was reloaded.
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfirmProvider } from '@/components/confirm-dialog'
import { GlassModal, useGlassModal } from '@/components/glass-modal'

const deleteCustomer = vi.fn()
const deleteCustomers = vi.fn()
const router = { push: vi.fn(), refresh: vi.fn() }
const searchParams = new URLSearchParams()

vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => '/customers',
  useSearchParams: () => searchParams,
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/features/customers/Actions/customerActions', () => ({
  backfillCustomerNumbers: vi.fn(),
  deleteCustomer: async (id: string) => deleteCustomer(id),
  deleteCustomers: async (ids: string[]) => deleteCustomers(ids),
}))
// Dialogs of their own; closed throughout.
vi.mock('@/features/customers/Components/CustomerForm', () => ({ CustomerForm: () => null }))
vi.mock('@/features/import/Components/ImportWizard', () => ({ ImportWizard: () => null }))

import { CustomersClient } from '@/app/(authenticated)/customers/customers-client'

const CUSTOMER = {
  id: 'c1',
  customerNumber: '1001',
  name: 'Ada Berg',
  email: 'ada@example.com',
  phone: null,
  address: null,
  company: null,
  taxId: null,
  taxExempt: false,
  notes: null,
  _count: { vehicles: 1 },
}

function renderList() {
  render(
    <ConfirmProvider>
      <CustomersClient
        data={{ customers: [CUSTOMER], total: 1, page: 1, pageSize: 20, totalPages: 1 }}
        search=""
        sortBy="name"
        sortOrder="asc"
      />
      <GlassModal />
    </ConfirmProvider>
  )
}

/** Answers the question on screen with Delete. */
async function confirmDelete() {
  const question = await screen.findByRole('alertdialog')
  await act(async () => {
    fireEvent.click(within(question).getByRole('button', { name: 'Delete' }))
  })
}

describe('customer list deletes', () => {
  beforeEach(() => {
    deleteCustomer.mockReset()
    deleteCustomers.mockReset()
    router.refresh.mockClear()
    act(() => useGlassModal.getState().close())
  })

  it('says the delete failed when one customer cannot be deleted for lack of a connection', async () => {
    deleteCustomer.mockRejectedValue(new TypeError('Failed to fetch'))
    renderList()

    fireEvent.keyDown(screen.getAllByRole('button', { name: 'Open menu' })[0], { key: 'Enter' })
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }))
    await confirmDelete()

    expect(deleteCustomer).toHaveBeenCalledWith('c1')
    expect(await screen.findByText('Failed to delete customer')).toBeInTheDocument()
    expect(router.refresh).not.toHaveBeenCalled()
  })

  it('says the delete failed for a selection, and leaves its Delete button usable', async () => {
    deleteCustomers.mockRejectedValue(new TypeError('Failed to fetch'))
    renderList()

    fireEvent.click(screen.getAllByRole('checkbox')[0])
    fireEvent.click(screen.getByRole('button', { name: 'Delete (1)' }))
    await confirmDelete()

    expect(deleteCustomers).toHaveBeenCalledWith(['c1'])
    expect(await screen.findByText('Failed to delete customer')).toBeInTheDocument()
    // Hidden behind the message, but not left busy: the selection is still
    // there to try again once the message is closed.
    expect(screen.getByRole('button', { name: 'Delete (1)', hidden: true })).toBeEnabled()
  })
})
