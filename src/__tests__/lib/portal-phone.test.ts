import { describe, expect, it } from 'vitest'
import { getPhoneLookupVariants, normalizePortalPhone } from '@/lib/portal-phone'

describe('normalizePortalPhone', () => {
  it('keeps a number already in E.164', () => {
    expect(normalizePortalPhone('+4712345678', '+47')).toBe('+4712345678')
  })

  it('reads 00 as the international prefix', () => {
    expect(normalizePortalPhone('004747604248', '+47')).toBe('+4747604248')
  })

  it('reads 00 even with no default country set', () => {
    expect(normalizePortalPhone('004912345678', null)).toBe('+4912345678')
  })

  it('does not mistake 00 for a trunk prefix and country code', () => {
    // The old path stripped both zeros and prepended the country code, which
    // turned a Norwegian number into +47 47 47604248 without complaining.
    expect(normalizePortalPhone('004747604248', '+47')).not.toBe('+474747604248')
  })

  it('adds the country code to a local number', () => {
    expect(normalizePortalPhone('012 34 56 78', '+47')).toBe('+4712345678')
    expect(normalizePortalPhone('12345678', '+47')).toBe('+4712345678')
  })

  it('refuses a local number when no country is known', () => {
    expect(normalizePortalPhone('12345678', null)).toBeNull()
  })

  it('refuses what is not a number at all', () => {
    expect(normalizePortalPhone('', '+47')).toBeNull()
    expect(normalizePortalPhone('00', '+47')).toBeNull()
    expect(normalizePortalPhone('+0123', '+47')).toBeNull()
  })
})

describe('getPhoneLookupVariants', () => {
  it('offers every shape the same number may be stored in', () => {
    const variants = getPhoneLookupVariants('+4712345678', '+47')
    expect(variants).toContain('+4712345678')
    expect(variants).toContain('004712345678')
    expect(variants).toContain('12345678')
    expect(variants).toContain('012345678')
  })

  it('still offers the dialled-from-abroad form without a country code', () => {
    expect(getPhoneLookupVariants('+4912345678', null)).toEqual(['+4912345678', '004912345678'])
  })
})
