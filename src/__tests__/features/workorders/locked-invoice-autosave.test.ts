/**
 * A locked invoice must not queue a save it cannot make.
 *
 * The invoice page autosaves five seconds after any edit, and marking the form
 * dirty is also what puts "Unsaved changes" in the header. On a locked invoice
 * both are traps: the header offers a save the server refuses, and the autosave
 * fires the same refusal on its own a moment later.
 *
 * This showed up through the "mark completed" prompt after sending. The status
 * had already been saved by updateServiceStatus, but setting it locally went
 * through the dirty setter, so a change that was already stored asked to be
 * saved again into an invoice that had just locked.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useServiceFormState } from '@/features/vehicles/Components/service-page/useServiceFormState'

const AUTOSAVE_DELAY = 5000

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

function renderForm(locked: boolean) {
  return renderHook(
    (props: { locked: boolean }) =>
      useServiceFormState({
        vehicleId: null,
        initialData,
        defaultTaxRate: 0,
        currentUserName: 'Tester',
        record,
        locked: props.locked,
      }),
    { initialProps: { locked } }
  )
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('an editable invoice', () => {
  it('marks the form dirty and queues an autosave', () => {
    const { result } = renderForm(false)

    act(() => result.current.markDirty())

    expect(result.current.hasUnsavedChanges).toBe(true)
    expect(result.current.autosaveTimer.current).not.toBeNull()
  })
})

describe('a locked invoice', () => {
  it('never reports unsaved changes', () => {
    const { result } = renderForm(true)

    act(() => result.current.markDirty())

    expect(result.current.hasUnsavedChanges).toBe(false)
  })

  it('queues no autosave to be refused later', () => {
    const { result } = renderForm(true)

    act(() => result.current.markDirty())
    act(() => void vi.advanceTimersByTime(AUTOSAVE_DELAY * 2))

    expect(result.current.autosaveTimer.current).toBeNull()
  })
})

describe('the lock engaging mid-session', () => {
  it('cancels the queued autosave and clears "Unsaved changes"', () => {
    // Edit first, then send the invoice: the edit queued a save the lock has
    // now closed every route for. Left alone, the timer would fire into a
    // refusal and the header would offer a save that can only fail.
    const { result, rerender } = renderForm(false)

    act(() => result.current.markDirty())
    expect(result.current.hasUnsavedChanges).toBe(true)

    rerender({ locked: true })

    expect(result.current.hasUnsavedChanges).toBe(false)
    expect(result.current.autosaveTimer.current).toBeNull()

    act(() => void vi.advanceTimersByTime(AUTOSAVE_DELAY * 2))
    expect(result.current.autosaveTimer.current).toBeNull()
  })
})

describe('setting a status that is already saved', () => {
  it('updates the status without asking to be saved again', () => {
    // What the "mark completed" prompt does after sending: the status has
    // already been stored by updateServiceStatus.
    const { result } = renderForm(false)

    act(() => result.current.setStatus('completed'))

    expect(result.current.status).toBe('completed')
    expect(result.current.hasUnsavedChanges).toBe(false)
  })

  it('still marks dirty when the status is changed by hand', () => {
    // The ordinary dropdown must keep offering a save.
    const { result } = renderForm(false)

    act(() => result.current.dirtySetStatus('completed'))

    expect(result.current.status).toBe('completed')
    expect(result.current.hasUnsavedChanges).toBe(true)
  })
})
