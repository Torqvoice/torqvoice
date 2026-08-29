import { describe, expect, it } from 'vitest'
import { countriesFor, DIAL_CODES } from '@/features/team/Lib/dialCodes'

/**
 * The country list feeds a Select, which keys its options on their value.
 */
describe('dial codes', () => {
  it('has one row per country', () => {
    const regions = DIAL_CODES.map((c) => c.region)
    expect(new Set(regions).size).toBe(regions.length)
  })

  it('does not assume a dial code identifies a country', () => {
    // Canada and the United States are both +1, which is why the Select is
    // keyed on the region. A list keyed on the dial code had two options
    // claiming to be the same one, and React said so.
    const dials = DIAL_CODES.map((c) => c.dial)
    expect(new Set(dials).size).toBeLessThan(dials.length)
  })

  it('gives every country a real dial code', () => {
    for (const { region, dial } of DIAL_CODES) {
      expect(region, `${region} is not a region code`).toMatch(/^[A-Z]{2}$/)
      expect(dial, `${region} has a bad dial code`).toMatch(/^\+[1-9]\d{0,2}$/)
    }
  })

  it('names them in the reader’s own language', () => {
    const norwegian = countriesFor('nb').find((c) => c.region === 'DE')
    const german = countriesFor('de').find((c) => c.region === 'DE')
    expect(norwegian?.name).toBe('Tyskland')
    expect(german?.name).toBe('Deutschland')
  })

  it('sorts by that language, not by code point', () => {
    const names = countriesFor('nb').map((c) => c.name)
    expect(names).toEqual([...names].sort(new Intl.Collator('nb').compare))
  })
})
