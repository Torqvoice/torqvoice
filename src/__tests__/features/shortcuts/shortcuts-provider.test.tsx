import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfirmProvider } from '@/components/confirm-dialog'
import { ShortcutKeys } from '@/features/shortcuts/Components/ShortcutKeys'
import { ShortcutsProvider, useShortcut } from '@/features/shortcuts/Components/ShortcutsProvider'
import { ShortcutsSettings } from '@/features/shortcuts/Components/ShortcutsSettings'

const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))

const save = vi.fn(async (input: unknown) => ({ success: true, data: input }))
vi.mock('@/features/shortcuts/Actions/saveKeyboardShortcuts', () => ({
  saveKeyboardShortcuts: (input: unknown) => save(input),
}))

const everyone = { isAdminOrOwner: true }

function Calendar({ onWeek }: { onWeek: () => void }) {
  useShortcut('calendar.week', onWeek)
  return null
}

function App({
  prefs = null,
  commands = everyone,
  children,
}: {
  prefs?: unknown
  commands?: Parameters<typeof ShortcutsProvider>[0]['commands']
  children?: React.ReactNode
}) {
  return (
    <ConfirmProvider>
      <ShortcutsProvider initialPrefs={prefs} commands={commands} plateLookupAvailable={false}>
        {children}
      </ShortcutsProvider>
    </ConfirmProvider>
  )
}

function press(init: KeyboardEventInit, target: Element = document.body) {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
  act(() => {
    target.dispatchEvent(event)
  })
  return event
}

/** Real time passing: bare keys are held back a moment, and wait after typing. */
const pause = (ms: number) => act(() => new Promise<void>((resolve) => setTimeout(resolve, ms)))

beforeEach(() => {
  push.mockClear()
  save.mockClear()
})

