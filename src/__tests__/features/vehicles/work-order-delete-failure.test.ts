/**
 * Deleting a work order blocks saving first, so an autosave cannot land on a
 * job that is about to be gone. A delete that never reached the server threw
 * past the code that lifts the block: nothing was shown, the job was still
 * there, and no later edit on the page was saved. It now says the delete
 * failed and saving carries on.
 */
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useGlassModal } from '@/components/glass-modal'

const deleteServiceRecord = vi.fn()
const router = { push: vi.fn(), refresh: vi.fn() }

vi.mock('next/navigation', () => ({ useRouter: () => router }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
// The question is answered with Delete.
vi.mock('@/components/confirm-dialog', () => ({ useConfirm: () => async () => true }))
vi.mock('@/features/vehicles/Actions/serviceActions', () => ({
  updateServiceRecord: vi.fn(),
  deleteServiceRecord: async (id: string) => deleteServiceRecord(id),
  deleteServiceAttachment: vi.fn(),
  toggleManuallyPaid: vi.fn(),
}))
vi.mock('@/features/payments/Actions/paymentActions', () => ({
  createPayment: vi.fn(),
  deletePayment: vi.fn(),
}))
vi.mock('@/features/sms/Actions/smsActions', () => ({ getSmsTemplates: vi.fn() }))

import { useServiceActions } from '@/features/vehicles/Components/service-page/useServiceActions'

type Options = Parameters<typeof useServiceActions>[0]

function renderActions() {
  // Only what a delete touches; the rest of the form's state is not read.
  const form = {
    isSavingRef: { current: false },
    autosaveTimer: { current: null },
    setHasUnsavedChanges: vi.fn(),
  }
  const hook = renderHook(() =>
    useServiceActions({
      record: { id: 'job1' } as unknown as Options['record'],
      vehicleId: 'v1',
      currencyCode: 'USD',
      formState: form as unknown as Options['formState'],
    })
  )
  return { form, hook }
}

describe('deleting a work order', () => {
  beforeEach(() => {
    deleteServiceRecord.mockReset()
    router.push.mockClear()
    router.refresh.mockClear()
    act(() => useGlassModal.getState().close())
  })

  it('leaves for the vehicle once the job is deleted', async () => {
    deleteServiceRecord.mockResolvedValue({ success: true })
    const { hook } = renderActions()

    await act(() => hook.result.current.handleDelete())

    expect(deleteServiceRecord).toHaveBeenCalledWith('job1')
    expect(router.push).toHaveBeenCalledWith('/vehicles/v1')
    expect(useGlassModal.getState().isOpen).toBe(false)
  })

  it('says the delete failed and keeps saving when the request never reaches the server', async () => {
    deleteServiceRecord.mockRejectedValue(new TypeError('Failed to fetch'))
    const { form, hook } = renderActions()

    await act(() => hook.result.current.handleDelete())

    expect(useGlassModal.getState()).toMatchObject({
      isOpen: true,
      type: 'error',
      message: 'Failed to delete',
    })
    expect(router.push).not.toHaveBeenCalled()
    // The job is still there, so the page must go on saving it.
    expect(form.isSavingRef.current).toBe(false)
  })

  it('shows what the server said when it refuses, and keeps saving', async () => {
    deleteServiceRecord.mockResolvedValue({ success: false, error: 'Invoice is locked' })
    const { form, hook } = renderActions()

    await act(() => hook.result.current.handleDelete())

    expect(useGlassModal.getState()).toMatchObject({ isOpen: true, message: 'Invoice is locked' })
    expect(form.isSavingRef.current).toBe(false)
  })
})
