// @vitest-environment node
/**
 * A workshop's name goes into the From header of its customer mail. These
 * make sure a name can only ever be a name there, never a second header.
 */
import { describe, expect, it } from 'vitest'
import {
  cleanDisplayName,
  formatMailAddress,
  normalizeEmailAddress,
  parseMailAddress,
} from '@/lib/email-address'

describe('formatMailAddress', () => {
  it('quotes the name in front of the address', () => {
    expect(formatMailAddress('EF Moto', 'post@torqvoice.com')).toBe(
      '"EF Moto" <post@torqvoice.com>'
    )
  })

  it('falls back to the bare address with no name', () => {
    expect(formatMailAddress('', 'post@torqvoice.com')).toBe('post@torqvoice.com')
    expect(formatMailAddress('   ', 'post@torqvoice.com')).toBe('post@torqvoice.com')
    expect(formatMailAddress(null, 'post@torqvoice.com')).toBe('post@torqvoice.com')
  })

  it('strips everything a name could smuggle a header with', () => {
    expect(cleanDisplayName('Evil" <boss@example.com>\r\nBcc: x')).toBe(
      'Evil boss@example.com Bcc: x'
    )
    expect(formatMailAddress('A, B; C\\D', 'p@t.com')).toBe('"A B C D" <p@t.com>')
    expect(cleanDisplayName('x'.repeat(200))).toHaveLength(120)
  })
})

describe('parseMailAddress', () => {
  it('reads both shapes a From address comes in', () => {
    expect(parseMailAddress('Torqvoice <post@torqvoice.com>')).toEqual({
      name: 'Torqvoice',
      email: 'post@torqvoice.com',
    })
    expect(parseMailAddress('"EF Moto" <post@torqvoice.com>')).toEqual({
      name: 'EF Moto',
      email: 'post@torqvoice.com',
    })
    expect(parseMailAddress('post@torqvoice.com')).toEqual({
      name: '',
      email: 'post@torqvoice.com',
    })
  })

  it('refuses what is not an address', () => {
    expect(parseMailAddress('Torqvoice <not an address>')).toBeNull()
    expect(parseMailAddress('nope')).toBeNull()
    expect(parseMailAddress('')).toBeNull()
  })
})

describe('normalizeEmailAddress', () => {
  it('lower-cases a bare address and drops the name', () => {
    expect(normalizeEmailAddress('Kari <Kari.Nordmann@Example.COM>')).toBe(
      'kari.nordmann@example.com'
    )
    expect(normalizeEmailAddress(' KARI@EXAMPLE.COM ')).toBe('kari@example.com')
    expect(normalizeEmailAddress('nope')).toBeNull()
    expect(normalizeEmailAddress(null)).toBeNull()
  })
})
