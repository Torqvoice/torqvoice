import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { IntlMessageFormat } from 'intl-messageformat'
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

describe('the sample observation in the workshop distance unit', () => {
  // The real next-intl formatter, so the select in the message is exercised.
  const messages = JSON.parse(
    readFileSync(resolve(process.cwd(), 'messages/en/settings.json'), 'utf8')
  ).designer.sample
  const intl = (key: string, values?: Record<string, string | number>) =>
    String(new IntlMessageFormat(messages[key.replace('sample.', '')] ?? key, 'en').format(values))
  const note = (unitSystem?: 'metric' | 'imperial') =>
    buildSampleData({ ...workshop, unitSystem }, [], intl, labels, 'invoice').findings[0]?.notes

  it('says miles for a workshop in miles, and when it never chose', () => {
    expect(note('imperial')).toBe('Replace within 3,000 mi')
    expect(note()).toBe('Replace within 3,000 mi')
  })

  it('says kilometres for a workshop in kilometres', () => {
    expect(note('metric')).toBe('Replace within 5,000 km')
  })
})
