/**
 * The custom fields card shows what the server refused next to the field it
 * refused, and tells the page why the save stopped.
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
  type CustomFieldsSaveOutcome,
} from '@/features/custom-fields/Components/CustomFieldsForm'

async function mount() {
  let run: (() => Promise<CustomFieldsSaveOutcome>) | undefined
  render(
    <CustomFieldsForm
      entityId="job-1"
      entityType="service_record"
      onValuesReady={(fn) => {
        run = fn
      }}
    />
  )
  await screen.findByText('Custom Fields')
  return async () => {
    let outcome: CustomFieldsSaveOutcome | undefined
    await act(async () => {
      outcome = await run?.()
    })
    return outcome
  }
}

const field = (id: string) => screen.getByTestId(`custom-field-${id}`)

const FIELDS = [
  {
    id: 'po',
    name: 'po',
    label: 'PO number',
    fieldType: 'text',
    options: null,
    required: true,
    value: 'PO 1',
  },
  {
    id: 'axles',
    name: 'axles',
    label: 'Axles',
    fieldType: 'number',
    options: null,
    required: false,
    value: '2',
  },
  {
    id: 'bay',
    name: 'bay',
    label: 'Bay',
    fieldType: 'select',
    options: 'Bay 1, Bay 2',
    required: false,
    value: 'Bay 3',
  },
]

beforeEach(() => {
  save.mockReset().mockResolvedValue({ success: true, data: { saved: true } })
  load.mockReset().mockResolvedValue({ success: true, data: FIELDS })
})

describe('saving the custom fields', () => {
  it('sends the values to the checked action and reports a clean save', async () => {
    const run = await mount()

    expect(await run()).toEqual({ valid: true })
    expect(save).toHaveBeenCalledWith('job-1', 'service_record', {
      po: 'PO 1',
      axles: '2',
      bay: 'Bay 3',
    })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('does not hold an old value against the record: "Bay 3" was an option once', async () => {
    const run = await mount()

    expect(await run()).toEqual({ valid: true })
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('shows what the server refused next to the field it refused', async () => {
    save.mockResolvedValue({
      success: true,
      data: {
        saved: false,
        fieldErrors: [
          { fieldId: 'axles', label: 'Axles', issue: 'number' },
          { fieldId: 'bay', label: 'Bay', issue: 'option' },
        ],
      },
    })
    const run = await mount()

    expect(await run()).toEqual({ valid: false, problem: 'invalid', fields: ['Axles', 'Bay'] })
    expect(field('axles')).toHaveTextContent('Axles must be a number')
    expect(field('bay')).toHaveTextContent('Bay must be one of its options')
    expect(field('po')).not.toHaveTextContent('PO number is required')
    expect(field('axles').querySelector('input')).toHaveAttribute('aria-invalid', 'true')
  })

  it('says "required" when that is all the server found', async () => {
    save.mockResolvedValue({
      success: true,
      data: {
        saved: false,
        fieldErrors: [{ fieldId: 'po', label: 'PO number', issue: 'required' }],
      },
    })
    const run = await mount()

    expect(await run()).toEqual({ valid: false, problem: 'required', fields: ['PO number'] })
    expect(field('po')).toHaveTextContent('PO number is required')
  })

  it('clears a field’s message as soon as it is edited', async () => {
    save.mockResolvedValue({
      success: true,
      data: { saved: false, fieldErrors: [{ fieldId: 'axles', label: 'Axles', issue: 'number' }] },
    })
    const run = await mount()
    await run()
    expect(field('axles')).toHaveTextContent('Axles must be a number')

    fireEvent.change(field('axles').querySelector('input') as HTMLInputElement, {
      target: { value: '3' },
    })

    expect(field('axles')).not.toHaveTextContent('Axles must be a number')
  })

  it('hands the page the server’s own words when the document is locked', async () => {
    save.mockResolvedValue({
      success: false,
      error: 'This document is locked because it has been sent.',
    })
    const run = await mount()

    expect(await run()).toEqual({
      valid: false,
      error: 'This document is locked because it has been sent.',
    })
  })

  it('draws a field made required while the form was open, and marks it', async () => {
    const run = await mount()
    fireEvent.change(field('axles').querySelector('input') as HTMLInputElement, {
      target: { value: '4' },
    })
    // The workshop added "Order ref" and made it required since the page loaded.
    load.mockResolvedValue({
      success: true,
      data: [
        ...FIELDS,
        {
          id: 'ref',
          name: 'ref',
          label: 'Order ref',
          fieldType: 'text',
          options: null,
          required: true,
          value: '',
        },
      ],
    })
    save.mockResolvedValue({
      success: true,
      data: {
        saved: false,
        fieldErrors: [{ fieldId: 'ref', label: 'Order ref', issue: 'required' }],
      },
    })

    expect(await run()).toEqual({ valid: false, problem: 'required', fields: ['Order ref'] })
    expect(field('ref')).toHaveTextContent('Order ref is required')
    // What was typed is kept.
    expect(field('axles').querySelector('input')).toHaveValue(4)
  })

  it('stops an empty required field before anything is sent', async () => {
    const run = await mount()
    fireEvent.change(field('po').querySelector('input') as HTMLInputElement, {
      target: { value: '  ' },
    })

    expect(await run()).toEqual({ valid: false, problem: 'required', fields: ['PO number'] })
    expect(save).not.toHaveBeenCalled()
    expect(field('po')).toHaveTextContent('PO number is required')
  })
})
