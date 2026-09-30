/**
 * @vitest-environment node
 *
 * Which optional columns a list shows.
 *
 * The work order table already carries eight columns on a laptop, so a column
 * not everyone needs starts off and is kept per browser. Two things matter
 * here: the defaults, and that a stored choice can never break a page. The
 * cookie is user-writable, survives a release that renames a column, and is
 * read on the server while rendering, so anything malformed has to read as
 * "no choice made" rather than throw.
 */
import { describe, expect, it } from 'vitest'
import {
  columnsFrom,
  defaultColumns,
  parseListColumnsCookie,
  WORK_ORDER_COLUMNS,
} from '@/lib/list-columns'

describe('the work order columns', () => {
  it('start with everything but the promise', () => {
    expect(defaultColumns(WORK_ORDER_COLUMNS)).toEqual(['invoice', 'customer', 'tech'])
    expect(WORK_ORDER_COLUMNS.promised).toBe(false)
  })
})

describe('the stored choice', () => {
  it('is read back as it was written', () => {
    const cookie = encodeURIComponent(JSON.stringify({ workOrders: ['promised', 'tech'] }))
    expect(parseListColumnsCookie(cookie).workOrders).toEqual(['promised', 'tech'])
  })

  it('is used in full, including turning every column off', () => {
    expect(columnsFrom([], WORK_ORDER_COLUMNS)).toEqual([])
    expect(columnsFrom(['promised'], WORK_ORDER_COLUMNS)).toEqual(['promised'])
  })

  it('falls back to the defaults when nothing was ever chosen', () => {
    expect(columnsFrom(undefined, WORK_ORDER_COLUMNS)).toEqual(['invoice', 'customer', 'tech'])
  })

  it('drops a column this list no longer has', () => {
    // A release that renames or removes a column must not leave a browser
    // rendering a header that no longer exists.
    expect(columnsFrom(['tech', 'gone'], WORK_ORDER_COLUMNS)).toEqual(['tech'])
  })

  it('reads anything malformed as no choice at all', () => {
    for (const value of [
      undefined,
      '',
      'not json',
      encodeURIComponent('"a string"'),
      encodeURIComponent('[1,2,3]'),
      encodeURIComponent(JSON.stringify({ workOrders: 'promised' })),
      encodeURIComponent(JSON.stringify({ workOrders: [1, 2] })),
    ]) {
      expect(parseListColumnsCookie(value).workOrders, String(value)).toBeUndefined()
    }
  })

  it('keeps the lists apart', () => {
    const cookie = encodeURIComponent(
      JSON.stringify({ workOrders: ['promised'], customers: ['phone'] })
    )
    const parsed = parseListColumnsCookie(cookie)
    expect(parsed.workOrders).toEqual(['promised'])
    expect(parsed.customers).toEqual(['phone'])
  })
})