describe('keyboard shortcuts in the app', () => {
  it('opens a new work order on Alt+W', () => {
    render(<App />)
    const event = press({ key: 'w', altKey: true })
    expect(push).toHaveBeenCalledWith('/work-orders?new=1')
    expect(event.defaultPrevented).toBe(true)
  })

  it('does nothing on Alt+Shift+W, which belongs to Windows', () => {
    render(<App />)
    const event = press({ key: 'W', altKey: true, shiftKey: true })
    expect(push).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
  })

  it('opens the work order list on Alt+G then Alt+W, and a new work order on Alt+W alone', () => {
    render(<App />)
    const first = press({ key: 'g', altKey: true })
    expect(first.defaultPrevented).toBe(true)
    press({ key: 'w', altKey: true })
    expect(push).toHaveBeenLastCalledWith('/work-orders')

    // The sequence is spent: the same key on its own creates again.
    press({ key: 'w', altKey: true })
    expect(push).toHaveBeenLastCalledWith('/work-orders?new=1')
    expect(push).toHaveBeenCalledTimes(2)
  })

  it('still works when Alt is let go between the two presses', () => {
    render(<App />)
    press({ key: 'Alt', altKey: true })
    press({ key: 'g', altKey: true })
    press({ key: 'Alt', altKey: true })
    press({ key: 'q', altKey: true })
    expect(push).toHaveBeenCalledWith('/quotes')
  })

  it('goes back to creating once the moment after Alt+G has passed', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      render(<App />)
      press({ key: 'g', altKey: true })
      vi.advanceTimersByTime(1400)
      press({ key: 'w', altKey: true })
      expect(push).toHaveBeenLastCalledWith('/work-orders')

      press({ key: 'g', altKey: true })
      vi.advanceTimersByTime(1600)
      press({ key: 'w', altKey: true })
      expect(push).toHaveBeenLastCalledWith('/work-orders?new=1')
    } finally {
      vi.useRealTimers()
    }
  })

  it('takes a bare letter after Alt+G for what it is, and forgets the Alt+G', () => {
    render(
      <App>
        <input aria-label="Name" />
      </App>
    )
    press({ key: 'g', altKey: true })
    const typed = press({ key: 'w' }, screen.getByLabelText('Name'))
    expect(typed.defaultPrevented).toBe(false)
    expect(push).not.toHaveBeenCalled()
    press({ key: 'w', altKey: true })
    expect(push).toHaveBeenLastCalledWith('/work-orders?new=1')
  })

  it('never opens a page on bare letters, however they are pressed', async () => {
    render(<App />)
    for (const keys of ['gw', 'gq', 'gg', 'gk']) {
      for (const key of keys) {
        press({ key })
        await pause(70)
      }
    }
    expect(push).not.toHaveBeenCalled()
  })

  it('leaves the go-to set alone once it is switched off', () => {
    render(<App prefs={{ goToSequences: false }} />)
    const first = press({ key: 'g', altKey: true })
    expect(first.defaultPrevented).toBe(false)
    press({ key: 'w', altKey: true })
    expect(push).toHaveBeenLastCalledWith('/work-orders?new=1')
  })

  it('is held back by a page that saves before it lets a link through', () => {
    // What the work order page does while a job has unsaved changes: it
    // catches the click on a link, saves, and then lets that click through.
    let held: HTMLAnchorElement | null = null
    const guard = (event: MouseEvent) => {
      const anchor = (event.target as Element).closest('a[href]')
      if (!(anchor instanceof HTMLAnchorElement) || held === anchor) return
      event.preventDefault()
      event.stopPropagation()
      held = anchor
    }
    document.addEventListener('click', guard, true)
    try {
      render(<App />)
      press({ key: 'g', altKey: true })
      press({ key: 'q', altKey: true })
      expect(push).not.toHaveBeenCalled()
      expect(held).not.toBeNull()

      // Saved: the page releases the click it was holding.
      act(() => (held as unknown as HTMLAnchorElement).click())
      expect(push).toHaveBeenCalledWith('/quotes')
    } finally {
      document.removeEventListener('click', guard, true)
    }
  })

  it('draws a sequence that repeats a key without React complaining about it', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      render(
        <App>
          <span data-testid="hint">
            <ShortcutKeys id="goTo.dashboard" />
          </span>
        </App>
      )
      expect(screen.getByTestId('hint')).toHaveTextContent('AltGthenAltG')
      expect(errors).not.toHaveBeenCalled()
    } finally {
      errors.mockRestore()
    }
  })

  it('opens a new quote on Alt+Q', () => {
    render(<App />)
    press({ key: 'q', altKey: true })
    expect(push).toHaveBeenCalledWith('/quotes?create=true')
  })

  it('works with the cursor in a field, because Alt+W types nothing', () => {
    render(
      <App>
        <input aria-label="Name" />
      </App>
    )
    press({ key: 'w', altKey: true }, screen.getByLabelText('Name'))
    expect(push).toHaveBeenCalledWith('/work-orders?new=1')
  })

  it('keeps a letter typed in a field out of the calendar', async () => {
    const onWeek = vi.fn()
    render(
      <App>
        <Calendar onWeek={onWeek} />
        <input aria-label="Title" />
        <textarea aria-label="Notes" />
        <div contentEditable aria-label="Message" />
      </App>
    )
    for (const label of ['Title', 'Notes', 'Message']) {
      const event = press({ key: 'w' }, screen.getByLabelText(label))
      expect(event.defaultPrevented).toBe(false)
    }
    expect(onWeek).not.toHaveBeenCalled()

    await pause(600)
    press({ key: 'w' })
    await pause(70)
    expect(onWeek).toHaveBeenCalledTimes(1)
  })

  it('does not answer the calendar letters on any other screen', () => {
    render(<App />)
    const event = press({ key: 'w' })
    expect(event.defaultPrevented).toBe(false)
    expect(push).not.toHaveBeenCalled()
  })

  it('stays quiet while a dialog is open', () => {
    const onWeek = vi.fn()
    render(
      <App>
        <Calendar onWeek={onWeek} />
        <div role="dialog" data-state="open">
          <button type="button">Confirm</button>
        </div>
      </App>
    )
    press({ key: 'w', altKey: true })
    press({ key: 'w' })
    press({ key: 'w' }, screen.getByText('Confirm'))
    expect(push).not.toHaveBeenCalled()
    expect(onWeek).not.toHaveBeenCalled()
  })

  it('has no shortcut for a page this person cannot open', () => {
    render(<App commands={{ visibleSubjects: ['work_orders'] }} />)
    press({ key: 'q', altKey: true })
    expect(push).not.toHaveBeenCalled()
    press({ key: 'w', altKey: true })
    expect(push).toHaveBeenCalledWith('/work-orders?new=1')
  })

  it('uses the key this person chose, everywhere it is shown', () => {
    render(
      <App prefs={{ overrides: { 'create.workOrder': 'alt+n' } }}>
        <span data-testid="hint">
          <ShortcutKeys id="create.workOrder" />
        </span>
      </App>
    )
    expect(screen.getByTestId('hint')).toHaveTextContent('AltN')
    press({ key: 'w', altKey: true })
    expect(push).not.toHaveBeenCalled()
    press({ key: 'n', altKey: true })
    expect(push).toHaveBeenCalledWith('/work-orders?new=1')
  })

  it('opens the list of shortcuts on Ctrl+/ with the keys this person has', async () => {
    render(<App prefs={{ overrides: { 'create.quote': 'alt+z' } }} />)
    press({ key: '/', ctrlKey: true })
    const dialog = await screen.findByRole('dialog', { name: 'Keyboard shortcuts' })
    const quote = within(dialog).getByText('New quote').closest('div') as HTMLElement
    expect(quote).toHaveTextContent('AltZ')
    expect(within(dialog).getByText('Week view')).toBeInTheDocument()
    expect(within(dialog).getByRole('link', { name: 'Change shortcuts' })).toHaveAttribute(
      'href',
      '/settings/shortcuts'
    )
  })
  it('offers no way to the settings page to someone who is turned away from it', async () => {
    render(<App commands={{ visibleSubjects: ['work_orders'] }} />)
    press({ key: '/', ctrlKey: true })
    const dialog = await screen.findByRole('dialog', { name: 'Keyboard shortcuts' })
    expect(within(dialog).getByText('New work order')).toBeInTheDocument()
    expect(within(dialog).queryByRole('link', { name: 'Change shortcuts' })).toBeNull()
  })
})

