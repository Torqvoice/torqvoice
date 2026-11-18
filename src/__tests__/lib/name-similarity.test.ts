/**
 * Tests for the fuzzy name match behind the registration document scan.
 *
 * The threshold the vehicle form uses is 0.9, so what matters here is which
 * side of it a given pair of names lands on. Score too generously and the
 * workshop is asked to pick between two brothers; too harshly and a customer
 * they already have is quietly duplicated.
 */

import { describe, it, expect } from 'vitest'
import { NAME_FOLD, foldName, nameSimilarity, normalizeName } from '@/lib/name-similarity'

const THRESHOLD = 0.9

describe('normalizeName', () => {
  it('puts a comma-separated name in the same shape as a spaced one', () => {
    expect(normalizeName('Lücking, Manuel')).toBe(normalizeName('Manuel Lücking'))
  })

  it('strips accents so an OCR pass that drops them still lines up', () => {
    expect(normalizeName('Lücking')).toBe('lucking')
  })
})

describe('nameSimilarity', () => {
  it('matches a name written surname-first', () => {
    expect(nameSimilarity('Lücking, Manuel', 'Manuel Lücking')).toBe(1)
  })

  it('matches through a lost umlaut', () => {
    expect(nameSimilarity('Manuel Lucking', 'Manuel Lücking')).toBeGreaterThanOrEqual(THRESHOLD)
  })

  it('matches a company through its legal form', () => {
    expect(nameSimilarity('Autohaus Meyer', 'Autohaus Meyer GmbH')).toBeGreaterThanOrEqual(
      THRESHOLD
    )
  })

  it('matches through an added middle name', () => {
    expect(nameSimilarity('Manuel Lücking', 'Manuel Josef Lücking')).toBeGreaterThanOrEqual(
      THRESHOLD
    )
  })

  it('keeps two relatives at one address apart', () => {
    expect(nameSimilarity('Manuel Lücking', 'Michael Lücking')).toBeLessThan(THRESHOLD)
  })

  it('does not match on a shared surname alone', () => {
    expect(nameSimilarity('Lücking', 'Manuel Lücking')).toBeLessThan(THRESHOLD)
  })

  it('scores unrelated names low', () => {
    expect(nameSimilarity('Manuel Lücking', 'Petra Schneider')).toBeLessThan(0.4)
  })

  it('treats an empty name as no match', () => {
    expect(nameSimilarity('', 'Manuel Lücking')).toBe(0)
  })
})

describe('foldName and NAME_FOLD', () => {
  // What Postgres makes of a stored name: translate() with the table, then lower()
  const inDatabase = (stored: string) => {
    let out = ''
    for (const letter of stored) {
      const at = NAME_FOLD.from.indexOf(letter)
      out += at === -1 ? letter : NAME_FOLD.to[at]
    }
    return out.toLowerCase()
  }

  it('pairs every letter with the one it becomes', () => {
    expect([...NAME_FOLD.from]).toHaveLength([...NAME_FOLD.to].length)
  })

  it.each([
    ['Jürgen Müller', 'Jurgen Muller'],
    ['José Núñez', 'Jose Nunez'],
    ['Øyvind Ærø', 'Oyvind Æro'],
    ['ŁUKASZ Żółć', 'Lukasz Zolc'],
  ])('finds %s in the database for papers that say %s, or the same with accents', (stored, read) => {
    for (const papers of [stored, read]) {
      for (const word of foldName(normalizeName(papers)).split(' ')) {
        expect(inDatabase(stored)).toContain(word)
      }
    }
  })
})
