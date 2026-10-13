/**
 * The notes of a locked quote cannot be typed into.
 *
 * The quote page turns its fields off with a disabled fieldset, which stops
 * inputs and buttons but not a contenteditable. The notes editor is one, so
 * on a locked quote it still took typing, showed it, and never saved it. The
 * editor is told about the lock now, and this holds it to that.
 */

import { act, render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { QuoteNotesEditor } from '@/features/quotes/Components/QuoteNotesEditor'
import { TooltipProvider } from '@/components/ui/tooltip'

function mount(props: { locked: boolean; noteType?: 'public' | 'internal' }) {
  const onDescriptionChange = vi.fn()
  const onNotesChange = vi.fn()
  const tree = (next: typeof props) => (
    <TooltipProvider>
      <fieldset disabled={next.locked}>
        <QuoteNotesEditor
          noteType={next.noteType ?? 'public'}
          onNoteTypeChange={vi.fn()}
          description="<p>Front pads are at 2 mm</p>"
          onDescriptionChange={onDescriptionChange}
          notes="<p>Customer is price sensitive</p>"
          onNotesChange={onNotesChange}
          locked={next.locked}
          t={(key) => key}
        />
      </fieldset>
    </TooltipProvider>
  )
  const view = render(tree(props))
  return {
    ...view,
    onDescriptionChange,
    onNotesChange,
    update: (next: typeof props) => view.rerender(tree(next)),
  }
}

const editorIn = (container: HTMLElement) =>
  waitFor(() => {
    const element = container.querySelector('.tiptap-content')
    if (!element) throw new Error('editor not mounted yet')
    return element as HTMLElement
  })

describe('the notes of a quote', () => {
  it('can be written while the quote is open', async () => {
    const view = mount({ locked: false })
    const editor = await editorIn(view.container)
    expect(editor).toHaveAttribute('contenteditable', 'true')
    // The toolbar is there to write with.
    expect(view.container.querySelector('button[title="Bold"]')).not.toBeNull()
  })

  it.each([
    'public',
    'internal',
  ] as const)('cannot be typed into on a locked quote (%s note)', async (noteType) => {
    const view = mount({ locked: true, noteType })
    const editor = await editorIn(view.container)
    expect(editor).toHaveAttribute('contenteditable', 'false')
    // No toolbar either: nothing on the card suggests the text can change.
    expect(view.container.querySelector('button[title="Bold"]')).toBeNull()
    expect(view.onDescriptionChange).not.toHaveBeenCalled()
    expect(view.onNotesChange).not.toHaveBeenCalled()
  })

  it('follows the lock as it engages and lifts, without reporting an edit', async () => {
    const view = mount({ locked: false })
    const editor = await editorIn(view.container)

    act(() => view.update({ locked: true }))
    await waitFor(() => expect(editor).toHaveAttribute('contenteditable', 'false'))

    act(() => view.update({ locked: false }))
    await waitFor(() => expect(editor).toHaveAttribute('contenteditable', 'true'))

    // Locking and unlocking are not edits, and must not queue a save.
    expect(view.onDescriptionChange).not.toHaveBeenCalled()
    expect(view.onNotesChange).not.toHaveBeenCalled()
  })

  it('keeps showing what was written when it locks', async () => {
    const view = mount({ locked: true })
    const editor = await editorIn(view.container)
    expect(editor.textContent).toBe('Front pads are at 2 mm')
  })
})
