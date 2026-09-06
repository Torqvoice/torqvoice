import { describe, expect, it } from 'vitest'
import {
  detectDateFormat,
  detectDecimalSeparator,
  joinAddress,
  mapFuelType,
  mapTransmission,
  normalizeHeader,
  normalizePhone,
  normalizeVin,
  parseDate,
  parseNumber,
  parseYear,
  phoneKey,
  plateKey,
  splitVehicleDescription,
} from '@/features/import/Lib/normalize'

const iso = (d: Date | null) => d?.toISOString().slice(0, 10) ?? null

/**
 * The importer is used everywhere the app is sold, so the normaliser must not
 * assume a locale: dates, decimals, headers and fuel types all arrive in the
 * shape of whatever system the shop is leaving.
 */
describe('import normalisation', () => {
  it('flattens headers across languages and punctuation', () => {
    expect(normalizeHeader('E-Mail 1 - Value')).toBe('email1value')
    expect(normalizeHeader('Reg.nr')).toBe('regnr')
    expect(normalizeHeader('Straße')).toBe('strasse')
    expect(normalizeHeader('Kjøretøy')).toBe('kjoretoy')
    expect(normalizeHeader('Nr rejestracyjny')).toBe('nrrejestracyjny')
    expect(normalizeHeader('Müşteri Adı')).toBe('musteriadi')
  })

  it('reads numbers in either decimal convention', () => {
    expect(parseNumber('1,234.56')).toBe(1234.56)
    expect(parseNumber('1.234,56')).toBe(1234.56)
    expect(parseNumber('1 234,56')).toBe(1234.56)
    expect(parseNumber('$1,234.56')).toBe(1234.56)
    expect(parseNumber('kr 189,50')).toBe(189.5)
    expect(parseNumber('12,5')).toBe(12.5)
    expect(parseNumber('12.5')).toBe(12.5)
    expect(parseNumber('(12.50)')).toBe(-12.5)
    expect(parseNumber('-45')).toBe(-45)
    expect(parseNumber('abc')).toBeNull()
    expect(parseNumber('')).toBeNull()
  })

  it('treats a lone separator followed by three digits as grouping', () => {
    expect(parseNumber('125.000')).toBe(125000)
    expect(parseNumber('125,000')).toBe(125000)
    expect(parseNumber('0.500')).toBe(0.5)
    expect(parseNumber('125.000', '.')).toBe(125)
    expect(parseNumber('125,000', ',')).toBe(125)
  })

  it('detects the decimal mark from a column', () => {
    expect(detectDecimalSeparator(['1.234,56', '12,5', '189'])).toBe(',')
    expect(detectDecimalSeparator(['1,234.56', '12.5'])).toBe('.')
    expect(detectDecimalSeparator(['125.000', '3.000'])).toBe('auto')
  })

  it('reads years from many shapes', () => {
    expect(parseYear('2018')).toBe(2018)
    expect(parseYear('2018-03-01')).toBe(2018)
    expect(parseYear('18')).toBe(2018)
    expect(parseYear('98')).toBe(1998)
    expect(parseYear('MY2020')).toBe(2020)
    expect(parseYear('abc')).toBeNull()
  })

  it('parses dates in ISO, day-first, month-first, month-name and Excel forms', () => {
    expect(iso(parseDate('2024-03-15'))).toBe('2024-03-15')
    expect(iso(parseDate('2024-03-15T14:30:00Z'))).toBe('2024-03-15')
    expect(iso(parseDate('2024/3/5'))).toBe('2024-03-05')
    expect(iso(parseDate('20240315'))).toBe('2024-03-15')
    expect(iso(parseDate('15.03.2024'))).toBe('2024-03-15')
    expect(iso(parseDate('15/03/2024 09:00'))).toBe('2024-03-15')
    expect(iso(parseDate('03/15/2024'))).toBe('2024-03-15')
    expect(iso(parseDate('15 Mar 2024'))).toBe('2024-03-15')
    expect(iso(parseDate('Mar 15, 2024'))).toBe('2024-03-15')
    expect(iso(parseDate('15. März 2024'))).toBe('2024-03-15')
    expect(iso(parseDate('5 janvier 2023'))).toBe('2023-01-05')
    expect(iso(parseDate(45366))).toBe('2024-03-15')
    expect(iso(parseDate('45366'))).toBe('2024-03-15')
    expect(iso(parseDate(new Date(Date.UTC(2024, 2, 15))))).toBe('2024-03-15')
  })

  it('uses the chosen format for ambiguous dates and rejects impossible ones', () => {
    expect(iso(parseDate('03/04/2024', 'DMY'))).toBe('2024-04-03')
    expect(iso(parseDate('03/04/2024', 'MDY'))).toBe('2024-03-04')
    expect(iso(parseDate('03/04/2024'))).toBe('2024-04-03')
    expect(iso(parseDate('03/04/24', 'DMY'))).toBe('2024-04-03')
    expect(parseDate('31/02/2024')).toBeNull()
    expect(parseDate('not a date')).toBeNull()
    expect(parseDate('15/03/1850')).toBeNull()
  })

  it('detects day-first versus month-first from a column', () => {
    expect(detectDateFormat(['03/04/2024', '15/03/2024', '01/01/2024'])).toBe('DMY')
    expect(detectDateFormat(['03/04/2024', '03/15/2024'])).toBe('MDY')
    expect(detectDateFormat(['2024-03-15', '2024-04-01'])).toBe('YMD')
    expect(detectDateFormat(['03/04/2024', '05/06/2024'])).toBe('auto')
  })

  it('normalises phones with a workshop country code and keeps them otherwise', () => {
    expect(normalizePhone('912 34 567', '+47')).toBe('+4791234567')
    expect(normalizePhone('+47 912 34 567', null)).toBe('+4791234567')
    expect(normalizePhone('004791234567', null)).toBe('+4791234567')
    expect(normalizePhone('91234567', null)).toBe('91234567')
    expect(normalizePhone('555-1234 ext. 12', '+1')).toBe('555-1234 ext. 12')
    expect(normalizePhone('', '+47')).toBeNull()
    expect(phoneKey('+47 912 34 567')).toBe(phoneKey('91234567'))
  })

  it('validates VINs and compares plates loosely', () => {
    expect(normalizeVin('jtdbr32e720012345')).toEqual({ value: 'JTDBR32E720012345', valid: true })
    expect(normalizeVin('ABC123').valid).toBe(false)
    expect(normalizeVin('JTDBR32E72001234I').valid).toBe(false)
    expect(plateKey('AB 12345')).toBe('AB12345')
    expect(plateKey('ab-12345')).toBe('AB12345')
  })

  it('maps fuel and transmission words from many languages', () => {
    expect(mapFuelType('Benzin')).toBe('gasoline')
    expect(mapFuelType('Bensin')).toBe('gasoline')
    expect(mapFuelType('Petrol')).toBe('gasoline')
    expect(mapFuelType('Diesel (Euro 6)')).toBe('diesel')
    expect(mapFuelType('Elektrisk')).toBe('electric')
    expect(mapFuelType('Plug-in hybrid')).toBe('hybrid')
    expect(mapFuelType('LPG')).toBe('other')
    expect(mapFuelType('')).toBeNull()
    expect(mapTransmission('Automatik')).toBe('automatic')
    expect(mapTransmission('Manuell')).toBe('manual')
    expect(mapTransmission('DSG')).toBe('automatic')
    expect(mapTransmission('CVT')).toBe('cvt')
    expect(mapTransmission('unknown')).toBeNull()
  })

  it('splits a single vehicle column into year, make and model', () => {
    expect(splitVehicleDescription('2018 Toyota Corolla')).toEqual({
      year: 2018,
      make: 'Toyota',
      model: 'Corolla',
    })
    expect(splitVehicleDescription('Toyota Corolla 2018')).toEqual({
      year: 2018,
      make: 'Toyota',
      model: 'Corolla',
    })
    expect(splitVehicleDescription('Toyota Corolla (2018)')).toEqual({
      year: 2018,
      make: 'Toyota',
      model: 'Corolla',
    })
    expect(splitVehicleDescription('Alfa Romeo Giulia')).toEqual({
      year: null,
      make: 'Alfa Romeo',
      model: 'Giulia',
    })
    expect(splitVehicleDescription('Land Rover Defender 110 2020')).toEqual({
      year: 2020,
      make: 'Land Rover',
      model: 'Defender 110',
    })
  })

  it('assembles an address from its parts', () => {
    expect(
      joinAddress({ street: 'Storgata 1', postalCode: '0155', city: 'Oslo', country: 'Norway' })
    ).toBe('Storgata 1, 0155 Oslo, Norway')
    expect(joinAddress({ city: 'Oslo' })).toBe('Oslo')
    expect(joinAddress({})).toBeNull()
  })
})
