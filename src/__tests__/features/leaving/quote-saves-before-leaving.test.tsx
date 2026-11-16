/**
 * Leaving the quote editor saves first.
 *
 * The quote autosaves five seconds after the last edit and only warned about
 * closing the tab. An edit followed within those seconds by a click on the
 * sidebar, a go-to shortcut or a row in the search palette was dropped
 * without a word. Every one of those ways out now waits for the save, and
 * only a save that fails holds the person on the page.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const push = vi.fn()
const modalOpen = vi.fn()
const toastError = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push }),
  usePathname: () => '/quotes/quote-1',
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: (m: string) => toastError(m) } }))
vi.mock('@/components/glass-modal', () => ({
  useGlassModal: () => ({ open: (...args: unknown[]) => modalOpen(...args) }),
}))
vi.mock('@/components/confirm-dialog', () => ({ useConfirm: () => vi.fn(async () => true) }))
const updateQuote = vi.fn()
vi.mock('@/features/quotes/Actions/quoteActions', () => ({
  updateQuote: (input: unknown) => updateQuote(input),
  deleteQuote: vi.fn(),
  convertQuoteToServiceRecord: vi.fn(),
}))
vi.mock('@/features/quotes/Actions/quoteResponseActions', () => ({
  acknowledgeQuoteResponse: vi.fn(),
}))
vi.mock('@/features/shortcuts/Actions/saveKeyboardShortcuts', () => ({
  saveKeyboardShortcuts: vi.fn(async (input: unknown) => ({ success: true, data: input })),
}))

import { useQuoteFormState } from '@/features/quotes/Components/useQuoteFormState'
import { LeaveUnsavedDialog } from '@/features/vehicles/Components/service-page/LeaveUnsavedDialog'
import { ShortcutsProvider } from '@/features/shortcuts/Components/ShortcutsProvider'
import { useGuardedPush } from '@/hooks/use-guarded-push'

const quote = {
  id: 'quote-1',
  status: 'draft',
  customer: null,
  vehicle: null,
  partItems: [],
  laborItems: [],
  taxRate: 0,
  taxInclusive: false,
  discountType: 'none',
  discountValue: 0,
  description: '',
  notes: '',
  validUntil: null,
} as any

/** The quote page as far as leaving goes: its form, a sidebar link, and a
 *  row that opens a page the way the search palette and the Create dialogs do. */
function QuotePage() {
  const state = useQuoteFormState({
    quote,
    currencyCode: 'USD',
    defaultTaxRate: 0,
    taxEnabled: true,
    defaultLaborRate: 0,
    locked: false,
    t: (key: string) => key,
  })
  const go = useGuardedPush()
  return (
    <>
      <a href="/customers">Customers</a>
      <button type="button" onClick={() => go('/vehicles/v-1/service/new')}>
        Open from the palette
      </button>
      <form ref={state.formRef} onSubmit={state.handleSubmit}>
        <input name="title" aria-label="Title" defaultValue="Brakes" onChange={state.markDirty} />
      </form>
      <LeaveUnsavedDialog
        open={state.blockedLeave !== null}
        reason={state.blockedLeave?.reason ?? null}
        onStay={state.stayOnPage}
        onLeave={state.leaveWithoutSaving}
      />
    </>
  )
}

function renderPage() {
  render(
    <ShortcutsProvider
      initialPrefs={null}
      commands={{ isAdminOrOwner: true }}
      plateLookupAvailable={false}
    >
      <QuotePage />
    </ShortcutsProvider>
  )
  // jsdom cannot follow a link; record that the click got through instead.
  const arrived = vi.fn((event: Event) => event.preventDefault())
  const sidebar = screen.getByRole('link', { name: 'Customers' })
  sidebar.addEventListener('click', arrived)
  return { sidebar, arrived }
}

function retitle(title: string) {
  fireEvent.change(screen.getByLabelText('Title'), { target: { value: title } })
}

function press(init: KeyboardEventInit) {
  act(() => {
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
    )
  })
}

/** A save the test answers when it chooses to. */
function slowSave() {
  let answer: (result: { success: boolean; error?: string }) => void = () => undefined
  updateQuote.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        answer = resolve
      })
  )
  return (result: { success: boolean; error?: string }) => act(async () => answer(result))
}

