/**
 * A customer the server refused: what is wrong is said under the field it is
 * about, in the person's words rather than the schema's ("email: Invalid
 * email"), the field is focused, and what was typed stays.
 */
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const modalOpen = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/customers',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/components/glass-modal', () => ({ useGlassModal: () => ({ open: modalOpen }) }))
vi.mock('@/lib/analytics', () => ({ track: vi.fn() }))
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), loading: vi.fn(), warning: vi.fn() },
}))
vi.mock('@/features/invoice-designer/Actions/documentDesignActions', () => ({
  listDesignOptions: vi.fn(async () => ({ success: true, data: [] })),
}))
vi.mock('@/features/customers/Actions/customerActions', () => ({
  createCustomer: vi.fn(),
  updateCustomer: vi.fn(),
}))
vi.mock('@/features/vehicles/Actions/vehicleActions', () => ({ createVehicle: vi.fn() }))
vi.mock('@/features/vehicles/Components/ScanDocumentButton', () => ({
  ScanDocumentButton: () => null,
}))

import { toast } from 'sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { CustomerForm } from '@/features/customers/Components/CustomerForm'
import { createCustomer } from '@/features/customers/Actions/customerActions'

function renderForm() {
  const onOpenChange = vi.fn()
  render(
    <TooltipProvider>
      <CustomerForm open onOpenChange={onOpenChange} />
    </TooltipProvider>
  )
  return { onOpenChange }
}

const submit = async () => {
  const form = screen.getByRole('dialog').querySelector('form') as HTMLFormElement
  await act(async () => {
    fireEvent.submit(form)
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  // The switches measure themselves; jsdom has nothing to measure with.
  const nothing = () => undefined
  globalThis.ResizeObserver = class {
    observe = nothing
    unobserve = nothing
    disconnect = nothing
  }
})

describe('a customer the server refused', () => {
  it('says what is wrong under the email, focuses it and keeps what was typed', async () => {
    vi.mocked(createCustomer).mockResolvedValue({
      success: false,
      error: 'email: Invalid email',
      fieldErrors: [{ field: 'email', issue: 'email' }],
    })
    const { onOpenChange } = renderForm()
    const name = screen.getByLabelText('Name *') as HTMLInputElement
    const email = screen.getByLabelText('Email') as HTMLInputElement
    fireEvent.change(name, { target: { value: 'ZZ Test Fleet' } })
    fireEvent.change(email, { target: { value: 'kari@nordvik' } })

    await submit()

    const message = await screen.findByText('Enter an email address like name@example.com.')
    expect(email).toHaveAttribute('aria-invalid', 'true')
    expect(email.getAttribute('aria-describedby')).toBe(message.id)
    expect(email).toHaveFocus()
    // Not the schema's English, and not in a box that hides the form.
    expect(screen.queryByText(/Invalid email/)).not.toBeInTheDocument()
    expect(modalOpen).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith('Not saved. Check the marked fields.')
    // Still open, on what was typed.
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
    expect(name.value).toBe('ZZ Test Fleet')
    expect(email.value).toBe('kari@nordvik')
  })

  it('takes the mark away once the field is changed', async () => {
    vi.mocked(createCustomer).mockResolvedValue({
      success: false,
      error: 'address: Too big',
      fieldErrors: [{ field: 'address', issue: 'tooLong', limit: 500 }],
    })
    renderForm()
    fireEvent.change(screen.getByLabelText('Name *'), { target: { value: 'ZZ Test Fleet' } })
    await submit()

    const address = screen.getByLabelText('Address')
    expect(await screen.findByText('Use at most 500 characters.')).toBeInTheDocument()
    expect(address).toHaveAttribute('aria-invalid', 'true')

    fireEvent.change(address, { target: { value: 'Storgata 1' } })
    expect(screen.queryByText('Use at most 500 characters.')).not.toBeInTheDocument()
    expect(address).not.toHaveAttribute('aria-invalid')
  })
})
