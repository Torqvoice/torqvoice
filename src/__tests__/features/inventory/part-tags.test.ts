/**
 * The rules behind part tags: what a saved list looks like, which searches
 * find a part, and which tags say a part fits the vehicle on the job.
 *
 * The fit rules decide the order of the work order's parts picker, so a wrong
 * answer here puts the wrong filter at the top of the list a technician picks
 * from.
 */

import { describe, it, expect } from 'vitest'
import {
  distinctTags,
  fittingTags,
  normalizePartTags,
  partMatchesQuery,
  rankByVehicleFit,
  splitTagInput,
  tagFit,
  vehicleFitScore,
} from '@/features/inventory/Lib/partTags'

describe('normalizePartTags', () => {
  it('trims, collapses spaces and drops empty tags', () => {
    expect(normalizePartTags(['  Toyota ', '', '   ', 'Hilux   2015-2020'])).toEqual([
      'Toyota',
      'Hilux 2015-2020',
    ])
  })

  it('keeps one of two tags that differ only in case, the first typed', () => {
    expect(normalizePartTags(['Toyota', 'toyota', 'TOYOTA', 'Hilux'])).toEqual(['Toyota', 'Hilux'])
  })
})

describe('splitTagInput', () => {
  it('turns a pasted list into tags at its commas', () => {
    expect(splitTagInput('Toyota, Hilux ,Corolla,, ')).toEqual(['Toyota', 'Hilux', 'Corolla'])
  })
})

describe('distinctTags', () => {
  it('lists each tag once, sorted, in the spelling most parts use', () => {
    expect(
      distinctTags([
        ['Toyota', 'Hilux'],
        ['toyota', 'Corolla'],
        ['Toyota'],
        ['Mazda 3', 'Mazda 10'],
      ])
    ).toEqual(['Corolla', 'Hilux', 'Mazda 3', 'Mazda 10', 'Toyota'])
  })
})

describe('partMatchesQuery', () => {
  const filter = {
    name: 'Fuel filter',
    partNumber: 'FF-23',
    description: 'Inline, 8mm',
    tags: ['Toyota', 'Hilux 2015-2020'],
  }

  it('finds a part by a tag', () => {
    expect(partMatchesQuery(filter, 'hilux')).toBe(true)
  })

  it('needs every word, but each may come from a different field', () => {
    expect(partMatchesQuery(filter, 'filter hilux')).toBe(true)
    expect(partMatchesQuery(filter, 'filter corolla')).toBe(false)
  })

  it('searches the description too', () => {
    expect(partMatchesQuery(filter, '8mm')).toBe(true)
  })

  it('matches everything for an empty search', () => {
    expect(partMatchesQuery(filter, '   ')).toBe(true)
  })
})

