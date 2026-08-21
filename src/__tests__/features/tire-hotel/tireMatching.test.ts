import { describe, it, expect } from 'vitest'
import {
  formatTireSize,
  matchStock,
  parseTireSize,
  sizesMatch,
  type StockCandidate,
} from '@/features/tire-hotel/Lib/tireMatching'

const part = (over: Partial<StockCandidate>): StockCandidate => ({
  id: 'p1',
  name: '',
  partNumber: null,
  description: null,
  category: 'Tires',
  quantity: 8,
  unitCost: 400,
  sellPrice: 900,
  ...over,
})

describe('parsing a tire size', () => {
  it('reads the plain form', () => {
    expect(parseTireSize('225/45R17')).toEqual({ width: 225, ratio: 45, rim: 17 })
  })

  it.each([
    ['225/45 R17', 'spaces around the construction letter'],
    ['P225/45R17 94V', 'a P-metric prefix and a load/speed index'],
    ['225/45ZR17', 'a two-letter construction code'],
    ['225 / 45 R 17', 'spaces everywhere'],
    ['LT225/45R17', 'a light-truck prefix'],
  ])('reads %s (%s)', (input) => {
    expect(parseTireSize(input)).toEqual({ width: 225, ratio: 45, rim: 17 })
  })

  it('returns null for text with no size in it', () => {
    // Common in practice: plenty of shops write "winter set" and move on.
    expect(parseTireSize('winter set')).toBeNull()
    expect(parseTireSize('')).toBeNull()
    expect(parseTireSize(null)).toBeNull()
  })

  it('does not mistake a DOT code for a size', () => {
    // A DOT code is four digits and must never be read as a fitment.
    expect(parseTireSize('3623')).toBeNull()
  })

  it('rejects numbers outside real fitments', () => {
    expect(parseTireSize('999/99R99')).toBeNull()
  })

  it('formats back to one canonical spelling', () => {
    const size = parseTireSize('P225/45 ZR17 94V')
    expect(size && formatTireSize(size)).toBe('225/45R17')
  })
})

describe('comparing sizes', () => {
  it('matches the same fitment written differently', () => {
    expect(sizesMatch(parseTireSize('225/45R17'), parseTireSize('P225/45 ZR17 94V'))).toBe(true)
  })

  it('does not match a different rim', () => {
    expect(sizesMatch(parseTireSize('225/45R17'), parseTireSize('225/45R18'))).toBe(false)
  })

  it('does not match when either side is unreadable', () => {
    expect(sizesMatch(parseTireSize('225/45R17'), null)).toBe(false)
  })
})

describe('matching stock to a stored set', () => {
  const candidates = [
    part({ id: 'exact-cheap', name: 'Nokian Hakka 225/45R17', sellPrice: 800, quantity: 8 }),
    part({ id: 'exact-dear', name: 'Michelin X-Ice 225/45R17', sellPrice: 1200, quantity: 8 }),
    part({ id: 'short', name: 'Continental 225/45R17', sellPrice: 700, quantity: 2 }),
    part({ id: 'wrong-rim', name: 'Nokian Hakka 225/45R18', sellPrice: 600, quantity: 8 }),
  ]

  it('finds only the matching fitment', () => {
    const found = matchStock(candidates, '225/45R17', 4).map((m) => m.id)
    expect(found).not.toContain('wrong-rim')
    expect(found).toHaveLength(3)
  })

  it('puts what covers the whole set first, cheapest of those leading', () => {
    // A cheaper tire the shop cannot supply today is worth less to the
    // person quoting than one on the shelf.
    const found = matchStock(candidates, '225/45R17', 4).map((m) => m.id)
    expect(found).toEqual(['exact-cheap', 'exact-dear', 'short'])
  })

  it('flags whether stock covers the whole set', () => {
    const found = matchStock(candidates, '225/45R17', 4)
    expect(found.find((m) => m.id === 'exact-cheap')?.inStock).toBe(true)
    expect(found.find((m) => m.id === 'short')?.inStock).toBe(false)
  })

  it('counts stock against the actual set size, not a assumed four', () => {
    // A pair only needs two on the shelf.
    const found = matchStock(candidates, '225/45R17', 2)
    expect(found.find((m) => m.id === 'short')?.inStock).toBe(true)
  })

  it('matches on the part number or description too', () => {
    const odd = [
      part({ id: 'by-number', name: 'Winter tire', partNumber: '225/45R17-NOK' }),
      part({ id: 'by-desc', name: 'Winter tire', description: 'Fits 225/45R17' }),
    ]
    expect(matchStock(odd, '225/45R17', 4).map((m) => m.id)).toEqual(['by-number', 'by-desc'])
  })

  it('returns nothing when the set has no readable size', () => {
    expect(matchStock(candidates, 'winter set', 4)).toEqual([])
    expect(matchStock(candidates, null, 4)).toEqual([])
  })
})
