import { describe, expect, it } from 'vitest'
import {
  COUNTRY_CODES,
  countryDefaults,
  dateFormatFor,
  detectCountry,
  timeFormatFor,
} from '@/lib/country-defaults'
import { currencyDefinition } from '@/lib/currencies'

describe('countryDefaults', () => {
  it('suggests what a French workshop writes', () => {
    expect(countryDefaults('FR')).toEqual({
      country: 'FR',
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
