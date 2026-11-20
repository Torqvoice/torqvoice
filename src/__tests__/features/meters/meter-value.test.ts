/**
 * @vitest-environment node
 *
 * Meter readings as a workshop types them and as they add up: decimals in
 * the person's own mark, a reading marked wrong that no longer counts, and a
 * replaced meter whose running total carries on.
 */
import { describe, expect, it } from 'vitest'
import {
  isLowerMeterValue,
  lastMeterValueBefore,
  meterLine,
  meterState,
  parseMeterValue,
} from '@/features/meters/Lib/meterValue'
import { documentNumbers } from '@/lib/document-numbers'

describe('a reading as typed', () => {
  it.each([
    ['4256.7', 4256.7],
    ['4256,7', 4256.7],
    ['4,256.7', 4256.7],
    ['4.256,7', 4256.7],
    ['4 256,7', 4256.7],
    ['1,234,567', 1234567],
    ['12845', 12845],
    ['0', 0],
    ['0.25', 0.25],
    ['1.234.567', 1234567],
  ])('reads %s as %s', (typed, value) => {
    expect(parseMeterValue(typed)).toBe(value)
  })

  it.each([
    '',
    'abc',
    '-4',
    '4.256.7,1,2',
    '12.345',
    '4,256',
    '1e5',
    // One mark used twice, groups not of three, or both marks the same.
    '4.256.7',
    '1,5,0',
    '12,34,567',
    '4,256,7',
    '1.234,567',
  ])('is not a reading: %j', (typed) => {
    // "12.345" is three decimals: refused rather than rounded or read as thousands.
    expect(parseMeterValue(typed)).toBeNull()
  })

  it('takes a number as it is', () => {
    expect(parseMeterValue(4256.7)).toBe(4256.7)
    expect(parseMeterValue(-1)).toBeNull()
    // More than two decimals is refused, not rounded, whichever way it comes.
    expect(parseMeterValue(4256.725)).toBeNull()
  })
})

describe('printing a reading', () => {
  it('prints in the document’s number format with the meter’s unit', () => {
    const en = documentNumbers('en-GB')
    const fr = documentNumbers('fr-FR')
    expect(meterLine({ name: 'Engine hours', unit: 'hrs', value: 4256.7 }, en.meter)).toBe(
      'Engine hours: 4,256.7 hrs'
    )
    expect(meterLine({ name: 'PTO', unit: 'h', value: 2984.3 }, fr.meter)).toBe('PTO: 2 984,3 h')
    expect(meterLine({ name: 'Counter', unit: '', value: 12 }, en.meter)).toBe('Counter: 12')
  })

  it('leaves the odometer’s own format alone', () => {
    expect(documentNumbers('en-GB').distance(12845)).toBe('12,845')
  })
})

const at = (day: string) => new Date(`${day}T12:00:00Z`)
const reading = (
  id: string,
  value: number,
  day: string,
  extra: Partial<{ replacedFrom: number; wrong: boolean }> = {}
) => ({
  id,
  value,
  readAt: at(day),
  createdAt: at(day),
  replacedFrom: extra.replacedFrom ?? null,
  wrongAt: extra.wrong ? at(day) : null,
})

describe('what a meter reads', () => {
  it('is the newest reading that counts', () => {
    const state = meterState([
      reading('a', 100, '2026-01-01'),
      reading('c', 300.5, '2026-03-01'),
      reading('b', 200, '2026-02-01'),
    ])
    expect(state.current?.id).toBe('c')
    expect(state.total).toBe(300.5)
  })

  it('skips a reading marked as wrong, which stays in the history', () => {
    const readings = [
      reading('a', 100, '2026-01-01'),
      reading('b', 9999, '2026-02-01', { wrong: true }),
    ]
    expect(meterState(readings).current?.id).toBe('a')
    expect(readings).toHaveLength(2)
  })

  it('carries the old counter on in the total when the meter was replaced', () => {
    const state = meterState([
      reading('a', 9700, '2026-01-01'),
      // The old meter came off at 9,800; the new one went on at 12.
      reading('r', 12, '2026-02-01', { replacedFrom: 9800 }),
      reading('b', 132, '2026-03-01'),
    ])
    expect(state.current?.value).toBe(132)
    expect(state.total).toBe(9920)
  })

  it('knows nothing of a meter without readings', () => {
    expect(meterState([])).toEqual({ current: null, total: null })
  })
})

describe('a lower reading', () => {
  const readings = [reading('a', 4000, '2026-01-01'), reading('b', 4200, '2026-03-01')]

  it('is judged against the last reading before it', () => {
    expect(lastMeterValueBefore(readings, { readAt: at('2026-02-01') })).toBe(4000)
    expect(lastMeterValueBefore(readings, { readAt: at('2026-04-01') })).toBe(4200)
    expect(lastMeterValueBefore(readings, { readAt: at('2025-12-01') })).toBeNull()
  })

  it('is not judged against the old counter after a replacement', () => {
    const replaced = [...readings, reading('r', 5, '2026-04-01', { replacedFrom: 4300 })]
    expect(lastMeterValueBefore(replaced, { readAt: at('2026-05-01') })).toBe(5)
  })

  it('is not judged against a reading marked wrong, nor against itself', () => {
    const marked = [
      reading('a', 4000, '2026-01-01'),
      reading('x', 90000, '2026-02-01', { wrong: true }),
    ]
    expect(lastMeterValueBefore(marked, { readAt: at('2026-03-01') })).toBe(4000)
    expect(lastMeterValueBefore(readings, { readAt: at('2026-04-01'), excludeId: 'b' })).toBe(4000)
  })

  it('is said, never refused, and only for a real number below the last one', () => {
    expect(isLowerMeterValue('3999,5', 4000)).toBe(true)
    expect(isLowerMeterValue('4000', 4000)).toBe(false)
    expect(isLowerMeterValue('', 4000)).toBe(false)
    expect(isLowerMeterValue('abc', 4000)).toBe(false)
    expect(isLowerMeterValue('1', null)).toBe(false)
  })
})
