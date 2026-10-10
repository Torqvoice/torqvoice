import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SaveShortcutListener } from '@/components/save-shortcut-listener'
import { useSaveShortcut } from '@/hooks/use-save-shortcut'

// jsdom lays nothing out, so every element reports no rects; the listener
// reads that as hidden.
const visible = () => [{}] as unknown as DOMRectList

function pressSave() {
  const event = new KeyboardEvent('keydown', {
    key: 's',
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
  })
  ;(document.activeElement ?? document.body).dispatchEvent(event)
  vi.runAllTimers()
  return event
}

function Editor({ onSave }: { onSave: () => void }) {
  useSaveShortcut(onSave)
  return null
}

describe('SaveShortcutListener', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(visible)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('presses the marked save button on the page', () => {
    const save = vi.fn()
    render(
      <>
        <SaveShortcutListener />
        <button type="button" data-save-shortcut onClick={save}>
          Save
        </button>
      </>
    )
    const event = pressSave()
    expect(save).toHaveBeenCalledTimes(1)
    expect(event.defaultPrevented).toBe(true)
  })

  it('leaves the key alone when nothing on the page saves', () => {
    const send = vi.fn()
    render(
      <>
        <SaveShortcutListener />
        <button type="button" onClick={send}>
          Send
        </button>
      </>
    )
    const event = pressSave()
    expect(send).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
  })

  it('saves the card being typed in, and gives the field its focus back', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { getByTestId } = render(
      <>
        <SaveShortcutListener />
        <section>
          <button type="button" data-save-shortcut onClick={first}>
            Save
          </button>
        </section>
        <section>
          <input data-testid="field" />
          <button type="button" data-save-shortcut onClick={second}>
            Save
          </button>
        </section>
      </>
    )
    const field = getByTestId('field')
    field.focus()
    pressSave()
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
    expect(document.activeElement).toBe(field)
  })

  it('skips a disabled save button', () => {
    const save = vi.fn()
    render(
      <>
        <SaveShortcutListener />
        <button type="button" data-save-shortcut disabled onClick={save}>
          Save
        </button>
      </>
    )
    expect(pressSave().defaultPrevented).toBe(false)
    expect(save).not.toHaveBeenCalled()
  })

  it('saves the open dialog rather than the editor or the page under it', () => {
    const page = vi.fn()
    const editor = vi.fn()
    const dialog = vi.fn()
    render(
      <>
        <SaveShortcutListener />
        <Editor onSave={editor} />
        <button type="button" data-save-shortcut onClick={page}>
          Save
        </button>
        <div role="dialog" data-state="open" data-slot="dialog-content">
          <button type="button" data-save-shortcut onClick={dialog}>
            Save
          </button>
        </div>
      </>
    )
    pressSave()
    expect(dialog).toHaveBeenCalledTimes(1)
    expect(editor).not.toHaveBeenCalled()
    expect(page).not.toHaveBeenCalled()
  })

  it('lets the editor save first and does not press a page button as well', () => {
    const page = vi.fn()
    const editor = vi.fn()
    render(
      <>
        <SaveShortcutListener />
        <Editor onSave={editor} />
        <button type="button" data-save-shortcut onClick={page}>
          Save
        </button>
      </>
    )
    pressSave()
    expect(editor).toHaveBeenCalledTimes(1)
    expect(page).not.toHaveBeenCalled()
  })

  it('does not press a page button behind a dialog that has nothing to save', () => {
    const page = vi.fn()
    render(
      <>
        <SaveShortcutListener />
        <button type="button" data-save-shortcut onClick={page}>
          Save
        </button>
        <div role="dialog" data-state="open" data-slot="dialog-content">
          <button type="button">Send</button>
        </div>
      </>
    )
    pressSave()
    expect(page).not.toHaveBeenCalled()
  })
})
