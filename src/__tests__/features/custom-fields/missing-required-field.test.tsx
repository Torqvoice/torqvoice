/**
 * A required custom field left empty: the person is shown which one, by the
 * name the workshop gave it.
 *
 * Under the field, its own message. On the field, the invalid mark, tied to
 * that message for a screen reader. On a save they asked for, the focus goes
 * to the first field that is missing and it is scrolled into view. And the
 * page is handed the names, so its toast can say "Fill in: Fleet contact,
 * Cost centre" rather than that something, somewhere, is wrong.
 */
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const save = vi.hoisted(() => vi.fn())
const load = vi.hoisted(() => vi.fn())
vi.mock('@/features/custom-fields/Actions/customFieldActions', () => ({
  getCustomFieldValues: load,
  getFieldDefinitions: vi.fn(async () => ({ success: true, data: [] })),
  saveValidatedCustomFieldValues: save,
}))

import {
  CustomFieldsForm,
  type CustomFieldsSave,
  type CustomFieldsSaveOutcome,
} from '@/features/custom-fields/Components/CustomFieldsForm'

const base = { options: null as string | null, required: false, value: '' }
const FIELDS = [
  { ...base, id: 'colour', name: 'colour', label: 'Colour', fieldType: 'text' },
  {
    ...base,
    id: 'contact',
    name: 'contact',
    label: 'Fleet contact',
    fieldType: 'text',
    required: true,
  },
  { ...base, id: 'due', name: 'due', label: 'Next test due', fieldType: 'date', required: true },
  {
    ...base,
    id: 'centre',
    name: 'centre',
    label: 'Cost centre',
    fieldType: 'select',
    options: 'North, South',
    required: true,
  },
  {
    ...base,
    id: 'loan',
    name: 'loan',
    label: 'Courtesy car',
    fieldType: 'checkbox',
    required: true,
  },
]

async function mount(entityType: 'service_record' | 'quote' = 'service_record', locked = false) {
  let run: CustomFieldsSave | undefined
  render(
    <CustomFieldsForm
      entityId="rec-1"
      entityType={entityType}
      locked={locked}
      onValuesReady={(fn) => {
        run = fn
      }}
    />
  )
  await screen.findByText('Custom Fields')
  return async (options?: { reveal?: boolean }) => {
    let outcome: CustomFieldsSaveOutcome | undefined
    await act(async () => {
      outcome = await run?.(options)
    })
    return outcome
  }
}

const wrapper = (id: string) => screen.getByTestId(`custom-field-${id}`)
const control = (id: string) =>
  wrapper(id).querySelector(
    'input:not([type="hidden"]), textarea, button[role="combobox"]'
  ) as HTMLElement
const type = (id: string, value: string) => fireEvent.change(control(id), { target: { value } })

const scrolled = vi.fn()

beforeEach(() => {
  save.mockReset().mockResolvedValue({ success: true, data: { saved: true } })
  load.mockReset().mockResolvedValue({ success: true, data: FIELDS })
  scrolled.mockReset()
  // The dropdown measures itself; jsdom has nothing to measure with.
  const nothing = () => undefined
  globalThis.ResizeObserver = class {
    observe = nothing
    unobserve = nothing
    disconnect = nothing
  }
  // jsdom draws nothing, so it has no scrolling of its own to watch.
  Element.prototype.scrollIntoView = function scrollIntoView(this: Element) {
    scrolled(this.textContent)
  }
})

describe.each(['service_record', 'quote'] as const)('saving a %s', (entityType) => {
  it('with one required field empty: names it under the field and takes the person there', async () => {
    const run = await mount(entityType)
    type('due', '25/03/2027')
    fireEvent.blur(control('due'))
    fireEvent.click(control('centre'))
    fireEvent.click(await screen.findByRole('option', { name: 'North' }))

    const outcome = await run()

    expect(outcome).toEqual({ valid: false, problem: 'required', fields: ['Fleet contact'] })
    expect(save).not.toHaveBeenCalled()
    // Its own message, under its own field, and nowhere else.
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(wrapper('contact')).toHaveTextContent('Fleet contact is required')
    // Marked invalid, and the mark points at the message.
    const input = control('contact')
    const message = screen.getByText('Fleet contact is required')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAttribute('aria-describedby', message.id)
    // Focus on the field, and the message brought into view.
    expect(input).toHaveFocus()
    expect(scrolled).toHaveBeenLastCalledWith('Fleet contact is required')
  })

  it('with two required fields empty: names both, and goes to the first', async () => {
    const run = await mount(entityType)
    type('due', '25/03/2027')
    fireEvent.blur(control('due'))

    const outcome = await run()

    expect(outcome).toEqual({
      valid: false,
      problem: 'required',
      fields: ['Fleet contact', 'Cost centre'],
    })
    expect(wrapper('contact')).toHaveTextContent('Fleet contact is required')
    expect(wrapper('centre')).toHaveTextContent('Cost centre is required')
    expect(screen.getAllByRole('alert')).toHaveLength(2)
    // A dropdown is marked and tied to its message like any other field.
    const dropdown = control('centre')
    expect(dropdown).toHaveAttribute('aria-invalid', 'true')
    expect(dropdown).toHaveAttribute(
      'aria-describedby',
      screen.getByText('Cost centre is required').id
    )
    expect(control('contact')).toHaveFocus()
  })

  it('with every required field filled: saves, with nothing marked', async () => {
    const run = await mount(entityType)
    type('contact', 'Dana')
    type('due', '25/03/2027')
    fireEvent.blur(control('due'))
    fireEvent.click(control('centre'))
    fireEvent.click(await screen.findByRole('option', { name: 'South' }))

    expect(await run()).toEqual({ valid: true })

    expect(save).toHaveBeenCalledWith('rec-1', entityType, {
      colour: '',
      contact: 'Dana',
      due: '2027-03-25',
      centre: 'South',
      loan: '',
    })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(control('contact')).not.toHaveAttribute('aria-invalid')
  })
})

