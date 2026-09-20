/**
 * Opening a work order is not editing it.
 *
 * The notes editor reported an update when it mounted, because tiptap emits
 * one from `setEditable` and `setContent` unless told not to. The work order
 * treats an update as an edit and saves five seconds later, so every page
 * that was merely opened wrote the job back, lines and all. Alone that was a
 * wasted save. With live updates and two people on one job it was a loop:
 * each save woke the other page, which mounted, which saved.
 */
import { act, render, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import { RichTextEditor } from '@/features/vehicles/Components/service-edit/RichTextEditor'
import service from '../../../../messages/en/service.json'

function mount(props: { content: string; editable?: boolean; onChange: (html: string) => void }) {
  const tree = (next: typeof props) => (
    <NextIntlClientProvider locale="en" messages={{ service }} timeZone="UTC">
      <RichTextEditor {...next} />
    </NextIntlClientProvider>
  )
  const view = render(tree(props))
  return { ...view, update: (next: typeof props) => view.rerender(tree(next)) }
}

const editorIn = (container: HTMLElement) =>
  waitFor(() => {
    const element = container.querySelector('.tiptap-content')
    if (!element) throw new Error('editor not mounted yet')
    return element as HTMLElement
  })

describe('the notes editor', () => {
  for (const content of ['', 'plain text from an old record', '<p>Brake pads worn</p>']) {
    it(`reports nothing when it opens with ${JSON.stringify(content)}`, async () => {
      const onChange = vi.fn()
      const { container } = mount({ content, onChange })
      await editorIn(container)
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20))
      })
      expect(onChange).not.toHaveBeenCalled()
    })
  }

  it('reports nothing when the page locks or unlocks it', async () => {
    const onChange = vi.fn()
    const view = mount({ content: '<p>Notes</p>', editable: true, onChange })
    await editorIn(view.container)
    act(() => view.update({ content: '<p>Notes</p>', editable: false, onChange }))
    act(() => view.update({ content: '<p>Notes</p>', editable: true, onChange }))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('reports nothing when a colleague saved and the page put their text in', async () => {
    const onChange = vi.fn()
    const view = mount({ content: '<p>Notes</p>', onChange })
    const editor = await editorIn(view.container)
    act(() => view.update({ content: '<p>Notes, and a second line</p>', onChange }))
    expect(editor.textContent).toBe('Notes, and a second line')
    expect(onChange).not.toHaveBeenCalled()
  })
})
