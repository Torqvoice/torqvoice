/**
 * Payments and attachments on a work order, on a dropped connection. The
 * actions throw instead of answering when they cannot reach the server, and
 * the work order only read the answer: no error was shown, and the payment
 * buttons stayed busy until the page was reloaded.
 */
import { act, renderHook } from '@testing-library/react'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useGlassModal } from '@/components/glass-modal'

/** What a dropped connection does to a server action: it throws. */
const offline = async () => {
  throw new TypeError('Failed to fetch')
}

const createPayment = vi.fn()
const deletePayment = vi.fn()
const toggleManuallyPaid = vi.fn()
const deleteServiceAttachment = vi.fn()
const getSmsTemplates = vi.fn()
const router = { push: vi.fn(), refresh: vi.fn() }

vi.mock('next/navigation', () => ({ useRouter: () => router }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
// The question is answered with Delete.
vi.mock('@/components/confirm-dialog', () => ({ useConfirm: () => async () => true }))
vi.mock('@/features/vehicles/Actions/serviceActions', () => ({
  updateServiceRecord: vi.fn(),
  deleteServiceRecord: vi.fn(),
  deleteServiceAttachment: (id: string) => deleteServiceAttachment(id),
  toggleManuallyPaid: (id: string) => toggleManuallyPaid(id),
}))
vi.mock('@/features/payments/Actions/paymentActions', () => ({
  createPayment: (input: unknown) => createPayment(input),
  deletePayment: (id: string) => deletePayment(id),
}))
vi.mock('@/features/sms/Actions/smsActions', () => ({
  getSmsTemplates: () => getSmsTemplates(),
}))

import { useServiceActions } from '@/features/vehicles/Components/service-page/useServiceActions'

type Options = Parameters<typeof useServiceActions>[0]

const PAYMENT = { amount: 500, date: '2026-11-10', method: 'card' }

function renderActions() {
  // Only what these handlers touch; the rest of the form's state is not read.
  const form = {
    isSavingRef: { current: false },
    autosaveTimer: { current: null },
    setHasUnsavedChanges: vi.fn(),
    setLocalManuallyPaid: vi.fn(),
  }
  const hook = renderHook(() =>
    useServiceActions({
      record: {
        id: 'job1',
        invoiceNumber: 'INV-1001',
        customer: { name: 'Ada Berg' },
        vehicle: null,
      } as unknown as Options['record'],
      vehicleId: 'v1',
      currencyCode: 'USD',
      formState: form as unknown as Options['formState'],
    })
  )
  return { form, hook }
}

const modalMessage = () => {
  const state = useGlassModal.getState()
  return state.isOpen && state.type === 'error' ? state.message : null
}

describe('work order payments on a dropped connection', () => {
  beforeEach(() => {
    for (const action of [
      createPayment,
      deletePayment,
      toggleManuallyPaid,
      deleteServiceAttachment,
      getSmsTemplates,
    ]) {
      action.mockReset()
    }
    router.refresh.mockClear()
    vi.mocked(toast.success).mockClear()
    act(() => useGlassModal.getState().close())
  })

  it('says a payment was not recorded and frees the payment buttons', async () => {
    createPayment.mockImplementation(offline)
    const { hook } = renderActions()

    let recorded: boolean | undefined
    await act(async () => {
      recorded = await hook.result.current.handleCreatePayment(PAYMENT)
    })

    // False keeps the payment form open with what was typed.
    expect(recorded).toBe(false)
    expect(modalMessage()).toBe('Failed to record payment')
    expect(hook.result.current.paymentLoading).toBe(false)
    expect(router.refresh).not.toHaveBeenCalled()
  })

  it('offers the payment message in the default wording when the saved texts cannot be read', async () => {
    createPayment.mockResolvedValue({ success: true })
    getSmsTemplates.mockImplementation(offline)
    const { hook } = renderActions()

    let recorded: boolean | undefined
    await act(async () => {
      recorded = await hook.result.current.handleCreatePayment(PAYMENT)
    })

    expect(recorded).toBe(true)
    expect(toast.success).toHaveBeenCalledWith('Payment recorded')
    expect(hook.result.current.showPaymentNotifyDialog).toBe(true)
    expect(hook.result.current.paymentNotifyMessage).toMatch(
      /^Payment of .*500.* received for invoice INV-1001\. Thank you!$/
    )
  })

  it('says marking paid failed and frees the payment buttons', async () => {
    toggleManuallyPaid.mockImplementation(offline)
    const { form, hook } = renderActions()

    await act(() => hook.result.current.handleTogglePaid())

    expect(modalMessage()).toBe('Failed to update payment status')
    expect(hook.result.current.paymentLoading).toBe(false)
    expect(form.setLocalManuallyPaid).not.toHaveBeenCalled()
  })

  it('says a payment was not deleted and frees its delete button', async () => {
    deletePayment.mockImplementation(offline)
    const { hook } = renderActions()

    await act(() => hook.result.current.handleDeletePayment('pay1'))

    expect(deletePayment).toHaveBeenCalledWith('pay1')
    expect(modalMessage()).toBe('Failed to delete payment')
    expect(hook.result.current.deletingPayment).toBeNull()
  })

  it('says an attachment was not deleted and frees its delete button', async () => {
    deleteServiceAttachment.mockImplementation(offline)
    const { hook } = renderActions()

    await act(() => hook.result.current.handleDeleteAttachment('file1'))

    expect(deleteServiceAttachment).toHaveBeenCalledWith('file1')
    expect(modalMessage()).toBe('Failed to delete')
    expect(hook.result.current.deletingAttachment).toBeNull()
  })
})
