import { describe, expect, it } from 'vitest'
import { isSupplierUrl, normalizeSupplierUrl } from '@/features/inventory/Lib/supplierUrl'

describe('normalizeSupplierUrl', () => {
  it('leaves links that already have a scheme alone', () => {
    expect(normalizeSupplierUrl('https://www.x.com/a')).toBe('https://www.x.com/a')
    expect(normalizeSupplierUrl('http://x.com/a?b=1')).toBe('http://x.com/a?b=1')
  })

  it('trims what was typed around the link', () => {
    expect(normalizeSupplierUrl('  https://x.com/a \n')).toBe('https://x.com/a')
    expect(normalizeSupplierUrl('  www.x.com/a  ')).toBe('https://www.x.com/a')
  })

  it('puts https:// in front of a link typed from its host', () => {
    expect(normalizeSupplierUrl('www.x.com/a')).toBe('https://www.x.com/a')
    expect(normalizeSupplierUrl('x.com')).toBe('https://x.com')
    expect(normalizeSupplierUrl('shop.x.co.uk:8080/p?id=1#top')).toBe(
      'https://shop.x.co.uk:8080/p?id=1#top'
    )
    expect(normalizeSupplierUrl('bildeler.nø/del')).toBe('https://bildeler.nø/del')
  })

  it('puts https:// in front even when the link carries another link in its query', () => {
    const typed = 'www.x.com/part/123?return=https://x.com/catalog'
    expect(normalizeSupplierUrl(typed)).toBe(`https://${typed}`)
    expect(isSupplierUrl(normalizeSupplierUrl(typed))).toBe(true)
  })

  it('leaves an empty link empty', () => {
    expect(normalizeSupplierUrl('')).toBe('')
    expect(normalizeSupplierUrl('   ')).toBe('')
  })

  it('does not turn something that is not a host into a link', () => {
    expect(normalizeSupplierUrl('ask at the counter')).toBe('ask at the counter')
    expect(normalizeSupplierUrl('brakes')).toBe('brakes')
    expect(normalizeSupplierUrl('see note. thanks')).toBe('see note. thanks')
  })

  it('gives the server a link it accepts, and keeps refusing what is not one', () => {
    expect(isSupplierUrl(normalizeSupplierUrl('www.x.com/a'))).toBe(true)
    expect(isSupplierUrl(normalizeSupplierUrl('ask at the counter'))).toBe(false)
  })
})
