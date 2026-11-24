/**
 * The customer form says when another customer of the workshop already has
 * the email, the phone number or the name being typed, names them with a
 * link and lets the person save anyway. A phone number with letters in it
 * is refused under the field. The placeholders name what goes in a field
 * rather than an American example.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/customers',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/components/glass-modal', () => ({ useGlassModal: () => ({ open: vi.fn() }) }))
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
vi.mock('@/features/customers/Actions/findCustomerDuplicates', () => ({
  findCustomerDuplicates: vi.fn(),
}))
vi.mock('@/features/vehicles/Actions/vehicleActions', () => ({ createVehicle: vi.fn() }))
vi.mock('@/features/vehicles/Components/ScanDocumentButton', () => ({
  ScanDocumentButton: () => null,
}))

import { toast } from 'sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { CustomerForm } from '@/features/customers/Components/CustomerForm'
import { createCustomer, updateCustomer } from '@/features/customers/Actions/customerActions'
import { findCustomerDuplicates } from '@/features/customers/Actions/findCustomerDuplicates'

const NONE = { email: [], phone: [], name: [] }
const KARI = { id: 'cust-kari', name: 'ZZ Kari Testvik', company: 'ZZ Testvik AS' }

function renderForm(customer?: React.ComponentProps<typeof CustomerForm>['customer']) {
  const onOpenChange = vi.fn()
  render(
    <TooltipProvider>
      <CustomerForm open onOpenChange={onOpenChange} customer={customer} />
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
  const nothing = () => undefined
  globalThis.ResizeObserver = class {
    observe = nothing
    unobserve = nothing
    disconnect = nothing
  }
  vi.mocked(findCustomerDuplicates).mockResolvedValue({ success: true, data: NONE })
  vi.mocked(createCustomer).mockResolvedValue({
    success: true,
    data: { id: 'cust-new', name: 'ZZ Kari Testvik', company: null },
  } as never)
})

describe('another customer with the same details', () => {
  it('names them under the email with a link, once the field is left', async () => {
    vi.mocked(findCustomerDuplicates).mockResolvedValue({
      success: true,
      data: { ...NONE, email: [KARI] },
    })
    renderForm()
    const email = screen.getByLabelText('Email')
    fireEvent.change(email, { target: { value: 'kari@testvik.example' } })
    fireEvent.blur(email)

    expect(await screen.findByText('Another customer has this email:')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: 'ZZ Kari Testvik (ZZ Testvik AS)' })
    expect(link).toHaveAttribute('href', '/customers/cust-kari')
    // A new tab, so what was typed here is not lost.
    expect(link).toHaveAttribute('target', '_blank')
    expect(email).toHaveAccessibleDescription(/Another customer has this email/)
    expect(findCustomerDuplicates).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'kari@testvik.example' })
    )
  })

  it('stops the first save to show them, and saves on the second', async () => {
    vi.mocked(findCustomerDuplicates).mockResolvedValue({
      success: true,
      data: { ...NONE, name: [KARI], phone: [KARI] },
    })
    const { onOpenChange } = renderForm()
    fireEvent.change(screen.getByLabelText('Name *'), { target: { value: 'ZZ Kari Testvik' } })
    fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '+00 912 34 567' } })

    await submit()
    expect(createCustomer).not.toHaveBeenCalled()
    expect(toast.warning).toHaveBeenCalledWith(
      'This may be a customer you already have. Check the marked fields, or save again to keep it anyway.'
    )
    expect(screen.getByText('A customer with this name already exists:')).toBeInTheDocument()
    expect(screen.getByText('Another customer has this phone number:')).toBeInTheDocument()

    await submit()
    expect(createCustomer).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  })

  it('saves straight away when nobody matches', async () => {
    renderForm()
    fireEvent.change(screen.getByLabelText('Name *'), { target: { value: 'ZZ Unique Person' } })
    await submit()
    expect(createCustomer).toHaveBeenCalledTimes(1)
    expect(toast.warning).not.toHaveBeenCalled()
  })

  it('saves anyway when the check fails', async () => {
    vi.mocked(findCustomerDuplicates).mockRejectedValue(new Error('offline'))
    renderForm()
    fireEvent.change(screen.getByLabelText('Name *'), { target: { value: 'ZZ Unique Person' } })
    await submit()
    expect(createCustomer).toHaveBeenCalledTimes(1)
  })

  it('does not ask about what an edit left as it was', async () => {
    vi.mocked(updateCustomer).mockResolvedValue({ success: true } as never)
    renderForm({ id: 'cust-1', name: 'ZZ Kari Testvik', email: 'kari@testvik.example' })
    fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '912 34 567' } })
    await submit()
    expect(findCustomerDuplicates).toHaveBeenCalledWith({
      name: '',
      email: '',
      phone: '912 34 567',
      excludeId: 'cust-1',
    })
    expect(updateCustomer).toHaveBeenCalledTimes(1)
  })
})

describe('a phone number', () => {
  it('with letters in it is refused under the field, and nothing is sent', async () => {
    renderForm()
    fireEvent.change(screen.getByLabelText('Name *'), { target: { value: 'ZZ Kari Testvik' } })
    const phone = screen.getByLabelText('Phone')
    fireEvent.change(phone, { target: { value: 'abc-not-a-phone!!' } })
    await submit()

    const message = screen.getByText('Enter a phone number: digits, spaces and + - ( ) . only.')
    expect(phone).toHaveAttribute('aria-invalid', 'true')
    expect(phone.getAttribute('aria-describedby')).toContain(message.id)
    expect(phone).toHaveFocus()
    expect(createCustomer).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith('Not saved. Check the marked fields.')
  })

  it('written with spaces, a plus, brackets, dots and hyphens is saved', async () => {
    renderForm()
    fireEvent.change(screen.getByLabelText('Name *'), { target: { value: 'ZZ Kari Testvik' } })
    fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '+00 (0)12-345.678' } })
    await submit()
    expect(createCustomer).toHaveBeenCalledWith(
      expect.objectContaining({ phone: '+00 (0)12-345.678' })
    )
  })
})

describe('the placeholders', () => {
  it('say what goes in a field, not an American example', () => {
    renderForm()
    expect(screen.getByLabelText('Phone')).toHaveAttribute('placeholder', 'Phone number')
    expect(screen.getByLabelText('Address')).toHaveAttribute(
      'placeholder',
      'Street, postcode, city'
    )
    expect(screen.getByLabelText('Tax / VAT number')).toHaveAttribute(
      'placeholder',
      'VAT or tax number'
    )
    expect(screen.queryByPlaceholderText(/555|Main St|NO123456789/)).not.toBeInTheDocument()
  })
})