describe('tagFit', () => {
  const hilux = { make: 'Toyota', model: 'Hilux' }

  it('reads a model name, alone, with the make or with years', () => {
    expect(tagFit('Hilux', hilux)).toBe('model')
    expect(tagFit('Toyota Hilux', hilux)).toBe('model')
    expect(tagFit('hilux 2015-2020', hilux)).toBe('model')
  })

  it('reads a model stored with its trim, such as Hilux SR5', () => {
    const sr5 = { make: 'Toyota', model: 'Hilux SR5 Double Cab' }
    expect(tagFit('Hilux', sr5)).toBe('model')
    expect(tagFit('Hilux 2016', sr5)).toBe('model')
    expect(tagFit('Toyota Hilux', sr5)).toBe('model')
    expect(tagFit('Toyota Corolla', sr5)).toBeNull()
  })

  it('reads the make alone, or with years, as a make match', () => {
    expect(tagFit('Toyota', hilux)).toBe('make')
    expect(tagFit('toyota 2010-2020', hilux)).toBe('make')
    expect(tagFit('Mercedes', { make: 'Mercedes-Benz', model: 'Sprinter' })).toBe('make')
  })

  it('does not match the make with some other model', () => {
    expect(tagFit('Toyota Corolla', hilux)).toBeNull()
  })

  it('does not take a make tag for the model when the model repeats the make', () => {
    expect(tagFit('Toyota', { make: 'Toyota', model: 'Toyota Hilux' })).toBe('make')
  })

  it('reads the numbers in a model name, so a 3 Series part does not fit a 5 Series', () => {
    const fiveSeries = { make: 'BMW', model: '5-Serie F11' }
    expect(tagFit('5-Serie', fiveSeries)).toBe('model')
    expect(tagFit('BMW 5-Serie 2010-2017', fiveSeries)).toBe('model')
    expect(tagFit('3-Serie', fiveSeries)).toBeNull()
    expect(tagFit('Golf 7', { make: 'Volkswagen', model: 'Golf 6' })).toBeNull()
  })

  it('does not match a tag that opens with another make, whatever model follows', () => {
    const sprinter = { make: 'Mercedes-Benz', model: 'Sprinter' }
    expect(tagFit('Toyota Sprinter', sprinter)).toBeNull()
    expect(tagFit('VW Crafter', sprinter)).toBeNull()
    // The vehicle's own make, however it is written, is not another make.
    expect(tagFit('Mercedes Sprinter', sprinter)).toBe('model')
    expect(tagFit('Mercedes-Benz Sprinter 2018', sprinter)).toBe('model')
    expect(tagFit('Vauxhall Astra', { make: 'Opel', model: 'Astra' })).toBe('model')
    expect(tagFit('VW Golf', { make: 'Volkswagen', model: 'Golf' })).toBe('model')
  })

  it('reads only the start of a tag for a make, so a common word is not taken for one', () => {
    // SEAT is a make, but a tag that merely mentions a seat is about the Hilux.
    expect(tagFit('Hilux seat cover', { make: 'Toyota', model: 'Hilux' })).toBe('model')
  })

  it('takes the longest make, so Volvo Penta is not a Volvo', () => {
    const penta = { make: 'Volvo Penta', model: 'D2-40' }
    expect(tagFit('Volvo Penta D2-40', penta)).toBe('model')
    expect(tagFit('Volvo Penta D2-40', { make: 'Volvo', model: 'D2-40' })).toBeNull()
  })

  it('still matches by model when the vehicle’s make is not in the list, or missing', () => {
    expect(tagFit('Holden Colorado', { make: 'Holden', model: 'Colorado' })).toBe('model')
    expect(tagFit('Colorado', { make: 'Holden', model: 'Colorado' })).toBe('model')
    expect(tagFit('Toyota Hilux', { make: '', model: 'Hilux' })).toBe('model')
  })

  it('does not match on a number or a part of a word', () => {
    expect(tagFit('50', { make: 'Mazda', model: 'BT-50' })).toBeNull()
    expect(tagFit('Hi', hilux)).toBeNull()
    expect(tagFit('2015', hilux)).toBeNull()
  })
})

describe('vehicleFitScore and fittingTags', () => {
  const hilux = { make: 'Toyota', model: 'Hilux' }

  it('scores a model tag above a make tag above nothing', () => {
    expect(vehicleFitScore(['Diesel', 'Hilux'], hilux)).toBe(2)
    expect(vehicleFitScore(['Diesel', 'Toyota'], hilux)).toBe(1)
    expect(vehicleFitScore(['Diesel'], hilux)).toBe(0)
    expect(vehicleFitScore(['Hilux'], null)).toBe(0)
  })

  it('names the tags that matched', () => {
    expect(fittingTags(['Diesel', 'Toyota', 'Hilux', 'Ford Ranger'], hilux)).toEqual([
      'Toyota',
      'Hilux',
    ])
  })
})

describe('rankByVehicleFit', () => {
  it('puts model matches first, then make matches, otherwise keeping the order', () => {
    const parts = [
      { id: 'air', tags: [] },
      { id: 'toyota-oil', tags: ['Toyota'] },
      { id: 'ranger', tags: ['Ford Ranger'] },
      { id: 'hilux-fuel', tags: ['Hilux 2015-2020'] },
      { id: 'cabin', tags: [] },
    ]
    expect(rankByVehicleFit(parts, { make: 'Toyota', model: 'Hilux' }).map((p) => p.id)).toEqual([
      'hilux-fuel',
      'toyota-oil',
      'air',
      'ranger',
      'cabin',
    ])
  })

  it('leaves the order alone without a vehicle', () => {
    const parts = [{ id: 'a', tags: ['Hilux'] }, { id: 'b' }]
    expect(rankByVehicleFit(parts, null).map((p) => p.id)).toEqual(['a', 'b'])
  })
})
