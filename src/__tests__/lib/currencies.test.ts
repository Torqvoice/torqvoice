import { describe, expect, it } from 'vitest'
import { locales } from '@/i18n/config'
import {
  CURRENCIES,
  currencyName,
  currencySearchScore,
  resolveCurrencySettings,
  SELECTABLE_CURRENCIES,
} from '@/lib/currencies'
import { formatCurrency, getCurrencySymbol } from '@/lib/format'

// The PDFs print in Helvetica, which only carries WinAnsi (Latin-1 plus a few
// extras such as the euro sign). A symbol outside it comes out as "?". The
// narrow no-break space some locales group digits with is allowed through:
// it is not a symbol, and the formatter has always produced it.
const WIN_ANSI = /^[ -~ -ÿ€’ ]*$/

describe('currency registry', () => {
  it('lists every code once', () => {
    const codes = CURRENCIES.map((c) => c.code)
    expect(new Set(codes).size).toBe(codes.length)
    for (const code of codes) expect(code).toMatch(/^[A-Z]{3}$/)
  })

  it('offers the Nicaraguan córdoba', () => {
    expect(SELECTABLE_CURRENCIES.map((c) => c.code)).toContain('NIO')
    expect(formatCurrency(20412.9, 'NIO')).toBe('C$20,412.90')
    expect(getCurrencySymbol('NIO')).toBe('C$')
  })

  it('prints every currency in characters the PDF font has', () => {
    for (const { code } of CURRENCIES) {
      for (const format of ['symbol', 'code'] as const) {
        expect(formatCurrency(1234.5, code, format), `${code} ${format}`).toMatch(WIN_ANSI)
        expect(getCurrencySymbol(code, format), `${code} ${format}`).toMatch(WIN_ANSI)
      }
    }
  })

  it('names every currency in every language the app ships', () => {
    for (const locale of locales) {
      for (const { code } of CURRENCIES) {
        const name = currencyName(code, locale)
        expect(name, `${code} in ${locale}`).not.toBe(code)
        expect(name.length, `${code} in ${locale}`).toBeGreaterThan(3)
      }
    }
  })

  it('falls back to the code for a currency the runtime cannot name', () => {
    expect(currencyName('QQQ', 'en')).toBe('QQQ')
  })

  it('reads the workshop currency out of a settings record or map', () => {
    expect(resolveCurrencySettings({})).toEqual({ currencyCode: 'USD', currencyFormat: 'symbol' })
    expect(
      resolveCurrencySettings({
        'workshop.currencyCode': 'NIO',
        'workshop.currencyFormat': 'code',
      })
    ).toEqual({ currencyCode: 'NIO', currencyFormat: 'code' })
    expect(resolveCurrencySettings(new Map([['workshop.currencyCode', 'NOK']]))).toEqual({
      currencyCode: 'NOK',
      currencyFormat: 'symbol',
    })
  })

  it('finds a currency by its code alone', () => {
    const found = (search: string) =>
      SELECTABLE_CURRENCIES.map((c) => `${c.code} ${currencyName(c.code, 'en')}`)
        .filter((label) => currencySearchScore(label, search) > 0)
        .map((label) => label.slice(0, 3))
    expect(found('NIO')).toEqual(['NIO'])
    expect(found('nio')).toEqual(['NIO'])
    expect(found('GTQ')).toEqual(['GTQ'])
    expect(found('Nicara')).toEqual(['NIO'])
    expect(found('cordoba')).toEqual(['NIO'])
    expect(found('krone')).toEqual(expect.arrayContaining(['NOK', 'DKK']))
    expect(found('zzz')).toEqual([])
    expect(found('').length).toBe(SELECTABLE_CURRENCIES.length)
  })
})
