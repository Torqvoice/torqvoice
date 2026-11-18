import { describe, expect, it } from 'vitest'
import { normalizePlate } from '@/lib/license-plate'
import { normalizePlate as importerNormalizePlate } from '@/features/import/Lib/normalize'

describe('normalizePlate', () => {
  it('stores a plate typed in lower or mixed case in upper case', () => {
    expect(normalizePlate('zz99 tst')).toBe('ZZ99 TST')
    expect(normalizePlate('Ab12 cDe')).toBe('AB12 CDE')
    expect(normalizePlate('AB12 CDE')).toBe('AB12 CDE')
  })

  it('keeps the spaces and hyphens people typed', () => {
    expect(normalizePlate('ab-123-cd')).toBe('AB-123-CD')
    expect(normalizePlate('m ab 1234')).toBe('M AB 1234')
    expect(normalizePlate('ab12345')).toBe('AB12345')
  })

  it('trims and collapses runs of whitespace to one space', () => {
    expect(normalizePlate('  zz99   tst ')).toBe('ZZ99 TST')
    expect(normalizePlate('zz99\t\ttst')).toBe('ZZ99 TST')
  })

  it('treats an empty plate as no plate', () => {
    expect(normalizePlate('')).toBeNull()
    expect(normalizePlate('   ')).toBeNull()
    expect(normalizePlate(null)).toBeNull()
    expect(normalizePlate(undefined)).toBeNull()
  })

  it('upper-cases letters outside the Latin alphabet that have case', () => {
    expect(normalizePlate('а123вс')).toBe('А123ВС')
    expect(normalizePlate('αβγ-1234')).toBe('ΑΒΓ-1234')
    expect(normalizePlate('hü-ö 12')).toBe('HÜ-Ö 12')
  })

  it('passes scripts without case through unchanged', () => {
    expect(normalizePlate('أ ب ج 1234')).toBe('أ ب ج 1234')
    expect(normalizePlate('京A·12345')).toBe('京A·12345')
    expect(normalizePlate('กข 1234')).toBe('กข 1234')
    expect(normalizePlate('品川 300 あ 12-34')).toBe('品川 300 あ 12-34')
  })

  it('gives a plain I for i whatever the locale, and never changes the length', () => {
    expect(normalizePlate('34 ist 34')).toBe('34 IST 34')
    // Dotless i has a single-letter capital; sharp s does not, so it stays.
    expect(normalizePlate('ı')).toBe('I')
    expect(normalizePlate('ß1')).toBe('ß1')
  })

  it('is the rule the importer uses', () => {
    expect(importerNormalizePlate).toBe(normalizePlate)
  })
})