beforeEach(() => {
  push.mockClear()
  modalOpen.mockClear()
  toastError.mockClear()
  updateQuote.mockReset()
  updateQuote.mockResolvedValue({ success: true })
})
afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
})

describe('leaving a quote with an edit the autosave has not taken yet', () => {
  it('saves the edit before a sidebar link is followed, and asks nothing', async () => {
    const { sidebar, arrived } = renderPage()
    const answer = slowSave()
    retitle('Brakes, front and rear')

    fireEvent.click(sidebar)
    await waitFor(() => expect(updateQuote).toHaveBeenCalledOnce())
    expect(updateQuote.mock.calls[0][0]).toMatchObject({ title: 'Brakes, front and rear' })
    // Still on the page while the save is on its way.
    expect(arrived).not.toHaveBeenCalled()

    await answer({ success: true })
    await waitFor(() => expect(arrived).toHaveBeenCalledOnce())
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('saves the edit before a go-to shortcut opens another page', async () => {
    renderPage()
    const answer = slowSave()
    retitle('Brakes, rear only')

    press({ key: 'g', altKey: true })
    press({ key: 'w', altKey: true })
    await waitFor(() => expect(updateQuote).toHaveBeenCalledOnce())
    expect(push).not.toHaveBeenCalled()

    await answer({ success: true })
    await waitFor(() => expect(push).toHaveBeenCalledWith('/work-orders'))
    expect(updateQuote.mock.calls[0][0]).toMatchObject({ title: 'Brakes, rear only' })
  })

  it('saves the edit before the palette or a Create dialog opens a page', async () => {
    renderPage()
    retitle('Timing belt')

    fireEvent.click(screen.getByRole('button', { name: 'Open from the palette' }))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/vehicles/v-1/service/new'))
    expect(updateQuote).toHaveBeenCalledOnce()
    expect(updateQuote.mock.calls[0][0]).toMatchObject({ title: 'Timing belt' })
  })

  it('holds the person on the page when the save fails, and says why', async () => {
    renderPage()
    updateQuote.mockResolvedValue({ success: false, error: 'The quote could not be reached' })
    retitle('Clutch')

    press({ key: 'g', altKey: true })
    press({ key: 'w', altKey: true })
    const dialog = await screen.findByRole('alertdialog', { name: 'Your changes are not saved' })
    expect(dialog).toHaveTextContent('The quote could not be reached')
    expect(push).not.toHaveBeenCalled()
    // One explanation, in the dialog: no error box behind it.
    expect(modalOpen).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Stay and fix' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(push).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Title')).toHaveValue('Clutch')
  })

  it('leaves without the edit only when the person says so', async () => {
    renderPage()
    updateQuote.mockResolvedValue({ success: false, error: 'The quote could not be reached' })
    retitle('Clutch')

    fireEvent.click(screen.getByRole('button', { name: 'Open from the palette' }))
    await screen.findByRole('alertdialog')
    fireEvent.click(screen.getByRole('button', { name: 'Leave without saving' }))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/vehicles/v-1/service/new'))
    expect(updateQuote).toHaveBeenCalledOnce()
  })

  it('still shows a failed save in its own box when nobody is leaving', async () => {
    renderPage()
    updateQuote.mockResolvedValue({ success: false, error: 'The quote could not be reached' })
    retitle('Clutch')

    fireEvent.submit(screen.getByLabelText('Title').closest('form') as HTMLFormElement)
    await waitFor(() =>
      expect(modalOpen).toHaveBeenCalledWith('error', 'Error', 'The quote could not be reached')
    )
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })
})

describe('leaving a quote with nothing to save', () => {
  it('goes at once, by a link and by a shortcut', async () => {
    const { sidebar, arrived } = renderPage()

    fireEvent.click(sidebar)
    expect(arrived).toHaveBeenCalledOnce()
    press({ key: 'g', altKey: true })
    press({ key: 'w', altKey: true })
    expect(push).toHaveBeenCalledWith('/work-orders')
    expect(updateQuote).not.toHaveBeenCalled()
  })
})
