import { describe, expect, it } from 'vitest'
import { parseWorkshopDateTime } from '@/features/scheduled-messages/Lib/parseWorkshopDateTime'

describe('parseWorkshopDateTime', () => {
  it('reads a wall-clock time in the workshop zone, not the server zone', () => {
    expect(parseWorkshopDateTime('2026-09-07T18:00', 'Europe/Oslo').toISOString()).toBe(
      '2026-09-07T16:00:00.000Z'
    )
    expect(parseWorkshopDateTime('2026-01-07T18:00', 'Europe/Oslo').toISOString()).toBe(
      '2026-01-07T17:00:00.000Z'
    )
    expect(parseWorkshopDateTime('2026-09-07T18:00:30', 'America/New_York').toISOString()).toBe(
      '2026-09-07T22:00:00.000Z'
    )
  })

  it('treats a bare date as that day at midnight in the workshop', () => {
    expect(parseWorkshopDateTime('2026-09-07', 'Europe/Oslo').toISOString()).toBe(
      '2026-09-06T22:00:00.000Z'
    )
  })

  it('leaves a string with its own zone alone', () => {
    expect(parseWorkshopDateTime('2026-09-07T18:00:00Z', 'Europe/Oslo').toISOString()).toBe(
      '2026-09-07T18:00:00.000Z'
    )
  })

  it('rejects rubbish', () => {
    expect(() => parseWorkshopDateTime('soon', 'Europe/Oslo')).toThrow('Invalid send time')
  })
})
