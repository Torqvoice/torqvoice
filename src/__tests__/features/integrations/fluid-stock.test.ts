import { describe, expect, it } from 'vitest'
import {
  amountIn,
  fluidLineName,
  fluidLitres,
  fluidPartLine,
  fluidTokens,
  matchStock,
  type StockPart,
  volumeUnitOf,
} from '@/features/integrations/Lib/fluid-stock'

function part(id: string, name: string, extra: Partial<StockPart> = {}): StockPart {
  return {
    id,
    name,
    partNumber: null,
    unit: 'l',
    unitCost: 100,
    sellPrice: 189,
    quantity: 24,
    ...extra,
  }
}

const OIL = {
  system: 'Engine Oil',
  fluid: '0W-20 full synthetic',
  spec: 'API SP, ILSAC GF-6A, dexos1 Gen 3',
  capacityLiters: 5.7,
  capacityQuarts: 6,
  drainRefillLiters: null,
  drainRefillQuarts: null,
}

describe('fluidTokens', () => {
  it('reads grades and specs the same however they are written', () => {
    const values = (s: string) => fluidTokens(s).map((t) => t.value)
    expect(values('0W-20')).toEqual(['0w20'])
    expect(values('Motorolje 0w20 5L')).toEqual(['0w20'])
    expect(values('Bremsevæske DOT 4')).toEqual(['dot4'])
    expect(values('Kjølevæske G13')).toEqual(['g13'])
    expect(values('VW 504.00 / 507.00')).toEqual(expect.arrayContaining(['vw504.00', '507.00']))
    expect(values('API SP, ILSAC GF-6A')).toEqual(expect.arrayContaining(['apisp', 'ilsacgf6a']))
  })

  it('finds nothing in a name without a code', () => {
    expect(fluidTokens('Spylervæske')).toEqual([])
    expect(fluidTokens(null)).toEqual([])
  })
})

describe('matchStock', () => {
  it("finds a Norwegian shop's oil by its grade", () => {
    const stock = [
      part('a', 'Motorolje 0W-20 Castrol Edge'),
      part('b', 'Bremseklosser foran'),
      part('c', 'Spylervæske'),
    ]
    expect(matchStock(OIL, stock).map((m) => m.part.id)).toEqual(['a'])
  })

  it('never offers another grade, even when a spec matches', () => {
    const stock = [part('wrong', 'Motorolje 5W-30 API SP'), part('right', 'Motorolje 0W-20')]
    expect(matchStock(OIL, stock).map((m) => m.part.id)).toEqual(['right'])
  })

  it('puts the closest and the stocked first, and keeps to three', () => {
    const stock = [
      part('grade-only-empty', 'Olje 0W-20', { quantity: 0 }),
      part('grade-only', 'Olje 0W-20 B'),
      part('grade-and-dexos', 'Olje 0W-20 dexos1'),
      part('grade-and-api', 'Olje 0W-20 API SP'),
      part('can', 'Olje 0W-20 C', { unit: 'stk' }),
    ]
    const ids = matchStock(OIL, stock).map((m) => m.part.id)
    expect(ids).toHaveLength(3)
    expect(ids.slice(0, 2).sort()).toEqual(['grade-and-api', 'grade-and-dexos'])
    expect(ids[2]).toBe('grade-only')
  })

  it('matches brake fluid by class and never a different class', () => {
    const brake = { fluid: 'DOT 4 brake fluid', spec: null }
    const stock = [part('dot3', 'Bremsevæske DOT 3'), part('dot4', 'Bremsevæske DOT 4 1L')]
    expect(matchStock(brake, stock).map((m) => m.part.id)).toEqual(['dot4'])
  })

  it('keeps the G12 coolants apart, however "plus" is written', () => {
    const values = (t: string) => fluidTokens(t).map((x) => x.value)
    expect(values('G12')).toEqual(['g12'])
    expect(values('G12+')).toEqual(['g12+'])
    expect(values('G12 plus')).toEqual(['g12+'])
    expect(values('G12++')).toEqual(['g12++'])
    expect(values('G 12 plus plus')).toEqual(['g12++'])
    expect(values('G12 evo')).toEqual(['g12evo'])
    expect(values('G13')).toEqual(['g13'])
  })

  it('never offers another G12 generation for the one the car takes', () => {
    const coolant = { fluid: 'Coolant G12++', spec: 'VW TL 774 G' }
    const stock = [
      part('g12', 'Kjølevæske G12'),
      part('g12plus', 'Kjølevæske G12+'),
      part('g12pp', 'Kjølevæske G12 plus plus'),
    ]
    expect(matchStock(coolant, stock).map((m) => m.part.id)).toEqual(['g12pp'])
    expect(matchStock({ fluid: 'G12', spec: null }, stock).map((m) => m.part.id)).toEqual(['g12'])
  })

  it('offers nothing for a fluid without a grade or spec', () => {
    expect(matchStock({ fluid: 'Water', spec: null }, [part('a', 'Destillert vann')])).toEqual([])
  })
})

