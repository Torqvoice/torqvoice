/**
 * The customer dialog for a workshop with fields of its own on customers.
 * Nothing is drawn or asked for a workshop that has defined none. A required
 * field left empty stops the save before anything is written, named by its
 * label under the field and in the message, with the focus on the first one.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
vi.mock('@/features/vehicles/Actions/vehicleActions', () => ({ createVehicle: vi.fn() }))
vi.mock('@/features/vehicles/Components/ScanDocumentButton', () => ({
  ScanDocumentButton: () => null,
}))
const save = vi.hoisted(() => vi.fn())
const loadValues = vi.hoisted(() => vi.fn())
const loadDefinitions = vi.hoisted(() => vi.fn())
vi.mock('@/features/custom-fields/Actions/customFieldActions', () => ({
  getCustomFieldValues: loadValues,
  getFieldDefinitions: loadDefinitions,
  saveValidatedCustomFieldValues: save,
}))

import { toast } from 'sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { RecordCustomFieldsProvider } from '@/components/record-custom-fields-context'
import { CustomerForm } from '@/features/customers/Components/CustomerForm'
import { createCustomer, updateCustomer } from '@/features/customers/Actions/customerActions'

const CUSTOMER = {
  id: 'cust-1',
  name: 'ZZ Nordvik Haulage',
  email: null,
  phone: null,
  address: null,
  company: null,
  notes: null,
} as unknown as NonNullable<React.ComponentProps<typeof CustomerForm>['customer']>

const field = { options: null as string | null, required: true, value: '', isActive: true }
const FIELDS = [
  { ...field, id: 'centre', name: 'centre', label: 'Cost centre', fieldType: 'text' },
  { ...field, id: 'contact', name: 'contact', label: 'Fleet contact', fieldType: 'text' },
]

function renderForm(
  hasFields: boolean,
  props: Partial<React.ComponentProps<typeof CustomerForm>> = {}
) {
  render(
    <TooltipProvider>
      <RecordCustomFieldsProvider value={{ vehicle: false, customer: hasFields }}>
        <CustomerForm open onOpenChange={vi.fn()} customer={CUSTOMER} {...props} />
      </RecordCustomFieldsProvider>
    </TooltipProvider>
  )
}

const input = (id: string) =>
  screen.getByTestId(`custom-field-${id}`).querySelector('input') as HTMLInputElement
const submit = async () => {
  const form = screen.getByRole('dialog').querySelector('form') as HTMLFormElement
  await act(async () => {
    fireEvent.submit(form)
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(updateCustomer).mockResolvedValue({ success: true } as never)
  save.mockResolvedValue({ success: true, data: { saved: true } })
  loadValues.mockResolvedValue({ success: true, data: FIELDS })
  loadDefinitions.mockResolvedValue({ success: true, data: FIELDS })
  Element.prototype.scrollIntoView = vi.fn()
  // The design dropdown measures itself; jsdom has nothing to measure with.
  const nothing = () => undefined
  globalThis.ResizeObserver = class {
    observe = nothing
    unobserve = nothing
    disconnect = nothing
  }
})

describe('a workshop with no fields of its own on customers', () => {
  it('draws none, asks for none, and saves the customer as it always did', async () => {
    renderForm(false)
    await screen.findByRole('dialog')
    expect(screen.queryByText('Custom Fields')).not.toBeInTheDocument()

    await submit()

    await waitFor(() => expect(updateCustomer).toHaveBeenCalled())
    expect(loadValues).not.toHaveBeenCalled()
    expect(loadDefinitions).not.toHaveBeenCalled()
    expect(save).not.toHaveBeenCalled()
  })
})

describe('the workshop’s own fields on a customer', () => {
  it('with one required field empty: nothing is saved, the field is named, and it has the focus', async () => {
    renderForm(true)
    await screen.findByText('Custom Fields')
    expect(loadValues).toHaveBeenCalledWith('cust-1', 'customer')
    fireEvent.change(input('contact'), { target: { value: 'Ida' } })

    await submit()

    expect(updateCustomer).not.toHaveBeenCalled()
    expect(save).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith('Not saved. Fill in: Cost centre')
    expect(within(screen.getByTestId('custom-field-centre')).getByRole('alert')).toHaveTextContent(
      'Cost centre is required'
    )
    expect(input('centre')).toHaveFocus()
  })

  it('with two empty: names both and focuses the first', async () => {
    renderForm(true)
    await screen.findByText('Custom Fields')

    await submit()

    expect(updateCustomer).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith('Not saved. Fill in: Cost centre, Fleet contact')
    expect(screen.getAllByRole('alert')).toHaveLength(2)
    expect(input('centre')).toHaveFocus()
  })

  it('saves the fields, then the customer, once they are filled in', async () => {
    renderForm(true)
    await screen.findByText('Custom Fields')
    fireEvent.change(input('centre'), { target: { value: 'CC-7741' } })
    fireEvent.change(input('contact'), { target: { value: 'Ida' } })

    await submit()

    await waitFor(() => expect(updateCustomer).toHaveBeenCalled())
    expect(save).toHaveBeenCalledWith(
      'cust-1',
      'customer',
      expect.objectContaining({ centre: 'CC-7741', contact: 'Ida' })
    )
  })

  it('creates a new customer first and saves its fields under the new id', async () => {
    vi.mocked(createCustomer).mockResolvedValue({
      success: true,
      data: { id: 'cust-new', name: 'ZZ New', company: null },
    } as never)
    renderForm(true, { customer: undefined })
    await screen.findByText('Custom Fields')
    expect(loadDefinitions).toHaveBeenCalledWith('customer')
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'ZZ New' } })

    await submit()
    expect(createCustomer).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith('Not saved. Fill in: Cost centre, Fleet contact')

    fireEvent.change(input('centre'), { target: { value: 'CC-1' } })
    fireEvent.change(input('contact'), { target: { value: 'Ida' } })
    await submit()

    await waitFor(() => expect(save).toHaveBeenCalled())
    expect(save).toHaveBeenCalledWith('cust-new', 'customer', { centre: 'CC-1', contact: 'Ida' })
  })
})
