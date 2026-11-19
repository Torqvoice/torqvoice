/**
 * What a custom field's value may be for its type. The form and the server
 * share these rules, so the browser and a hand-made request get one answer.
 */
import { describe, expect, it } from 'vitest'
import {
  CUSTOM_FIELD_VALUE_MAX_LENGTH,
  customFieldOptions,
  customFieldValueIssue,
} from '@/features/custom-fields/Lib/customFieldValueRules'

const field = (fieldType: string, extra: { options?: string; required?: boolean } = {}) => ({
  fieldType,
  options: extra.options ?? null,
  required: extra.required ?? false,
})

describe('an empty value', () => {
  it.each([
    'text',
    'textarea',
    'number',
    'date',
    'select',
    'checkbox',
  ])('is fine on a %s field that is not required', (type) => {
    expect(customFieldValueIssue(field(type, { options: 'A, B' }), '')).toBeNull()
  })

  it.each([
    'text',
    'textarea',
    'number',
    'date',
    'select',
  ])('is refused on a required %s field, spaces included', (type) => {
    const required = field(type, { options: 'A, B', required: true })
    expect(customFieldValueIssue(required, '')).toBe('required')
    expect(customFieldValueIssue(required, '   ')).toBe('required')
  })

  it('is an answer on a required checkbox: left unticked', () => {
    expect(customFieldValueIssue(field('checkbox', { required: true }), '')).toBeNull()
    expect(customFieldValueIssue(field('checkbox', { required: true }), 'false')).toBeNull()
  })
})

describe('a number field', () => {
  it.each(['12', '-3', '12.5', '0', '1e3'])('takes %s', (value) => {
    expect(customFieldValueIssue(field('number'), value)).toBeNull()
  })

  it.each(['twelve', '12 km', '1,5', 'NaN', 'Infinity', '   '])('refuses "%s"', (value) => {
    expect(customFieldValueIssue(field('number'), value)).toBe('number')
  })
})

describe('a date field', () => {
  it('takes a calendar day', () => {
    expect(customFieldValueIssue(field('date'), '2026-03-10')).toBeNull()
    expect(customFieldValueIssue(field('date'), '2028-02-29')).toBeNull()
  })

  it.each([
    '10/03/2026',
    '2026-3-10',
    '2026-02-30',
    '2027-02-29',
    '2026-13-01',
    'tomorrow',
  ])('refuses "%s"', (value) => {
    expect(customFieldValueIssue(field('date'), value)).toBe('date')
  })
})

describe('a checkbox', () => {
  it('holds true or false and nothing else', () => {
    expect(customFieldValueIssue(field('checkbox'), 'true')).toBeNull()
    expect(customFieldValueIssue(field('checkbox'), 'false')).toBeNull()
    expect(customFieldValueIssue(field('checkbox'), 'yes')).toBe('checkbox')
    expect(customFieldValueIssue(field('checkbox'), 'on')).toBe('checkbox')
  })
})

describe('a select field', () => {
  const colour = field('select', { options: 'Red, Dark blue ,Green,' })

  it('reads its options from the comma-separated list, trimmed', () => {
    expect(customFieldOptions('Red, Dark blue ,Green,')).toEqual(['Red', 'Dark blue', 'Green'])
    expect(customFieldOptions(null)).toEqual([])
  })

  it('takes one of its options', () => {
    expect(customFieldValueIssue(colour, 'Dark blue')).toBeNull()
  })

  it('refuses anything else, however close', () => {
    expect(customFieldValueIssue(colour, 'Yellow')).toBe('option')
    expect(customFieldValueIssue(colour, 'red')).toBe('option')
    expect(customFieldValueIssue(colour, 'Red, Green')).toBe('option')
  })
})

describe('text', () => {
  it('takes whatever is typed, on one line or several', () => {
    expect(customFieldValueIssue(field('text'), 'PO 4471 / "urgent"')).toBeNull()
    expect(customFieldValueIssue(field('textarea'), 'line one\nline two')).toBeNull()
  })

  it('stops at a length no field is for', () => {
    const atLimit = 'x'.repeat(CUSTOM_FIELD_VALUE_MAX_LENGTH)
    expect(customFieldValueIssue(field('textarea'), atLimit)).toBeNull()
    expect(customFieldValueIssue(field('textarea'), `${atLimit}x`)).toBe('tooLong')
  })

  it('treats a type it does not know as text', () => {
    expect(customFieldValueIssue(field('colour_picker'), '#ff0000')).toBeNull()
  })
})