describe('amounts', () => {
  it('takes the drain and refill amount before the capacity', () => {
    expect(fluidLitres({ ...OIL, drainRefillLiters: 5.2 })).toEqual({
      litres: 5.2,
      from: 'drainRefill',
    })
    expect(fluidLitres(OIL)).toEqual({ litres: 5.7, from: 'capacity' })
  })

  it('works from quarts when that is all the source gives', () => {
    const quartsOnly = { ...OIL, capacityLiters: null, capacityQuarts: 6 }
    expect(fluidLitres(quartsOnly)?.litres).toBeCloseTo(5.68, 2)
  })

  it('has no amount when the source gives none', () => {
    expect(
      fluidLitres({
        capacityLiters: null,
        capacityQuarts: null,
        drainRefillLiters: null,
        drainRefillQuarts: null,
      })
    ).toBeNull()
  })

  it('reads the units shops use for volume, and nothing else', () => {
    expect(['l', 'L', 'Ltr', 'liter', 'litre', 'lt.'].map(volumeUnitOf)).toEqual(Array(6).fill('l'))
    expect(volumeUnitOf('ml')).toBe('ml')
    expect(volumeUnitOf('qt')).toBe('qt')
    expect(volumeUnitOf('stk')).toBeNull()
    expect(volumeUnitOf(null)).toBeNull()
  })

  it('converts to the unit the item is sold in', () => {
    expect(amountIn(5.7, 'l')).toBe(5.7)
    expect(amountIn(5.7, 'ml')).toBe(5700)
    expect(amountIn(5.7, 'qt')).toBe(6.02)
    expect(amountIn(5.7, 'stk')).toBeNull()
  })
})

describe('fluidPartLine', () => {
  it('adds a stocked item in its own unit at its price', () => {
    const line = fluidPartLine(OIL, { units: 'both', part: part('a', 'Motorolje 0W-20') })
    expect(line).toEqual({
      partNumber: '',
      name: 'Motorolje 0W-20',
      quantity: 5.7,
      unit: 'l',
      category: null,
      unitCost: 100,
      markupPercent: 0,
      unitPrice: 189,
      total: 1077.3,
      inventoryPartId: 'a',
    })
  })

  it("prices it the way the page does, with the workshop's markup when that is the rule", () => {
    const line = fluidPartLine(OIL, {
      units: 'both',
      part: part('a', 'Motorolje 0W-20'),
      pricing: { defaultMarkupPercent: 50, markupAppliesToInventory: true },
    })
    expect(line).toMatchObject({ unitPrice: 150, markupPercent: 50, total: 855 })
  })

  it('adds one of an item sold per piece, for the shop to adjust', () => {
    const can = part('can', 'Motorolje 0W-20 5L kanne', { unit: 'stk', sellPrice: 899 })
    expect(fluidPartLine(OIL, { units: 'both', part: can })).toMatchObject({
      quantity: 1,
      unit: 'stk',
      total: 899,
    })
  })

  it('adds a plain line with the amount and no price when nothing is stocked', () => {
    expect(fluidPartLine(OIL, { units: 'metric' })).toEqual({
      partNumber: '',
      name: 'Engine Oil, 0W-20 full synthetic (API SP, ILSAC GF-6A, dexos1 Gen 3)',
      quantity: 5.7,
      unit: 'l',
      category: null,
      unitCost: 0,
      markupPercent: 0,
      unitPrice: 0,
      total: 0,
      inventoryPartId: null,
    })
    expect(fluidPartLine(OIL, { units: 'us' })).toMatchObject({ quantity: 6.02, unit: 'qt' })
  })

  it('names a plain line from what the source gives', () => {
    expect(fluidLineName({ system: 'Coolant', fluid: null, spec: null })).toBe('Coolant')
    expect(fluidLineName({ system: 'Coolant', fluid: 'OAT', spec: 'G13' })).toBe(
      'Coolant, OAT (G13)'
    )
  })
})
