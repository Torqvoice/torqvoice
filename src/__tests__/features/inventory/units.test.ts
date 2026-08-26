import { describe, expect, it } from 'vitest'
import {
  IMPERIAL_MEASUREMENT_UNITS,
  METRIC_MEASUREMENT_UNITS,
  unitSuggestions,
} from '@/features/inventory/Lib/units'

describe('unitSuggestions', () => {
  it('leads with the localized count units', () => {
    const list = unitSuggestions('Stk,Satz', 'metric')
    expect(list.slice(0, 2)).toEqual(['Stk', 'Satz'])
  })

  it('orders metric before imperial for a metric workshop', () => {
    const list = unitSuggestions('pcs', 'metric')
    expect(list.indexOf('l')).toBeLessThan(list.indexOf('qt'))
    expect(list.indexOf('kg')).toBeLessThan(list.indexOf('lb'))
  })

  it('orders imperial before metric for an imperial workshop', () => {
    const list = unitSuggestions('pcs', 'imperial')
    expect(list.indexOf('qt')).toBeLessThan(list.indexOf('l'))
    expect(list.indexOf('lb')).toBeLessThan(list.indexOf('kg'))
  })

  it('treats an unknown or missing system as metric', () => {
    expect(unitSuggestions('pcs')).toEqual(unitSuggestions('pcs', 'metric'))
  })

  it('always offers both systems in full', () => {
    const list = unitSuggestions('pcs', 'imperial')
    for (const u of [...METRIC_MEASUREMENT_UNITS, ...IMPERIAL_MEASUREMENT_UNITS]) {
      expect(list).toContain(u)
    }
  })

  it('trims and dedupes against the localized list', () => {
    const list = unitSuggestions(' pcs , l ,, pcs ', 'metric')
    expect(list.filter((u) => u === 'pcs')).toHaveLength(1)
    expect(list.filter((u) => u === 'l')).toHaveLength(1)
  })
})
