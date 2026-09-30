/**
 * A link out of the work order page waits for the pending save.
 *
 * The autosave fires five seconds after the last edit and beforeunload only
 * guards leaving the site, so a retyped title followed by the back arrow was
 * lost. The page now holds the click, saves, and lets the same click through
 * once the save went through.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useServiceFormState } from '@/features/vehicles/Components/service-page/useServiceFormState'

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

  it('keeps the page when the save was refused', async () => {
    const { result } = renderForm()
    const form = document.createElement('form')
    document.body.appendChild(form)
    result.current.formRef.current = form
    // The rules refuse it: handleSubmit returns before marking anything saved.
    vi.spyOn(form, 'requestSubmit').mockImplementation(() => undefined)

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
