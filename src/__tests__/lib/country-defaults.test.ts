import { describe, expect, it } from 'vitest'
import {
  COUNTRY_CODES,
  countryDefaults,
  countrySearchTerms,
  timeZoneFor,
  dateFormatFor,
  detectCountry,
  timeFormatFor,
} from '@/lib/country-defaults'
import { currencyDefinition } from '@/lib/currencies'

describe('countryDefaults', () => {
  it('suggests what a French workshop writes', () => {
    expect(countryDefaults('FR')).toEqual({
      country: 'FR',
      language: 'fr',
      locale: 'fr',
      currency: 'EUR',
      dialCode: '+33',
      distance: 'metric',
      measure: 'metric',
      dateFormat: 'dd/MM/yyyy',
      timeFormat: '24h',
      taxLabel: 'TVA',
    })
  })

  it('gives the United Kingdom miles with litres', () => {
    expect(countryDefaults('GB')).toMatchObject({
      locale: 'en',
      currency: 'GBP',
      dialCode: '+44',
      distance: 'imperial',
      measure: 'metric',
      dateFormat: 'dd/MM/yyyy',
      taxLabel: 'VAT',
    })
  })

  it('gives the United States miles, gallons, month-first dates and a 12-hour clock', () => {
    expect(countryDefaults('US')).toMatchObject({
      currency: 'USD',
      distance: 'imperial',
      measure: 'imperial',
      dateFormat: 'MM/dd/yyyy',
      timeFormat: '12h',
    })
  })

  it('writes German and Norwegian dates with dots', () => {
    expect(countryDefaults('DE')).toMatchObject({
      locale: 'de',
      dateFormat: 'dd.MM.yyyy',
      taxLabel: 'MwSt.',
    })
    expect(countryDefaults('NO')).toMatchObject({
      locale: 'nb',
      currency: 'NOK',
      dateFormat: 'dd.MM.yyyy',
      taxLabel: 'MVA',
    })
  })

  it('follows the owner where a country speaks several languages', () => {
    expect(countryDefaults('BE', 'fr-BE')).toMatchObject({ locale: 'fr', taxLabel: 'TVA' })
    expect(countryDefaults('BE', 'nl-BE')).toMatchObject({ locale: 'nl', taxLabel: 'BTW' })
    expect(countryDefaults('CA', 'fr-CA')).toMatchObject({ locale: 'fr' })
    expect(countryDefaults('CA', 'en-US')).toMatchObject({ locale: 'en' })
  })

  it('does not follow a language the country does not speak', () => {
    expect(countryDefaults('FR', 'en-US').locale).toBe('fr')
  })

  it('keeps Portugal and Brazil apart', () => {
    expect(countryDefaults('PT').locale).toBe('pt-PT')
    expect(countryDefaults('BR').locale).toBe('pt-BR')
  })

  it('suggests the euro in Bulgaria, which adopted it on 1 January 2026', () => {
    expect(countryDefaults('BG').currency).toBe('EUR')
  })

  it('leaves the language open where the app does not ship it', () => {
    expect(countryDefaults('JP').locale).toBeUndefined()
    expect(countryDefaults('JP').currency).toBe('JPY')
  })

  it('only suggests currencies the app offers', () => {
    for (const cc of COUNTRY_CODES) {
      const { currency } = countryDefaults(cc)
      if (currency) expect(currencyDefinition(currency), cc).toBeDefined()
    }
  })
})

describe('date and clock from the browser locale data', () => {
  it('reads date order and separator', () => {
    expect(dateFormatFor('en-US')).toBe('MM/dd/yyyy')
    expect(dateFormatFor('en-GB')).toBe('dd/MM/yyyy')
    expect(dateFormatFor('de-DE')).toBe('dd.MM.yyyy')
    expect(dateFormatFor('sv-SE')).toBe('yyyy-MM-dd')
  })

  it('reads the clock', () => {
    expect(timeFormatFor('en-US')).toBe('12h')
    expect(timeFormatFor('fr-FR')).toBe('24h')
  })
})

