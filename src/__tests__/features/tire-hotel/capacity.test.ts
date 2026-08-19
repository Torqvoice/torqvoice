import { describe, it, expect } from 'vitest'
import {
  locationCapacity,
  warehouseCapacity,
  partitionByRoom,
  locationsWithRoom,
  totalFree,
  type LocationCapacity,
} from '@/features/tire-hotel/Lib/capacity'
import {
  buildLocationCode,
  gradeTread,
  occupancyBand,
  mmToThirtySeconds,
  thirtySecondsToMm,
  worstCondition,
} from '@/features/tire-hotel/Lib/tireConstants'

const shelf = (
  id: string,
  capacity: number,
  quantities: number[]
): Parameters<typeof locationCapacity>[0] => ({
  id,
  code: id,
  capacity,
  tireSets: quantities.map((quantity) => ({ quantity })),
})

describe('location capacity', () => {
  it('counts individual tires, not sets', () => {
    // Two sets of different sizes: a pair and a five-wheel set.
    const result = locationCapacity(shelf('A1', 8, [2, 5]))
    expect(result.used).toBe(7)
    expect(result.free).toBe(1)
  })

  it('reports an empty shelf as fully free', () => {
    const result = locationCapacity(shelf('A1', 8, []))
    expect(result.used).toBe(0)
    expect(result.free).toBe(8)
    expect(result.band).toBe('empty')
  })

  it('never reports negative free space when a shelf is overfilled', () => {
    const result = locationCapacity(shelf('A1', 4, [4, 4]))
    expect(result.used).toBe(8)
    expect(result.free).toBe(0)
    expect(result.band).toBe('over')
  })

  it('treats a zero-capacity shelf holding tires as over capacity', () => {
    const result = locationCapacity(shelf('A1', 0, [4]))
    expect(result.band).toBe('over')
    expect(result.free).toBe(0)
  })

  it('clamps a negative stored capacity to zero', () => {
    const result = locationCapacity(shelf('A1', -5, []))
    expect(result.capacity).toBe(0)
  })
})

describe('occupancy bands', () => {
  it('moves through the bands as a shelf fills', () => {
    expect(occupancyBand(0, 10)).toBe('empty')
    expect(occupancyBand(5, 10)).toBe('comfortable')
    expect(occupancyBand(9, 10)).toBe('tight')
    expect(occupancyBand(10, 10)).toBe('full')
    expect(occupancyBand(11, 10)).toBe('over')
  })
})

describe('warehouse capacity', () => {
  it('sums its locations and counts which are in use', () => {
    const result = warehouseCapacity({
      id: 'w1',
      name: 'Main',
      locations: [shelf('A1', 8, [4]), shelf('A2', 8, []), shelf('A3', 4, [4])],
    })
    expect(result.capacity).toBe(20)
    expect(result.used).toBe(8)
    expect(result.free).toBe(12)
    expect(result.locationCount).toBe(3)
    expect(result.occupiedLocationCount).toBe(2)
  })
})

describe('finding room for a set', () => {
  const shelves: LocationCapacity[] = [
    locationCapacity(shelf('A1', 8, [4])), // 4 free
    locationCapacity(shelf('A2', 8, [])), // 8 free
    locationCapacity(shelf('A3', 8, [6])), // 2 free
  ]

  it('offers the tightest fit first so storage stays dense', () => {
    const fits = locationsWithRoom(shelves, 4)
    expect(fits.map((l) => l.code)).toEqual(['A1', 'A2'])
  })

  it('excludes shelves that cannot take the whole set', () => {
    const fits = locationsWithRoom(shelves, 5)
    expect(fits.map((l) => l.code)).toEqual(['A2'])
  })

  it('keeps the too-full shelves visible, emptiest first', () => {
    const { fits, tooFull } = partitionByRoom(shelves, 5)
    expect(fits.map((l) => l.code)).toEqual(['A2'])
    expect(tooFull.map((l) => l.code)).toEqual(['A1', 'A3'])
  })

  it('reports nothing fits when the building is full', () => {
    const full = [locationCapacity(shelf('A1', 4, [4]))]
    expect(locationsWithRoom(full, 1)).toEqual([])
  })

  it('totals free slots across every shelf', () => {
    expect(totalFree(shelves)).toBe(14)
  })
})

describe('location codes', () => {
  it('builds a code from whichever parts the workshop filled in', () => {
    expect(buildLocationCode({ zone: 'B', rack: '04', shelf: '2' })).toBe('B-04-2')
    expect(buildLocationCode({ shelf: 'S12' })).toBe('S12')
    expect(buildLocationCode({ zone: ' A ', rack: '', shelf: '1' })).toBe('A-1')
  })

  it('returns an empty string when nothing was filled in', () => {
    expect(buildLocationCode({})).toBe('')
  })
})

describe('unit conversion', () => {
  it('round-trips tread depth between mm and 32nds', () => {
    const mm = 6.5
    expect(thirtySecondsToMm(mmToThirtySeconds(mm))).toBeCloseTo(mm, 6)
  })

  it('matches the familiar reference points', () => {
    // 8mm is a common new-tire depth, a shade over 10/32".
    expect(mmToThirtySeconds(8)).toBeCloseTo(10.08, 2)
  })
})

describe('tread grading', () => {
  it('holds winter tires to a higher bar than summer tires', () => {
    expect(gradeTread(3, 'winter')).toBe('replace')
    expect(gradeTread(3, 'summer')).toBe('good')
  })

  it('warns before the tire is actually illegal', () => {
    expect(gradeTread(2.2, 'summer')).toBe('fair')
    expect(gradeTread(1.4, 'summer')).toBe('replace')
  })

  it('returns null when no reading was taken', () => {
    expect(gradeTread(null, 'summer')).toBeNull()
    expect(gradeTread(undefined, 'winter')).toBeNull()
  })

  it('honours a workshop that sets its own limits', () => {
    const strict = { summerReplace: 3, winterReplace: 5, warnMargin: 1 }
    expect(gradeTread(2.5, 'summer', strict)).toBe('replace')
  })
})

describe('set-level condition', () => {
  it('reports the worst tire in the set', () => {
    expect(worstCondition(['good', 'good', 'fair'])).toBe('fair')
    expect(worstCondition(['good', 'replace', 'fair'])).toBe('replace')
    expect(worstCondition(['good', 'good'])).toBe('good')
  })
})
