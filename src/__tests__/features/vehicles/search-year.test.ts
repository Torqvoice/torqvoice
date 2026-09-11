import { describe, expect, it } from 'vitest'
import { searchYear } from '@/features/vehicles/Lib/searchYear'

describe('searchYear', () => {
  it('reads a four-digit word as a model year', () => {
    expect(searchYear('2019')).toBe(2019)
    expect(searchYear('1968')).toBe(1968)
  })

  it('leaves longer numbers alone, which the year column cannot hold', () => {
    // A phone number with its country code: the search that broke the vehicle list.
    expect(searchYear('4791234567')).toBeNull()
    expect(searchYear('3000000000')).toBeNull()
    expect(searchYear('12345')).toBeNull()
  })

  it('leaves other words that parse as numbers alone', () => {
    for (const word of ['1e10', '2.5', '-1', '0x10', '170', 'AB12', '2019a']) {
      expect(searchYear(word), word).toBeNull()
    }
  })
})
