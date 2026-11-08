import { describe, expect, it } from 'vitest'
import { buildSampleData } from '@/features/invoice-designer/Components/sample'
import type { DesignerWorkshop } from '@/features/invoice-designer/Components/types'

/**
 * The sample car's mileage is written in the workshop's own distance unit, the
 * way its printed invoices write it. A workshop in miles used to preview
 * "84,120 km" on a sheet that prints miles.
 */

const t = (key: string) => key
const labels = { mileage: 'Mileage: {mileage}', km: 'km', mi: 'mi' }
const workshop: DesignerWorkshop = {
  name: 'Riverside Auto',
  address: '',
  phone: '',
  email: '',
  slogan: '',
  orgNumber: '',
  paymentTerms: '',
  logoUrl: '',
}

const mileage = (unitSystem?: 'metric' | 'imperial') =>
  buildSampleData({ ...workshop, unitSystem }, [], t, labels, 'invoice').fields.mileage

describe('the sample mileage in the workshop distance unit', () => {
  it('writes miles for a workshop in miles', () => {
    expect(mileage('imperial')).toBe('Mileage: 84,120 mi')
  })

  it('writes kilometres for a workshop in kilometres', () => {
    expect(mileage('metric')).toBe('Mileage: 84,120 km')
  })

  it('writes miles when the workshop never chose, as its invoices do', () => {
    expect(mileage()).toBe('Mileage: 84,120 mi')
  })
})
