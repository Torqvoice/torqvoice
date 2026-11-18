import { describe, expect, it } from 'vitest'
import { vehicleName } from '@/lib/vehicle-name'

/**
 * A vehicle whose year nobody has entered is stored with a year of 0 (the
 * column is a non-null integer). The form keeps years above 1900, so only
 * restores of older backups or third-party imports can carry a 0 in, but
 * those rows stay in the workshop, and the name must not read that 0 as a
 * year ("0 Ford Edge").
 */
describe('vehicleName', () => {
  it('joins the known pieces with a space', () => {
    expect(vehicleName({ year: 2021, make: 'Toyota', model: 'Camry' })).toBe('2021 Toyota Camry')
  })

  it('leaves a zero year out instead of reading it as a year', () => {
    expect(vehicleName({ year: 0, make: 'Ford', model: 'Edge' })).toBe('Ford Edge')
  })

  it('leaves a missing or null year out', () => {
    expect(vehicleName({ make: 'Ford', model: 'Edge' })).toBe('Ford Edge')
    expect(vehicleName({ year: null, make: 'Ford', model: 'Edge' })).toBe('Ford Edge')
  })

  it('drops empty pieces, whatever is left', () => {
    expect(vehicleName({ year: 0, make: '', model: 'Edge' })).toBe('Edge')
    expect(vehicleName({})).toBe('')
  })

  it('reads a year stored as text the same way', () => {
    expect(vehicleName({ year: '2021', make: 'Toyota', model: 'Camry' })).toBe('2021 Toyota Camry')
    expect(vehicleName({ year: '0', make: 'Ford', model: 'Edge' })).toBe('Ford Edge')
  })

  it('honours a separator, as the dash-joined certificate names do', () => {
    expect(vehicleName({ year: 0, make: 'Ford', model: 'Edge' }, '-')).toBe('Ford-Edge')
    expect(vehicleName({ year: 2015, make: 'Ford', model: 'Edge' }, '-')).toBe('2015-Ford-Edge')
  })
})
