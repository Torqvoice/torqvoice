/**
 * @vitest-environment node
 *
 * What a reading field calls lower, or so much higher that a digit may have
 * slipped in. The rule that moves the vehicle's reading runs in the database
 * and is tested there: src/__tests__/db/vehicle-reading.db.test.ts.
 */
import { describe, expect, it } from 'vitest'
import {
  isLowerReading,
  isMuchHigherReading,
  MUCH_HIGHER_READING,
  readingNotice,
} from '@/features/vehicles/Lib/vehicleReading'

describe('what counts as a lower reading in the field', () => {
  it('is a number below the last one', () => {
    expect(isLowerReading('99999', 100_000)).toBe(true)
    expect(isLowerReading('0', 100_000)).toBe(true)
  })

  it('is not an equal or higher one, an empty field, or an unknown last reading', () => {
    expect(isLowerReading('100000', 100_000)).toBe(false)
    expect(isLowerReading('100001', 100_000)).toBe(false)
    expect(isLowerReading('', 100_000)).toBe(false)
    expect(isLowerReading('  ', 100_000)).toBe(false)
    expect(isLowerReading('abc', 100_000)).toBe(false)
    expect(isLowerReading('5', null)).toBe(false)
    expect(isLowerReading('5', 0)).toBe(false)
  })
})

describe('what counts as much higher in the field', () => {
  it('is more than 100,000 above for a distance, kilometres and miles alike', () => {
    expect(MUCH_HIGHER_READING.distance).toBe(100_000)
    expect(isMuchHigherReading('1490000', 148_000, 'distance')).toBe(true)
    expect(isMuchHigherReading('248001', 148_000, 'distance')).toBe(true)
    expect(isMuchHigherReading('248000', 148_000, 'distance')).toBe(false)
    expect(isMuchHigherReading('149000', 148_000, 'distance')).toBe(false)
  })

  it('is more than 5,000 above for engine hours', () => {
    expect(MUCH_HIGHER_READING.hours).toBe(5_000)
    expect(isMuchHigherReading('6241', 1_240, 'hours')).toBe(true)
    expect(isMuchHigherReading('6240', 1_240, 'hours')).toBe(false)
    // The distance limit does not apply to hours, nor the hours one to distance.
    expect(isMuchHigherReading('12400', 1_240, 'distance')).toBe(false)
  })

  it('is nothing without a last reading, with a last reading of 0, or an empty field', () => {
    expect(isMuchHigherReading('9000000', null, 'distance')).toBe(false)
    expect(isMuchHigherReading('9000000', 0, 'distance')).toBe(false)
    expect(isMuchHigherReading('', 148_000, 'distance')).toBe(false)
    expect(isMuchHigherReading('abc', 148_000, 'distance')).toBe(false)
  })
})

describe('the one notice a reading field shows', () => {
  it('is lower, much higher, or nothing, never two', () => {
    expect(readingNotice('100', 148_000, 'distance')).toBe('lower')
    expect(readingNotice('1480000', 148_000, 'distance')).toBe('higher')
    expect(readingNotice('152000', 148_000, 'distance')).toBeNull()
    expect(readingNotice('148000', 148_000, 'distance')).toBeNull()
  })
})
