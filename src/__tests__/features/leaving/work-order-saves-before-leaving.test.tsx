/**
 * A page opened without a click on a link waits for the work order's save.
 *
 * The work order has held link clicks back until its save ran for a while,
 * but the Create dialogs (pick a vehicle, new inspection), the search palette,
 * the plate lookup and a notification all opened their page with a straight
 * router.push, which walked past that and dropped the unsaved edit. They now
 * go through useGuardedPush, which is held exactly as a link is.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push }) }))

import { useServiceFormState } from '@/features/vehicles/Components/service-page/useServiceFormState'
import { useGuardedPush } from '@/hooks/use-guarded-push'

const initialData = {
  id: 'rec-1',
  title: 'Brake job',
  description: '',
  type: 'repair',
  status: 'pending',
  serviceDate: '2026-01-01',
  partItems: [],
  laborItems: [],
  concerns: [],
} as any

const record = { id: 'rec-1', payments: [], manuallyPaid: false, attachments: [] } as any

function renderWorkOrder() {
  const form = renderHook(() =>
    useServiceFormState({
      vehicleId: null,
      initialData,
      defaultTaxRate: 0,
      currentUserName: 'Tester',
      record,
      locked: false,
    })
  )
  const go = renderHook(() => useGuardedPush()).result.current
  const el = document.createElement('form')
  document.body.appendChild(el)
  form.result.current.formRef.current = el
  return { result: form.result, el, go }
}

const settle = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(200)
  })

beforeEach(() => {
  vi.useFakeTimers()
  push.mockClear()
})
afterEach(() => {
  vi.useRealTimers()
  cleanup()
  document.body.innerHTML = ''
})

describe('opening a page from a dialog, the palette or a shortcut over an unsaved work order', () => {
  it('saves the work order first, then opens the page', async () => {
    const { result, el, go } = renderWorkOrder()
    act(() => result.current.markDirty())
    // The page's own save: it went through, for the edit made just now.
    const revision = result.current.editRevisionRef.current
    const requestSubmit = vi.spyOn(el, 'requestSubmit').mockImplementation(() => {
      result.current.markSaved(revision)
    })

    // Picking a vehicle in the "new work order" dialog ends here.
    act(() => go('/vehicles/v-2/service/new'))
    expect(push).not.toHaveBeenCalled()

    await settle()
    expect(requestSubmit).toHaveBeenCalledOnce()
    expect(push).toHaveBeenCalledWith('/vehicles/v-2/service/new')
    expect(result.current.blockedLeave).toBeNull()
  })

  it('goes where the first attempt pointed when a second one is made while it waits', async () => {
    const { result, el, go } = renderWorkOrder()
    act(() => result.current.markDirty())
    const revision = result.current.editRevisionRef.current
    vi.spyOn(el, 'requestSubmit').mockImplementation(() => {
      result.current.markSaved(revision)
    })

    act(() => go('/work-orders'))
    act(() => go('/customers'))
    await settle()

    expect(push).toHaveBeenCalledOnce()
    expect(push).toHaveBeenCalledWith('/work-orders')
    expect(document.querySelectorAll('a[data-guarded-link]')).toHaveLength(0)
  })

  it('stays when the save is refused, and goes only once the person chooses to', async () => {
    const { result, el, go } = renderWorkOrder()
    vi.spyOn(el, 'requestSubmit').mockImplementation(() => {
      result.current.lastSaveErrorRef.current = 'Please fill in all required custom fields'
    })
    act(() => result.current.markDirty())

    act(() => go('/inspections/i-9'))
    await settle()
    expect(push).not.toHaveBeenCalled()
    expect(result.current.blockedLeave?.reason).toBe('Please fill in all required custom fields')

    act(() => result.current.leaveWithoutSaving())
    expect(push).toHaveBeenCalledWith('/inspections/i-9')
  })

  it('opens the page at once when the work order has nothing to save', () => {
    const { go } = renderWorkOrder()
    act(() => go('/customers?create=true'))
    expect(push).toHaveBeenCalledWith('/customers?create=true')
  })
})
