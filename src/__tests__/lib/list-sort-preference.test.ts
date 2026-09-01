import { describe, it, expect } from 'vitest'
import { parseListSortCookie, parseStoredSort } from '@/lib/list-sort-preference'

describe('parseListSortCookie', () => {
  it('reads a map of list keys to stored sorts', () => {
    expect(parseListSortCookie('{"customers":"name:asc","vehicles":"year:desc"}')).toEqual({
      customers: 'name:asc',
      vehicles: 'year:desc',
    })
  })

  it('returns an empty map for missing or malformed cookies', () => {
    // A hand-edited or truncated cookie must never break a page render.
    expect(parseListSortCookie(undefined)).toEqual({})
    expect(parseListSortCookie('')).toEqual({})
    expect(parseListSortCookie('not json')).toEqual({})
    expect(parseListSortCookie('["customers"]')).toEqual({})
    expect(parseListSortCookie('null')).toEqual({})
  })

  it('drops entries that are not strings', () => {
    expect(parseListSortCookie('{"customers":"name:asc","vehicles":42}')).toEqual({
      customers: 'name:asc',
    })
  })
})

describe('parseStoredSort', () => {
  it('splits a column and direction', () => {
    expect(parseStoredSort('name:asc')).toEqual({ sortBy: 'name', sortOrder: 'asc' })
    expect(parseStoredSort('total:desc')).toEqual({ sortBy: 'total', sortOrder: 'desc' })
  })

  it('falls back to descending for a missing or unknown direction', () => {
    expect(parseStoredSort('name')).toEqual({ sortBy: 'name', sortOrder: 'desc' })
    expect(parseStoredSort('name:sideways')).toEqual({ sortBy: 'name', sortOrder: 'desc' })
  })

  it('returns null when there is nothing usable to sort by', () => {
    expect(parseStoredSort(undefined)).toBeNull()
    expect(parseStoredSort('')).toBeNull()
    expect(parseStoredSort(':asc')).toBeNull()
  })
})