describe('the details', () => {
  it('a date field is marked and tied to its message too', async () => {
    const run = await mount()
    type('contact', 'Dana')

    await run()

    const date = control('due')
    expect(date).toHaveAttribute('aria-invalid', 'true')
    expect(date).toHaveAttribute(
      'aria-describedby',
      screen.getByText('Next test due is required').id
    )
    expect(date).toHaveFocus()
  })

  it('each label belongs to its field, so a screen reader names what it lands on', async () => {
    await mount()
    expect(screen.getByLabelText(/Fleet contact/)).toBe(control('contact'))
    expect(screen.getByLabelText(/Next test due/)).toBe(control('due'))
  })

  it('an autosave marks the field but leaves the person where they are typing', async () => {
    const run = await mount()
    const elsewhere = document.createElement('input')
    document.body.appendChild(elsewhere)
    elsewhere.focus()

    const outcome = await run({ reveal: false })

    expect(outcome).toMatchObject({
      valid: false,
      fields: ['Fleet contact', 'Next test due', 'Cost centre'],
    })
    expect(wrapper('contact')).toHaveTextContent('Fleet contact is required')
    expect(elsewhere).toHaveFocus()
    expect(scrolled).not.toHaveBeenCalled()
    elsewhere.remove()
  })

  it('pressing Save again with nothing fixed takes them to the field again', async () => {
    const run = await mount()
    await run()
    expect(control('contact')).toHaveFocus()
    act(() => control('colour').focus())
    scrolled.mockReset()

    await run()

    expect(control('contact')).toHaveFocus()
    expect(scrolled).toHaveBeenCalledTimes(1)
  })

  it('the message goes as soon as the field is filled in, and the next one is next', async () => {
    const run = await mount()
    await run()
    type('contact', 'Dana')
    expect(wrapper('contact')).not.toHaveTextContent('is required')
    expect(control('contact')).not.toHaveAttribute('aria-invalid')

    const outcome = await run()

    expect(outcome).toMatchObject({ fields: ['Next test due', 'Cost centre'] })
    expect(control('due')).toHaveFocus()
  })

  it('a field the server says is missing is named the same way', async () => {
    load.mockResolvedValue({
      success: true,
      data: FIELDS.map((f) => ({ ...f, required: false })),
    })
    save.mockResolvedValue({
      success: true,
      data: {
        saved: false,
        fieldErrors: [
          { fieldId: 'contact', label: 'Fleet contact', issue: 'required' },
          { fieldId: 'centre', label: 'Cost centre', issue: 'required' },
        ],
      },
    })
    const run = await mount()

    const outcome = await run()

    expect(outcome).toEqual({
      valid: false,
      problem: 'required',
      fields: ['Fleet contact', 'Cost centre'],
    })
    expect(wrapper('contact')).toHaveTextContent('Fleet contact is required')
    expect(wrapper('centre')).toHaveTextContent('Cost centre is required')
    expect(control('contact')).toHaveFocus()
  })

  it('on a locked document the fields are no step of the save: nothing is asked for or sent', async () => {
    // Read-only on the page, so an empty required field cannot be filled in
    // and must not stop the page saving what it still can.
    const run = await mount('service_record', true)

    expect(await run()).toEqual({ valid: true })

    expect(save).not.toHaveBeenCalled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(scrolled).not.toHaveBeenCalled()
  })

  it('a required checkbox left unticked is never called missing', async () => {
    const run = await mount()
    const outcome = await run()
    expect(outcome).toMatchObject({ fields: expect.not.arrayContaining(['Courtesy car']) })
  })
})
