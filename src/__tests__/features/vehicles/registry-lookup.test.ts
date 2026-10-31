import { describe, expect, it } from 'vitest'
import {
  holdsRegistryDate,
  identifierKey,
  lookupAppliesTo,
  registryLookupSchema,
} from '@/features/vehicles/Lib/registryLookup'

describe('registry lookup saved with the vehicle form', () => {
  it('reduces a plate or VIN to its letters and digits', () => {
    expect(identifierKey(' ab-12 345 ')).toBe('AB12345')
    expect(identifierKey('')).toBe('')
  })

  it('applies to the vehicle whose plate was asked about, however it is written', () => {
    const lookup = { by: 'plate' as const, value: 'AB 12345' }
    expect(lookupAppliesTo(lookup, { licensePlate: 'ab-12345' })).toBe(true)
    // The plate was retyped after the lookup: another vehicle.
    expect(lookupAppliesTo(lookup, { licensePlate: 'CD 67890' })).toBe(false)
    expect(lookupAppliesTo(lookup, { licensePlate: null })).toBe(false)
    expect(lookupAppliesTo({ by: 'plate', value: '' }, { licensePlate: '' })).toBe(false)
  })

  it('matches a VIN lookup against the VIN, not the plate', () => {
    const lookup = { by: 'vin' as const, value: '1HGCM82633A004352' }
    expect(lookupAppliesTo(lookup, { vin: '1hgcm82633a004352', licensePlate: 'X' })).toBe(true)
    expect(lookupAppliesTo(lookup, { vin: null, licensePlate: '1HGCM82633A004352' })).toBe(false)
  })

  it('tells a date left as the registry gave it from one typed over it', () => {
    const result = { inspectionDue: '2027-03-31' }
    expect(holdsRegistryDate(undefined, result)).toBe(true)
    expect(holdsRegistryDate('2027-03-31', result)).toBe(true)
    expect(holdsRegistryDate('2027-04-15', result)).toBe(false)
    expect(holdsRegistryDate('', result)).toBe(false)
    // A registry without a date gave nothing the field could still hold.
    expect(holdsRegistryDate(undefined, {})).toBe(true)
    expect(holdsRegistryDate('', {})).toBe(false)
    expect(holdsRegistryDate('2027-04-15', {})).toBe(false)
  })

  it('keeps only what the inspection status stores from the form’s lookup', () => {
    const parsed = registryLookupSchema.parse({
      connectorId: 'checkcardetails',
      by: 'plate',
      value: 'AB12 CDE',
      result: {
        make: 'Ford',
        model: 'Focus',
        inspectionDue: '2027-03-31',
        registered: false,
        tyres: [{ axle: 1, tyre: '205/55 R16' }],
      },
    })
    expect(parsed.result).toEqual({
      inspectionDue: '2027-03-31',
      registered: false,
      tyres: [{ axle: 1, tyre: '205/55 R16' }],
    })
  })
})
