/**
 * The tag box on the part form, used the way a person types into it.
 *
 * What matters is that what was typed ends up as tags, never twice, and that
 * Enter in the box adds a tag instead of saving the form half filled in.
 */

import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TagInput } from '@/components/tag-input'

function Harness({
  initial = [],
  suggestions = [],
  onSubmit = vi.fn(),
  maxTags,
}: {
  initial?: string[]
  suggestions?: string[]
  onSubmit?: () => void
  maxTags?: number
}) {
  const [tags, setTags] = useState<string[]>(initial)
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit()
      }}
    >
      <label htmlFor="tags">Tags</label>
      <TagInput
        id="tags"
        value={tags}
        onChange={setTags}
        suggestions={suggestions}
        maxTags={maxTags}
        // As the part form sets it.
        maxLength={40}
        tooLongMessage="A tag can be at most 40 characters."
        removeLabel={(tag) => `Remove ${tag}`}
      />
      <output data-testid="tags">{tags.join('|')}</output>
      <button type="submit">Save</button>
    </form>
  )
}

const tagsShown = () => screen.getByTestId('tags').textContent

describe('TagInput', () => {
  it('adds a tag on Enter without submitting the form', async () => {
    const onSubmit = vi.fn()
    render(<Harness onSubmit={onSubmit} />)
    await userEvent.type(screen.getByLabelText('Tags'), 'Toyota{Enter}')
    expect(tagsShown()).toBe('Toyota')
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Tags')).toHaveValue('')
  })

  it('adds a tag at each comma, and a pasted list all at once', async () => {
    render(<Harness />)
    const box = screen.getByLabelText('Tags')
    await userEvent.type(box, 'Toyota,Hilux,')
    expect(tagsShown()).toBe('Toyota|Hilux')

    await userEvent.click(box)
    await userEvent.paste('Corolla, Yaris, Hia')
    expect(tagsShown()).toBe('Toyota|Hilux|Corolla|Yaris')
    // The text after the last comma is still being typed.
    expect(box).toHaveValue('Hia')
  })

  it('keeps what was typed when the box is left', async () => {
    render(<Harness />)
    await userEvent.type(screen.getByLabelText('Tags'), 'Ranger')
    await userEvent.click(document.body)
    expect(tagsShown()).toBe('Ranger')
  })

  it('does not add the same tag twice in another case', async () => {
    render(<Harness initial={['Toyota']} />)
    await userEvent.type(screen.getByLabelText('Tags'), 'toyota{Enter}')
    expect(tagsShown()).toBe('Toyota')
  })

  it('takes the last tag off with Backspace in an empty box, or one by its button', async () => {
    render(<Harness initial={['Toyota', 'Hilux', 'Diesel']} />)
    await userEvent.type(screen.getByLabelText('Tags'), '{Backspace}')
    expect(tagsShown()).toBe('Toyota|Hilux')
    await userEvent.click(screen.getByRole('button', { name: 'Remove Toyota' }))
    expect(tagsShown()).toBe('Hilux')
  })

  it('lets Enter in an empty box submit the form as usual', async () => {
    const onSubmit = vi.fn()
    render(<Harness initial={['Toyota']} onSubmit={onSubmit} />)
    await userEvent.type(screen.getByLabelText('Tags'), '{Enter}')
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('suggests the workshop’s tags while typing and adds the one picked', async () => {
    render(<Harness initial={['Toyota']} suggestions={['Hilux', 'Toyota', 'Hiace', 'Ranger']} />)
    await userEvent.type(screen.getByLabelText('Tags'), 'hi')

    const options = screen.getAllByRole('option').map((o) => o.textContent)
    // Narrowed by what was typed, and never a tag the part already has.
    expect(options).toEqual(['Hilux', 'Hiace'])

    await userEvent.click(screen.getByRole('option', { name: 'Hiace' }))
    expect(tagsShown()).toBe('Toyota|Hiace')
  })

  it('picks a suggestion with the arrow keys and Enter', async () => {
    render(<Harness suggestions={['Hilux', 'Hiace']} />)
    await userEvent.type(screen.getByLabelText('Tags'), 'hi{ArrowDown}{ArrowDown}{Enter}')
    expect(tagsShown()).toBe('Hiace')
  })

  it('stops taking tags at the limit', async () => {
    render(<Harness initial={['A1', 'A2']} maxTags={3} />)
    await userEvent.type(screen.getByLabelText('Tags'), 'A3,A4,')
    expect(tagsShown()).toBe('A1|A2|A3')
    expect(screen.queryByLabelText('Tags')).toBeNull()
  })

  it('keeps every tag of a pasted list longer than one tag may be', async () => {
    render(<Harness />)
    const box = screen.getByLabelText('Tags')
    await userEvent.click(box)
    // 43 characters in all, each tag well inside the 40 a tag may have.
    await userEvent.paste('Toyota, Hilux, Corolla, Land Cruiser, Hiace')
    expect(tagsShown()).toBe('Toyota|Hilux|Corolla|Land Cruiser')
    // The last one, with no comma after it, is whole in the box.
    expect(box).toHaveValue('Hiace')
    await userEvent.keyboard('{Enter}')
    expect(tagsShown()).toBe('Toyota|Hilux|Corolla|Land Cruiser|Hiace')
  })

  it('keeps a tag that is too long in the box, says why, and adds the rest', async () => {
    const long = 'x'.repeat(41)
    render(<Harness />)
    const box = screen.getByLabelText('Tags')
    await userEvent.click(box)
    await userEvent.paste(`Toyota, ${long}, Hilux`)
    await userEvent.keyboard('{Enter}')

    expect(tagsShown()).toBe('Toyota|Hilux')
    expect(box).toHaveValue(long)
    const message = screen.getByText('A tag can be at most 40 characters.')
    expect(box).toHaveAttribute('aria-invalid', 'true')
    expect(box).toHaveAttribute('aria-describedby', message.id)

    // Shortened, it is added and the message goes.
    await userEvent.clear(box)
    await userEvent.type(box, 'Land Cruiser{Enter}')
    expect(tagsShown()).toBe('Toyota|Hilux|Land Cruiser')
    expect(screen.queryByText('A tag can be at most 40 characters.')).toBeNull()
    expect(box).not.toHaveAttribute('aria-invalid')
  })

  it('tells assistive technology which suggestion Enter will pick', async () => {
    render(<Harness suggestions={['Hilux', 'Hiace']} />)
    const box = screen.getByLabelText('Tags')
    await userEvent.type(box, 'hi')
    const list = screen.getByRole('listbox')
    expect(box).toHaveAttribute('aria-controls', list.id)
    expect(box).not.toHaveAttribute('aria-activedescendant')

    await userEvent.keyboard('{ArrowDown}{ArrowDown}')
    const hiace = screen.getByRole('option', { name: 'Hiace' })
    expect(box).toHaveAttribute('aria-activedescendant', hiace.id)
    expect(hiace).toHaveAttribute('aria-selected', 'true')
  })
})
