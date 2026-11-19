/**
 * The custom fields card on a work order or a quote reads its title and its
 * "required" message from the translations, not from English in the code.
 */
import { act, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/features/custom-fields/Actions/customFieldActions', () => ({
  getCustomFieldValues: vi.fn(async () => ({
    success: true,
    data: [
      {
        id: 'f1',
        name: 'key_number',
        label: 'Key number',
        fieldType: 'text',
        options: null,
        required: true,
        value: '',
      },
      {
        id: 'f2',
        name: 'courtesy_car',
        label: 'Courtesy car',
        fieldType: 'checkbox',
        options: null,
        required: true,
        value: 'false',
      },
    ],
  })),
  getFieldDefinitions: vi.fn(async () => ({ success: true, data: [] })),
  saveValidatedCustomFieldValues: vi.fn(async () => ({ success: true, data: { saved: true } })),
}))

import { CustomFieldsForm } from '@/features/custom-fields/Components/CustomFieldsForm'
import en from '../../../../messages/en/settings.json'

describe('the custom fields card', () => {
  it('keeps its English words in the translations', () => {
    expect(en.customFields.formTitle).toBe('Custom Fields')
    expect(en.customFields.requiredError).toBe('{label} is required')
  })

  it('shows its title and names the empty required field when saving', async () => {
    let save: (() => Promise<{ valid: boolean }>) | undefined
    render(
      <CustomFieldsForm
        entityId="rec-1"
        entityType="service_record"
        onValuesReady={(fn) => {
          save = fn
        }}
      />
    )
    expect(await screen.findByText('Custom Fields')).toBeInTheDocument()

    let result: unknown
    await act(async () => {
      result = await save?.()
    })
    expect(result).toEqual({ valid: false, problem: 'required', fields: ['Key number'] })
    expect(screen.getByText('Key number is required')).toBeInTheDocument()
    // A checkbox left unticked is an answer, never a missing one.
    expect(screen.queryByText('Courtesy car is required')).not.toBeInTheDocument()
  })
})