describe('the Keyboard shortcuts settings page', () => {
  const row = (name: string) => screen.getByText(name).closest('li') as HTMLElement

  it('keeps everything it hides for screen readers inside its own box', () => {
    // A visually hidden element is absolutely positioned. Left without a
    // positioned ancestor inside the page it is laid out against the whole
    // document, below the window, and the settings page starts to scroll as
    // one (seen in the browser; e2e/specs/shortcuts measures the real page).
    render(
      <App>
        <ShortcutsSettings />
      </App>
    )
    const root = screen.getByTestId('shortcuts-settings')
    const hidden = Array.from(document.querySelectorAll('.sr-only'))
    expect(hidden.length).toBeGreaterThan(0)
    for (const element of hidden) {
      expect(root.contains(element)).toBe(true)
      let anchored = false
      for (let node = element.parentElement; node; node = node.parentElement) {
        if (/(^|\s)(relative|absolute|fixed|sticky)(\s|$)/.test(node.className)) anchored = true
        if (node === root) break
      }
      expect(anchored).toBe(true)
    }
  })

  it('records a new key, shows it and saves it', async () => {
    render(
      <App>
        <ShortcutsSettings />
      </App>
    )
    fireEvent.click(screen.getByRole('button', { name: 'Change the shortcut for New quote' }))
    const recorder = screen.getByRole('button', { name: /Recording a new shortcut for New quote/ })
    expect(recorder).toHaveFocus()
    fireEvent.keyDown(recorder, { key: 'z', altKey: true })

    expect(row('New quote')).toHaveTextContent('AltZ')
    expect(row('New quote')).toHaveTextContent('Changed')
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith(
        expect.objectContaining({ overrides: { 'create.quote': 'alt+z' } })
      )
    )
    // The key being recorded did not also run as the shortcut it used to be.
    expect(push).not.toHaveBeenCalled()

    press({ key: 'z', altKey: true })
    expect(push).toHaveBeenCalledWith('/quotes?create=true')
  })

  it('says who has the key already and lets the person take it', async () => {
    render(
      <App>
        <ShortcutsSettings />
      </App>
    )
    fireEvent.click(screen.getByRole('button', { name: 'Change the shortcut for New quote' }))
    fireEvent.keyDown(screen.getByRole('button', { name: /Recording/ }), { key: 'w', altKey: true })

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Alt+W already belongs to New work order. Use it here and that one is left without it.'
    )
    expect(save).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Use it here' }))
    expect(row('New quote')).toHaveTextContent('AltW')
    expect(row('New work order')).toHaveTextContent('No key')
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith(
        expect.objectContaining({
          overrides: { 'create.quote': 'alt+w', 'create.workOrder': '' },
        })
      )
    )
  })

  it('refuses a key the browser keeps, and a bare letter for a shortcut that works everywhere', () => {
    render(
      <App>
        <ShortcutsSettings />
      </App>
    )
    fireEvent.click(screen.getByRole('button', { name: 'Change the shortcut for New quote' }))
    const recorder = screen.getByRole('button', { name: /Recording/ })
    fireEvent.keyDown(recorder, { key: 'w', ctrlKey: true })
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Ctrl+W belongs to the browser or the system and cannot be used.'
    )
    fireEvent.keyDown(recorder, { key: 'q' })
    expect(screen.getByRole('alert')).toHaveTextContent(
      'it needs Ctrl or Alt together with the key'
    )
    expect(save).not.toHaveBeenCalled()
  })

  it('cancels on Escape and leaves the key as it was', () => {
    render(
      <App>
        <ShortcutsSettings />
      </App>
    )
    fireEvent.click(screen.getByRole('button', { name: 'Change the shortcut for New quote' }))
    fireEvent.keyDown(screen.getByRole('button', { name: /Recording/ }), { key: 'Escape' })
    expect(screen.queryByRole('button', { name: /Recording/ })).not.toBeInTheDocument()
    expect(row('New quote')).toHaveTextContent('AltQ')
    expect(save).not.toHaveBeenCalled()
  })

  it('switches one shortcut off', async () => {
    render(
      <App>
        <ShortcutsSettings />
      </App>
    )
    fireEvent.click(screen.getByRole('switch', { name: 'Shortcut for New quote' }))
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith(expect.objectContaining({ disabled: ['create.quote'] }))
    )
    press({ key: 'q', altKey: true })
    expect(push).not.toHaveBeenCalled()
  })

  it('switches the single-letter keys off without touching the rest', () => {
    const onWeek = vi.fn()
    render(
      <App>
        <Calendar onWeek={onWeek} />
        <ShortcutsSettings />
      </App>
    )
    fireEvent.click(screen.getByRole('switch', { name: 'Single-letter keys' }))
    press({ key: 'w' })
    expect(onWeek).not.toHaveBeenCalled()
    press({ key: 'w', altKey: true })
    expect(push).toHaveBeenCalledWith('/work-orders?new=1')
  })

  it('resets one shortcut, and all of them after asking', async () => {
    render(
      <App prefs={{ overrides: { 'create.quote': 'alt+z' }, disabled: ['create.part'] }}>
        <ShortcutsSettings />
      </App>
    )
    fireEvent.click(screen.getByRole('button', { name: 'Reset the shortcut for New quote' }))
    expect(row('New quote')).toHaveTextContent('AltQ')

    fireEvent.click(screen.getByRole('button', { name: 'Reset all to default' }))
    const dialog = await screen.findByRole('alertdialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reset all to default' }))
    await waitFor(() =>
      expect(save).toHaveBeenLastCalledWith(
        expect.objectContaining({ overrides: {}, disabled: [] })
      )
    )
    expect(screen.getByRole('switch', { name: 'Shortcut for New part' })).toBeChecked()
  })

  it('refuses the key that starts the go-to set, and a key fixed to another shortcut', () => {
    render(
      <App>
        <ShortcutsSettings />
      </App>
    )
    fireEvent.click(screen.getByRole('button', { name: 'Change the shortcut for New quote' }))
    fireEvent.keyDown(screen.getByRole('button', { name: /Recording/ }), { key: 'g', altKey: true })
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Alt+G is fixed to another shortcut and cannot be moved.'
    )
    expect(screen.queryByRole('button', { name: 'Use it here' })).toBeNull()
    expect(save).not.toHaveBeenCalled()
  })

  it('keeps a later choice when an earlier save fails behind it', async () => {
    save.mockResolvedValueOnce({ success: false, data: null })
    render(
      <App>
        <ShortcutsSettings />
      </App>
    )
    fireEvent.click(screen.getByRole('button', { name: 'Change the shortcut for New quote' }))
    fireEvent.keyDown(screen.getByRole('button', { name: /Recording/ }), { key: 'z', altKey: true })
    // Before the first save has answered.
    fireEvent.click(screen.getByRole('switch', { name: 'Single-letter keys' }))
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2))
    await pause(20)
    expect(screen.getByRole('switch', { name: 'Single-letter keys' })).not.toBeChecked()
    expect(row('New quote')).toHaveTextContent('AltZ')
  })

  it('puts the old key back when saving fails', async () => {
    save.mockResolvedValueOnce({ success: false, data: null })
    render(
      <App>
        <ShortcutsSettings />
      </App>
    )
    fireEvent.click(screen.getByRole('button', { name: 'Change the shortcut for New quote' }))
    fireEvent.keyDown(screen.getByRole('button', { name: /Recording/ }), { key: 'z', altKey: true })
    await waitFor(() => expect(row('New quote')).toHaveTextContent('AltQ'))
  })
})
