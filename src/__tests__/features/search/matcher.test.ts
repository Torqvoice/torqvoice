import { describe, expect, it } from 'vitest'
import {
  fold,
  matchItem,
  prepareItem,
  prepareQuery,
  rank,
  splitByRanges,
} from '@/features/search/Lib/matcher'

function prepared<T extends { title: string }>(items: T[]) {
  return items.map((item) => ({ item, prepared: prepareItem(item) }))
}

const SETTINGS = prepared([
  { title: 'Company', keywords: ['business', 'branding'], context: 'General' },
  { title: 'Localization', keywords: ['language', 'timezone'], context: 'General' },
  { title: 'Invoice & Quotes', keywords: ['invoice', 'numbering'], context: 'Billing & Documents' },
  { title: 'Due Days', description: 'Number of days until invoice is due', context: 'Invoice' },
  { title: 'Tax', keywords: ['vat', 'mva', 'mwst'], context: 'Billing & Documents' },
  { title: 'Tax rate', keywords: ['percent'], context: 'Tax' },
  { title: 'Data', keywords: ['export', 'import', 'backup'], context: 'System' },
  { title: 'Workshop', keywords: ['labor', 'technician'], context: 'Workshop' },
])

function titles(query: string) {
  return rank(prepareQuery(query), SETTINGS).map((r) => r.item.title)
}

describe('fold', () => {
  it('lower-cases and strips accents', () => {
    expect(fold('Lokalisierung')).toBe('lokalisierung')
    expect(fold('Tåx')).toBe('tax')
    expect(fold('Réglages')).toBe('reglages')
  })

  it('folds the Nordic and German letters to what people type for them', () => {
    expect(fold('Miljøgebyr')).toBe('miljogebyr')
    expect(fold('Værksted')).toBe('vaerksted')
    expect(fold('Straße')).toBe('strasse')
    expect(fold('Måned')).toBe('maned')
  })
})

describe('matchItem', () => {
  it('matches nothing to an empty query, with a zero score', () => {
    const m = matchItem(prepareQuery(''), prepareItem({ title: 'Tax' }))
    expect(m).toEqual({ score: 0, ranges: [], strong: true })
  })

  it('returns null when a word is nowhere to be found', () => {
    expect(matchItem(prepareQuery('zzz'), prepareItem({ title: 'Tax' }))).toBeNull()
  })

  it('needs every word to land somewhere', () => {
    const item = prepareItem({ title: 'Due Days', description: 'days until the invoice is due' })
    expect(matchItem(prepareQuery('due invoice'), item)).not.toBeNull()
    expect(matchItem(prepareQuery('due payroll'), item)).toBeNull()
  })

  it('reports the title ranges in the original text, accents included', () => {
    const item = prepareItem({ title: 'Miljøgebyr' })
    const m = matchItem(prepareQuery('miljo'), item)
    expect(m?.ranges).toEqual([[0, 5]])
    expect(splitByRanges('Miljøgebyr', m?.ranges ?? [])).toEqual([
      { text: 'Miljø', hit: true },
      { text: 'gebyr', hit: false },
    ])
  })

  it('keeps ranges right when a letter folds to two', () => {
    const item = prepareItem({ title: 'Værksted' })
    const m = matchItem(prepareQuery('vaerk'), item)
    expect(m?.ranges).toEqual([[0, 4]])
  })

  it('is strong for a direct title or alias hit and weak for a loose one', () => {
    const item = prepareItem({ title: 'Localization', keywords: ['language'] })
    expect(matchItem(prepareQuery('local'), item)?.strong).toBe(true)
    expect(matchItem(prepareQuery('lang'), item)?.strong).toBe(true)
    expect(matchItem(prepareQuery('lcl'), item)?.strong).toBe(false)
  })

  it('does not loose-match two letters', () => {
    expect(matchItem(prepareQuery('lz'), prepareItem({ title: 'Localization' }))).toBeNull()
  })

  it('highlights the loose-matched letters', () => {
    const m = matchItem(prepareQuery('lcl'), prepareItem({ title: 'Localization' }))
    expect(m?.ranges).toEqual([
      [0, 1],
      [2, 3],
      [4, 5],
    ])
  })
})

describe('rank', () => {
  it('puts the exact title first, then prefixes, then aliases', () => {
    expect(titles('tax')).toEqual(['Tax', 'Tax rate'])
    expect(titles('ta')[0]).toBe('Tax')
  })

  it('finds a page by its alias in any language', () => {
    expect(titles('vat')).toEqual(['Tax'])
    expect(titles('mva')).toEqual(['Tax'])
    expect(titles('backup')).toEqual(['Data'])
  })

  it('prefers a word that opens the title over one buried in it', () => {
    const items = prepared([{ title: 'Quote validity' }, { title: 'Valid until' }])
    expect(rank(prepareQuery('valid'), items).map((r) => r.item.title)).toEqual([
      'Valid until',
      'Quote validity',
    ])
  })

  it('ranks the phrase as typed above the words apart', () => {
    const items = prepared([
      { title: 'Days due', description: 'due days for quotes' },
      { title: 'Due Days' },
    ])
    expect(rank(prepareQuery('due days'), items).map((r) => r.item.title)).toEqual([
      'Due Days',
      'Days due',
    ])
  })

  it('finds a field through its description', () => {
    expect(titles('until invoice')).toEqual(['Due Days'])
  })

  it('finds a page through its breadcrumb', () => {
    expect(titles('billing')).toEqual(['Tax', 'Invoice & Quotes'])
  })

  it('still finds a typo-free subsequence as a last resort, below real hits', () => {
    const items = prepared([{ title: 'Workshop' }, { title: 'Work orders' }])
    expect(rank(prepareQuery('wrk'), items).map((r) => r.item.title)).toEqual([
      'Workshop',
      'Work orders',
    ])
  })

  it('is stable: ties keep the original order', () => {
    const items = prepared([{ title: 'Alpha one' }, { title: 'Alpha two' }])
    expect(rank(prepareQuery('alpha'), items).map((r) => r.item.title)).toEqual([
      'Alpha one',
      'Alpha two',
    ])
  })

  it('honours the limit', () => {
    expect(rank(prepareQuery('a'), SETTINGS, 2)).toHaveLength(2)
  })

  it('returns everything, in order, for an empty query', () => {
    expect(titles('')).toHaveLength(SETTINGS.length)
  })
})
