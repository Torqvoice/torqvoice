import { describe, expect, it } from 'vitest'
import {
  bareEngineUnit,
  engineSizeHint,
  engineSizePlaceholder,
  engineSizeToSave,
  engineSizeUnitOf,
  formatEngineSize,
  withEngineUnit,
} from '@/lib/engine-size'

describe('formatEngineSize', () => {
  it('writes cubic centimetres exactly for a cc workshop', () => {
    expect(formatEngineSize(649, 'cc')).toBe('649 cc')
    expect(formatEngineSize(1598, 'cc')).toBe('1598 cc')
    expect(formatEngineSize(2998.83, 'cc')).toBe('2999 cc')
  })

  it('writes litres for a litres workshop, keeping small engines exact', () => {
    expect(formatEngineSize(1598, 'litres')).toBe('1.6 L')
    expect(formatEngineSize(649, 'litres')).toBe('0.649 L')
    expect(formatEngineSize(49, 'litres')).toBe('0.049 L')
    expect(formatEngineSize(125, 'litres')).toBe('0.125 L')
  })

  it('writes nothing for a figure that is not a displacement', () => {
    expect(formatEngineSize(undefined, 'cc')).toBeUndefined()
    expect(formatEngineSize(0, 'litres')).toBeUndefined()
    expect(formatEngineSize(Number.NaN, 'cc')).toBeUndefined()
  })
})

describe('typing a bare number', () => {
  it('reads small numbers as litres and large ones as cubic centimetres', () => {
    expect(bareEngineUnit('1.6')).toBe('L')
    expect(bareEngineUnit('2,0')).toBe('L')
    expect(bareEngineUnit('649')).toBe('cc')
    expect(bareEngineUnit(' 1598 ')).toBe('cc')
  })

  it('leaves anything that is not just a number alone', () => {
    expect(bareEngineUnit('2.0 TDI')).toBeNull()
    expect(bareEngineUnit('1598 cc')).toBeNull()
    expect(bareEngineUnit('316i mk1')).toBeNull()
    expect(bareEngineUnit('')).toBeNull()
    expect(bareEngineUnit('0')).toBeNull()
  })

  it('saves a bare number with its unit and everything else as typed', () => {
    expect(withEngineUnit('649')).toBe('649 cc')
    expect(withEngineUnit('1.6')).toBe('1.6 L')
    expect(withEngineUnit('2,0')).toBe('2.0 L')
    expect(withEngineUnit('2.0 TDI')).toBe('2.0 TDI')
    expect(withEngineUnit('')).toBe('')
  })
})

describe('the workshop setting', () => {
  it('is litres until cubic centimetres are chosen', () => {
    expect(engineSizeUnitOf(undefined)).toBe('litres')
    expect(engineSizeUnitOf('litres')).toBe('litres')
    expect(engineSizeUnitOf('cc')).toBe('cc')
    expect(engineSizeUnitOf('nonsense')).toBe('litres')
  })

  it('suggests the same engine in either unit', () => {
    expect(engineSizePlaceholder('litres')).toBe('1.6 L')
    expect(engineSizePlaceholder('cc')).toBe('1598 cc')
  })
})

describe('editing a vehicle that already has an engine size', () => {
  it('keeps the saved value exactly when the field was not changed', () => {
    expect(engineSizeToSave('649', '649')).toBe('649')
    expect(engineSizeToSave('2,0', '2,0')).toBe('2,0')
    expect(engineSizeHint('649', '649')).toBeNull()
  })

  it('adds the unit once the field is changed', () => {
    expect(engineSizeToSave('690', '649')).toBe('690 cc')
    expect(engineSizeHint('690', '649')).toBe('cc')
  })

  it('adds the unit to a new vehicle', () => {
    expect(engineSizeToSave('1.6', undefined)).toBe('1.6 L')
    expect(engineSizeToSave('', null)).toBe('')
    expect(engineSizeHint('1.6', '')).toBe('L')
  })
})
