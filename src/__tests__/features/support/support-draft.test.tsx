import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SupportBubble } from '@/features/support/Components/SupportBubble'
import {
  SUPPORT_OPEN_EVENT,
  type SupportOpenDetail,
} from '@/features/support/Lib/supportVisibility'

// Someone spent several minutes describing a problem in the support form. The
// tab had lost its session, a pause in the typing let it leave for the sign-in
// page, and they came back to an empty form. The page can be replaced under
// the form at any time (sign-in, a reload for a new build), so what is typed
// has to outlive the component. Unmounting and mounting again is that trip.

function openForm() {
  fireEvent.click(screen.getByRole('button', { name: 'Contact support' }))
}

function subjectField() {
  return screen.getByLabelText('Subject')
}

function messageField() {
  return screen.getByLabelText('Description')
}

function write(subject: string, message: string) {
  fireEvent.change(subjectField(), { target: { value: subject } })
  fireEvent.change(messageField(), { target: { value: message } })
}

/** What a page does when it opens the form, such as "Suggest an integration". */
function openFromPage(detail: SupportOpenDetail) {
  act(() => {
    window.dispatchEvent(new CustomEvent<SupportOpenDetail>(SUPPORT_OPEN_EVENT, { detail }))
  })
}

function answerSupportRequestWith(ok: boolean) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok, json: async () => ({}) }))
}

beforeEach(() => {
  window.sessionStorage.clear()
  window.localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('A half-written support request', () => {
  it('is still in the form after the page is replaced', () => {
    const first = render(<SupportBubble userId="anna" />)
    openForm()
    write('Invoices print without the logo', 'It started this morning, after I changed the design.')
    first.unmount()

    render(<SupportBubble userId="anna" />)
    openForm()

    expect(subjectField()).toHaveValue('Invoices print without the logo')
    expect(messageField()).toHaveValue('It started this morning, after I changed the design.')
  })

  it('does not come back once it has been sent', async () => {
    answerSupportRequestWith(true)
    const first = render(<SupportBubble userId="anna" />)
    openForm()
    write('Invoices print without the logo', 'It started this morning.')
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }))
    expect(await screen.findByText('Request sent')).toBeInTheDocument()
    first.unmount()

    render(<SupportBubble userId="anna" />)
    openForm()

    expect(subjectField()).toHaveValue('')
    expect(messageField()).toHaveValue('')
  })

  it('is kept when sending fails, so it can be sent again after a reload', async () => {
    answerSupportRequestWith(false)
    const first = render(<SupportBubble userId="anna" />)
    openForm()
    write('Invoices print without the logo', 'It started this morning.')
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }))
    expect(
      await screen.findByText('The request could not be sent. Please try again.')
    ).toBeInTheDocument()
    first.unmount()

    render(<SupportBubble userId="anna" />)
    openForm()

    expect(subjectField()).toHaveValue('Invoices print without the logo')
    expect(messageField()).toHaveValue('It started this morning.')
  })

  it('keeps its subject when a page opens the form with one of its own', () => {
    const first = render(<SupportBubble userId="anna" />)
    openForm()
    write('Invoices print without the logo', 'It started this morning.')
    first.unmount()

    render(<SupportBubble userId="anna" />)
    openFromPage({ subject: 'Integration suggestion' })

    expect(subjectField()).toHaveValue('Invoices print without the logo')
    expect(messageField()).toHaveValue('It started this morning.')
  })

  it('still takes the subject a page hands over when only a description was written', () => {
    const first = render(<SupportBubble userId="anna" />)
    openForm()
    write('', 'Could you connect to our parts supplier?')
    first.unmount()

    const second = render(<SupportBubble userId="anna" />)
    openFromPage({ subject: 'Integration suggestion' })

    expect(subjectField()).toHaveValue('Integration suggestion')
    expect(messageField()).toHaveValue('Could you connect to our parts supplier?')

    // The page is replaced again before another key is pressed.
    second.unmount()
    render(<SupportBubble userId="anna" />)
    openForm()

    expect(subjectField()).toHaveValue('Integration suggestion')
    expect(messageField()).toHaveValue('Could you connect to our parts supplier?')
  })

  it('is not shown to someone else who signs in on the same tab', () => {
    const first = render(<SupportBubble userId="anna" />)
    openForm()
    write('My payslip', 'Something only Anna should read.')
    first.unmount()

    render(<SupportBubble userId="bjorn" />)
    openForm()

    expect(subjectField()).toHaveValue('')
    expect(messageField()).toHaveValue('')
  })

  it('can still be written where the browser refuses storage', () => {
    const refuse = () => {
      throw new DOMException('The operation is insecure.', 'SecurityError')
    }
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(refuse)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(refuse)
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(refuse)

    render(<SupportBubble userId="anna" />)
    openForm()
    write('Invoices print without the logo', 'It started this morning.')

    expect(subjectField()).toHaveValue('Invoices print without the logo')
    expect(messageField()).toHaveValue('It started this morning.')
  })
})
