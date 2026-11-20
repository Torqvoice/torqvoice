/**
 * Days on a piece of equipment are the days written on the plate and the
 * certificate: a year alone or a full date for when it was made, and an
 * examination that is due, due soon or overdue on the workshop's calendar.
 */
import { describe, expect, it } from 'vitest'
import {
  dateToDay,
  dayToDate,
  examinationState,
  isDayKey,
  manufactureText,
  parseManufacture,
} from '@/features/equipment/Lib/equipmentDays'
import { equipmentLabel } from '@/features/equipment/Lib/equipmentLabel'

describe('a day on a piece of equipment', () => {
  it('is a real calendar day', () => {
    expect(isDayKey('2024-02-29')).toBe(true)
    expect(isDayKey('2026-02-29')).toBe(false)
    expect(isDayKey('2026-13-01')).toBe(false)
    expect(isDayKey('20.11.2026')).toBe(false)
  })

  it('comes back from the database as the same day, on any server clock', () => {
    expect(dateToDay(dayToDate('2026-11-20'))).toBe('2026-11-20')
    expect(dateToDay(null)).toBeNull()
  })
})

describe('when it was made', () => {
  it('is a year alone or a full date, as the plate gives it', () => {
    expect(parseManufacture('2019')).toEqual({ year: 2019, day: null })
    expect(parseManufacture(' 2019-05-14 ')).toEqual({ year: 2019, day: '2019-05-14' })
    expect(parseManufacture('19')).toBeNull()
    expect(parseManufacture('1850')).toBeNull()
    expect(parseManufacture('May 2019')).toBeNull()
  })

  it('shows as it was typed when the item is edited', () => {
    expect(manufactureText({ manufactureYear: 2019, manufactureDay: null })).toBe('2019')
    expect(manufactureText({ manufactureYear: 2019, manufactureDay: '2019-05-14' })).toBe(
      '2019-05-14'
    )
    expect(manufactureText({ manufactureYear: null, manufactureDay: null })).toBe('')
  })
})

describe('the next examination', () => {
  it('is overdue once its day has passed, due soon within a month, otherwise fine', () => {
    expect(examinationState('2026-11-19', '2026-11-20')).toBe('overdue')
    expect(examinationState('2026-11-20', '2026-11-20')).toBe('soon')
    expect(examinationState('2026-12-20', '2026-11-20')).toBe('soon')
    expect(examinationState('2026-12-21', '2026-11-20')).toBe('ok')
    expect(examinationState(null, '2026-11-20')).toBeNull()
  })
})

describe('an item’s name', () => {
  it('is its type, make and model, and the serial number that tells two apart', () => {
    expect(
      equipmentLabel({
        typeName: 'Crane',
        make: 'HIAB',
        model: 'X-HiPro 192',
        serialNumber: '4471',
      })
    ).toBe('Crane, HIAB X-HiPro 192 (4471)')
    expect(equipmentLabel({ typeName: 'Tail lift' })).toBe('Tail lift')
  })
})
