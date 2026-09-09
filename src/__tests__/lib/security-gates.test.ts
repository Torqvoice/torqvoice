import { describe, expect, it } from 'vitest'
import { assertContentLength, assertZipWithinLimits } from '@/lib/backup/zip-guard'
import { permissionsFor } from '@/features/import/Lib/permissions'
import { recipientFitsChannel } from '@/features/tire-hotel/Lib/recipient'
import { hasAllPermissions } from '@/lib/permissions'

describe('backup archive limits', () => {
  const entry = (size: number, dir = false) => ({ dir, _data: { uncompressedSize: size } })

  it('accepts an ordinary archive and reports its size', () => {
    const files = { 'a.json': entry(100), 'files/': entry(0, true), 'files/x.png': entry(2000) }
    expect(assertZipWithinLimits(files, { maxEntries: 10, maxTotalBytes: 10_000 })).toEqual({
      entries: 3,
      totalBytes: 2100,
    })
  })

  it('refuses too many entries before inflating any', () => {
    const files = Object.fromEntries(Array.from({ length: 11 }, (_, i) => [`f${i}`, entry(1)]))
    expect(() => assertZipWithinLimits(files, { maxEntries: 10, maxTotalBytes: 10_000 })).toThrow(
      /too many entries/
    )
  })

  it('refuses a promised size that would not fit', () => {
    const files = { 'bomb.bin': entry(20_000) }
    expect(() => assertZipWithinLimits(files, { maxEntries: 10, maxTotalBytes: 10_000 })).toThrow(
      /too large/
    )
  })

  it('refuses an upload that announces itself as too big', () => {
    const big = new Request('http://x', { headers: { 'content-length': '999999999' } })
    expect(() => assertContentLength(big, 1000)).toThrow(/too large/)
    const fine = new Request('http://x', { headers: { 'content-length': '10' } })
    expect(() => assertContentLength(fine, 1000)).not.toThrow()
    expect(() => assertContentLength(new Request('http://x'), 1000)).not.toThrow()
  })
})

describe('import permissions', () => {
  it('asks for more the more a file can create', () => {
    const customersOnly = [{ action: 'create', subject: 'customers' }]
    expect(hasAllPermissions(customersOnly, permissionsFor('customers'))).toBe(true)
    expect(hasAllPermissions(customersOnly, permissionsFor('vehicles'))).toBe(false)
    expect(hasAllPermissions(customersOnly, permissionsFor('services'))).toBe(false)
  })
})

describe('tire hotel message recipient', () => {
  it('only accepts an address the channel can deliver to', () => {
    expect(recipientFitsChannel('email', 'kari@example.com')).toBe(true)
    expect(recipientFitsChannel('email', '+47 900 00 000')).toBe(false)
    expect(recipientFitsChannel('sms', '+47 900 00 000')).toBe(true)
    expect(recipientFitsChannel('sms', 'kari@example.com')).toBe(false)
  })
})
