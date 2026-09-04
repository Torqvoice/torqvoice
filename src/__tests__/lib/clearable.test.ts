import { describe, it, expect } from 'vitest'
import { clearableInput, clearedToNull } from '@/lib/clearable'

describe('clearableInput', () => {
  it('sends the trimmed text when there is any', () => {
    expect(clearableInput('  ABC123 ', true)).toBe('ABC123')
    expect(clearableInput('  ABC123 ', false)).toBe('ABC123')
  })

  it("sends '' for an emptied field when editing, so the action clears it", () => {
    expect(clearableInput('', true)).toBe('')
    expect(clearableInput('   ', true)).toBe('')
    expect(clearableInput(null, true)).toBe('')
  })

  it('leaves an empty field out when creating', () => {
    expect(clearableInput('', false)).toBeUndefined()
    expect(clearableInput(null, false)).toBeUndefined()
    expect(clearableInput(undefined, false)).toBeUndefined()
  })
})

describe('clearedToNull', () => {
  it('keeps an untouched field untouched', () => {
    expect(clearedToNull(undefined)).toBeUndefined()
  })

  it('turns an emptied field into null', () => {
    expect(clearedToNull('')).toBeNull()
    expect(clearedToNull('   ')).toBeNull()
    expect(clearedToNull(null)).toBeNull()
  })

  it('stores other values trimmed', () => {
    expect(clearedToNull(' hello ')).toBe('hello')
  })
})

describe('schemas behind clearable number fields', () => {
  it('let a cleared reading through as null instead of coercing it to 0', async () => {
    const { updateReminderSchema } = await import('@/features/vehicles/Schema/reminderSchema')
    const { updateServiceSchema } = await import('@/features/vehicles/Schema/serviceSchema')
    expect(updateReminderSchema.parse({ id: 'r1', dueMileage: null }).dueMileage).toBeNull()
    expect(updateServiceSchema.parse({ id: 's1', mileage: null }).mileage).toBeNull()
  })
})
