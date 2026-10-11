import { describe, expect, it } from 'vitest'
import { parseByteRange } from '@/lib/byte-range'

describe('parseByteRange', () => {
  it('has nothing to honour without a header', () => {
    expect(parseByteRange(null, 1000)).toBeNull()
  })

  it('reads the two-byte probe a video player opens with', () => {
    expect(parseByteRange('bytes=0-1', 1000)).toEqual({ start: 0, end: 1 })
  })

  it('reads an open-ended range to the end of the file', () => {
    expect(parseByteRange('bytes=200-', 1000)).toEqual({ start: 200, end: 999 })
  })

  it('reads a suffix as the last bytes of the file', () => {
    expect(parseByteRange('bytes=-100', 1000)).toEqual({ start: 900, end: 999 })
    expect(parseByteRange('bytes=-5000', 1000)).toEqual({ start: 0, end: 999 })
  })

  it('clamps an end past the file to its last byte', () => {
    expect(parseByteRange('bytes=900-5000', 1000)).toEqual({ start: 900, end: 999 })
  })

  it('refuses a start at or past the end of the file', () => {
    expect(parseByteRange('bytes=1000-', 1000)).toBe('unsatisfiable')
    expect(parseByteRange('bytes=-0', 1000)).toBe('unsatisfiable')
    expect(parseByteRange('bytes=0-', 0)).toBe('unsatisfiable')
  })

  it('falls back to the whole file for anything it does not understand', () => {
    expect(parseByteRange('bytes=0-1,5-9', 1000)).toBeNull()
    expect(parseByteRange('items=0-1', 1000)).toBeNull()
    expect(parseByteRange('bytes=-', 1000)).toBeNull()
    expect(parseByteRange('bytes=9-2', 1000)).toBeNull()
    expect(parseByteRange('bytes=abc', 1000)).toBeNull()
  })
})