describe('detectCountry', () => {
  it('trusts the time zone over an English browser', () => {
    expect(detectCountry('Europe/Paris', ['en-US', 'en'])).toBe('FR')
  })

  it('falls back to the browser language region', () => {
    expect(detectCountry('UTC', ['fr-BE', 'fr'])).toBe('BE')
    expect(detectCountry(undefined, ['nb-NO'])).toBe('NO')
  })

  it('says nothing when neither tells', () => {
    expect(detectCountry('UTC', ['en'])).toBeNull()
  })
})

describe('the country list', () => {
  it('covers every inhabited country and territory Intl knows by its current code', () => {
    const names = new Intl.DisplayNames(['en'], { type: 'region', fallback: 'none' })
    // Uninhabited, retired or not a country of its own.
    const left = new Set([
      'AQ',
      'BV',
      'GS',
      'HM',
      'TF',
      'UM',
      'IO',
      'EH',
      'AC',
      'CP',
      'CQ',
      'DG',
      'EA',
      'IC',
      'TA',
      'XK',
      'EU',
      'EZ',
      'UN',
      'QO',
      'ZZ',
    ])
    const missing: string[] = []
    for (let a = 65; a <= 90; a++) {
      for (let b = 65; b <= 90; b++) {
        const code = String.fromCharCode(a, b)
        const name = names.of(code)
        if (!name || left.has(code) || name.startsWith('Pseudo')) continue
        // Retired codes resolve to a current country's name under another code.
        const current = [...COUNTRY_CODES, ...left].some(
          (cc) => cc !== code && names.of(cc) === name
        )
        if (!current && !COUNTRY_CODES.includes(code)) missing.push(`${code} ${name}`)
      }
    }
    expect(missing).toEqual([])
  })

  it('gives the Crown Dependencies pounds, +44 and miles', () => {
    for (const cc of ['JE', 'GG', 'IM']) {
      expect(countryDefaults(cc)).toMatchObject({
        currency: 'GBP',
        dialCode: '+44',
        distance: 'imperial',
        measure: 'metric',
      })
    }
  })

  it('finds the United Kingdom by the names people type', () => {
    const terms = countrySearchTerms('GB')
    for (const word of ['UK', 'England', 'Great Britain', 'United Kingdom']) {
      expect(terms).toContain(word)
    }
  })

  it('finds a country by its own name', () => {
    expect(countrySearchTerms('DE')).toContain('Deutschland')
    expect(countrySearchTerms('NO')).toContain('Norge')
  })
})

describe('timeZoneFor', () => {
  it("keeps the browser's zone when it is in the country", () => {
    expect(timeZoneFor('US', 'America/Chicago')).toBe('America/Chicago')
  })

  it("gives the country's own zone when the browser is elsewhere", () => {
    expect(timeZoneFor('IE', 'Europe/Oslo')).toBe('Europe/Dublin')
    expect(timeZoneFor('GB', 'Europe/Oslo')).toBe('Europe/London')
    expect(timeZoneFor('SE', 'Europe/Oslo')).toBe('Europe/Stockholm')
  })

  it('starts a country of several zones at its main one', () => {
    expect(timeZoneFor('US', 'Europe/Oslo')).toBe('America/New_York')
    expect(timeZoneFor('AU', 'Europe/Oslo')).toBe('Australia/Sydney')
    expect(timeZoneFor('CA', 'Europe/Oslo')).toBe('America/Toronto')
    expect(timeZoneFor('BR', 'Europe/Oslo')).toBe('America/Sao_Paulo')
  })

  it('has a zone for every country in the list', () => {
    const without = COUNTRY_CODES.filter((cc) => !timeZoneFor(cc, undefined))
    expect(without).toEqual([])
  })
})
