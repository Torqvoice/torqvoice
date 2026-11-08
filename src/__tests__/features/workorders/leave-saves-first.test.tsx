/**
 * A link out of the work order page waits for the pending save.
 *
 * The autosave fires five seconds after the last edit and beforeunload only
 * guards leaving the site, so a retyped title followed by the back arrow was
 * lost. The page now holds the click, saves, and lets the same click through
 * once the save went through.
 *
 * A save the rules refuse (a required custom field left empty) used to keep
 * the person on the page with no way out: every link answered with the same
 * error. They now get the reason and a choice: stay and fix it, or leave
 * without the unsaved changes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { useServiceFormState } from '@/features/vehicles/Components/service-page/useServiceFormState'
import { LeaveUnsavedDialog } from '@/features/vehicles/Components/service-page/LeaveUnsavedDialog'

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

function renderForm() {
  return renderHook(() =>
    useServiceFormState({
      vehicleId: null,
      initialData,
      defaultTaxRate: 0,
      currentUserName: 'Tester',
      record,
      locked: false,
    })
  )
}

const REFUSED = 'Please fill in all required custom fields'

/**
 * The form the save submits through, with the rules refusing it: the page's
 * handleSubmit records why and returns before marking anything saved.
 */
function refusingForm(result: { current: ReturnType<typeof useServiceFormState> }) {
  const form = document.createElement('form')
  document.body.appendChild(form)
  result.current.formRef.current = form
  return vi.spyOn(form, 'requestSubmit').mockImplementation(() => {
    result.current.lastSaveErrorRef.current = REFUSED
  })
}

/** A link to another page of the app, in the document so the capture listener sees it. */
function link(href = '/vehicles/v-1') {
  const anchor = document.createElement('a')
  anchor.href = href
  anchor.textContent = 'Back'
  document.body.appendChild(anchor)
  return anchor
}

function click(anchor: HTMLAnchorElement) {
  const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })
  anchor.dispatchEvent(event)
  return event
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  // Unmount first: the dialog renders in a portal under body.
  cleanup()
  document.body.innerHTML = ''
})

describe('leaving with unsaved changes', () => {
  it('holds the click, saves, and then lets the same click through', async () => {
    const { result } = renderForm()
    // The form the save submits through; its submit handler is the page's
    // handleSubmit, which clears the flag once the server has the record.
    const form = document.createElement('form')
    form.addEventListener('submit', (e) => {
      e.preventDefault()
      act(() => result.current.setHasUnsavedChanges(false))
    })
    document.body.appendChild(form)
    result.current.formRef.current = form
    const requestSubmit = vi.spyOn(form, 'requestSubmit').mockImplementation(() => {
      form.dispatchEvent(new Event('submit', { cancelable: true }))
    })

    act(() => result.current.markDirty())
    const anchor = link()
    const first = click(anchor)
    expect(first.defaultPrevented).toBe(true)

    const released = vi.fn((e: Event) => e.preventDefault())
    anchor.addEventListener('click', released)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200)
    })

    expect(requestSubmit).toHaveBeenCalledOnce()
    expect(released).toHaveBeenCalledOnce()
    expect(result.current.hasUnsavedChanges).toBe(false)
  })

  it('keeps the page when the save was refused, and asks why not leave', async () => {
    const { result } = renderForm()
    refusingForm(result)

    act(() => result.current.markDirty())
    const anchor = link()
    const released = vi.fn((e: Event) => e.preventDefault())
    anchor.addEventListener('click', released)
    click(anchor)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200)
    })

    expect(released).not.toHaveBeenCalled()
    expect(result.current.hasUnsavedChanges).toBe(true)
    expect(result.current.blockedLeave?.reason).toBe(REFUSED)
  })

  it('leaves without saving when asked, through the same link', async () => {
    const { result } = renderForm()
    const requestSubmit = refusingForm(result)

    act(() => result.current.markDirty())
    const anchor = link()
    const released = vi.fn((e: Event) => e.preventDefault())
    anchor.addEventListener('click', released)
    click(anchor)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200)
    })
    expect(result.current.blockedLeave).not.toBeNull()

    act(() => result.current.leaveWithoutSaving())

    expect(released).toHaveBeenCalledOnce()
    expect(result.current.blockedLeave).toBeNull()
    expect(result.current.hasUnsavedChanges).toBe(false)
    // Nothing more is tried on the way out: the autosave timer is gone too.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })
    expect(requestSubmit).toHaveBeenCalledOnce()
  })

  it('stays with every edit when asked, and asks again on the next link', async () => {
    const { result } = renderForm()
    refusingForm(result)

    act(() => result.current.markDirty())
    const anchor = link()
    const released = vi.fn((e: Event) => e.preventDefault())
    anchor.addEventListener('click', released)
    click(anchor)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200)
    })

    act(() => result.current.stayOnPage())
    expect(result.current.blockedLeave).toBeNull()
    expect(result.current.hasUnsavedChanges).toBe(true)
    expect(released).not.toHaveBeenCalled()

    click(anchor)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200)
    })
    expect(result.current.blockedLeave?.reason).toBe(REFUSED)
    expect(released).not.toHaveBeenCalled()
  })

  it('waits for a save already running instead of calling it refused', async () => {
    const { result } = renderForm()
    const requestSubmit = refusingForm(result)

    act(() => result.current.markDirty())
    // An autosave is on its way to the server.
    result.current.isSavingRef.current = true
    const anchor = link()
    const released = vi.fn((e: Event) => e.preventDefault())
    anchor.addEventListener('click', released)
    click(anchor)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })
    expect(result.current.blockedLeave).toBeNull()
    expect(released).not.toHaveBeenCalled()

    // It lands.
    act(() => {
      result.current.setHasUnsavedChanges(false)
      result.current.isSavingRef.current = false
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200)
    })

    expect(released).toHaveBeenCalledOnce()
    expect(requestSubmit).not.toHaveBeenCalled()
    expect(result.current.blockedLeave).toBeNull()
  })

  it('leaves links elsewhere, and clean pages, alone', () => {
    const { result } = renderForm()
    const external = link('https://example.com/docs')
    const same = link(`${window.location.pathname}${window.location.search}`)

    act(() => result.current.markDirty())
    expect(click(external).defaultPrevented).toBe(false)
    expect(click(same).defaultPrevented).toBe(false)

    act(() => result.current.setHasUnsavedChanges(false))
    expect(click(link()).defaultPrevented).toBe(false)
  })
})

describe('the leave dialog', () => {
  it('says why the save was refused and offers both ways', () => {
    const onStay = vi.fn()
    const onLeave = vi.fn()
    render(<LeaveUnsavedDialog open reason={REFUSED} onStay={onStay} onLeave={onLeave} />)

    expect(screen.getByText('Your changes are not saved')).toBeInTheDocument()
    expect(screen.getByText(REFUSED)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Leave without saving' }))
    expect(onLeave).toHaveBeenCalledOnce()
  })

  it('stays by default', () => {
    const onStay = vi.fn()
    render(<LeaveUnsavedDialog open reason={null} onStay={onStay} onLeave={vi.fn()} />)

    expect(screen.getByText('The latest changes could not be saved.')).toBeInTheDocument()
    const stay = screen.getByRole('button', { name: 'Stay and fix' })
    expect(stay).toHaveFocus()
    fireEvent.click(stay)
    expect(onStay).toHaveBeenCalled()
  })
})
