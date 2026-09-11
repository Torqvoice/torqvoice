import { describe, expect, it } from 'vitest'
import {
  DEFAULT_WORK_ORDER_TITLE_TEMPLATE,
  FALLBACK_WORK_ORDER_TITLE,
  MAX_WORK_ORDER_TITLE_LENGTH,
  MAX_WORK_ORDER_TITLE_TEMPLATE_LENGTH,
  resolveWorkOrderTitle,
  SAMPLE_WORK_ORDER_TITLE_VALUES,
  tokensIn,
  unknownTokensIn,
  WORK_ORDER_TITLE_TOKENS,
  workOrderTitleTemplateFrom,
  workOrderTitleValues,
} from '@/features/vehicles/Lib/workOrderTitle'

/**
 * The title a new work order opens with, from the workshop's template.
 *
 * The rules a workshop relies on without reading them: every tag fills in,
 * a tag with nothing behind it takes its separator with it, a typo never
 * produces an empty or broken title, and what the workshop typed between the
 * tags is left exactly as typed.
 */

const values = {
  order_number: '2026-1042',
  license_plate: 'AB 12345',
  customer_name: 'Jane Cooper',
  vehicle: '2021 Toyota Camry',
  make: 'Toyota',
  model: 'Camry',
  year: 2021,
  vin: '4T1BF1FK5CU123456',
  technician: 'Sam Lee',
  date: '2026-09-11',
}

describe('resolveWorkOrderTitle', () => {
  it('fills every tag it knows', () => {
    for (const token of WORK_ORDER_TITLE_TOKENS) {
      expect(resolveWorkOrderTitle(`{${token}}`, values), token).toBe(String(values[token]))
    }
  })

  it('names the default the way the request asked: number, then plate', () => {
    expect(resolveWorkOrderTitle(DEFAULT_WORK_ORDER_TITLE_TEMPLATE, values)).toBe(
      '2026-1042 - AB 12345'
    )
  })

  it('keeps the text between tags exactly as written', () => {
    expect(resolveWorkOrderTitle('WO#{order_number} ({license_plate})', values)).toBe(
      'WO#2026-1042 (AB 12345)'
    )
    expect(resolveWorkOrderTitle('{customer_name}: {vehicle} / {date}', values)).toBe(
      'Jane Cooper: 2021 Toyota Camry / 2026-09-11'
    )
  })

  it('does not touch punctuation inside a value', () => {
    // The order number's own dash is not a separator to be tidied.
    expect(resolveWorkOrderTitle('{order_number}', values)).toBe('2026-1042')
    expect(resolveWorkOrderTitle('{order_number}/{year}', values)).toBe('2026-1042/2021')
  })

  it('drops an empty tag together with the separator beside it', () => {
    const noPlate = { ...values, license_plate: null }
    expect(resolveWorkOrderTitle('{order_number} - {license_plate}', noPlate)).toBe('2026-1042')
    expect(resolveWorkOrderTitle('{license_plate} - {order_number}', noPlate)).toBe('2026-1042')
    expect(
      resolveWorkOrderTitle('{order_number} - {license_plate} - {customer_name}', noPlate)
    ).toBe('2026-1042 - Jane Cooper')
    // Whitespace-only counts as empty too.
    expect(resolveWorkOrderTitle('{order_number} · {vin}', { ...values, vin: '   ' })).toBe(
      '2026-1042'
    )
  })

  it('drops an empty tag inside brackets with the brackets', () => {
    expect(
      resolveWorkOrderTitle('{order_number} ({license_plate})', { ...values, license_plate: '' })
    ).toBe('2026-1042')
    expect(
      resolveWorkOrderTitle('{order_number} [{customer_name}]', {
        ...values,
        customer_name: null,
      })
    ).toBe('2026-1042')
  })

  it('drops a tag nobody knows the same way', () => {
    expect(resolveWorkOrderTitle('{order_number} - {nope} - {license_plate}', values)).toBe(
      '2026-1042 - AB 12345'
    )
    expect(resolveWorkOrderTitle('{unknown}', values)).toBe(FALLBACK_WORK_ORDER_TITLE)
  })

  it('reads the spellings people reach for as the tag they mean', () => {
    expect(resolveWorkOrderTitle('{order_id}', values)).toBe('2026-1042')
    expect(resolveWorkOrderTitle('{invoice_number}', values)).toBe('2026-1042')
    expect(resolveWorkOrderTitle('{plate}', values)).toBe('AB 12345')
    expect(resolveWorkOrderTitle('{customer}', values)).toBe('Jane Cooper')
    expect(resolveWorkOrderTitle('{ Order_Number }', values)).toBe('2026-1042')
  })

  it('falls back to the plain name when nothing is left', () => {
    expect(resolveWorkOrderTitle('', values)).toBe(FALLBACK_WORK_ORDER_TITLE)
    expect(resolveWorkOrderTitle('   ', values)).toBe(FALLBACK_WORK_ORDER_TITLE)
    expect(resolveWorkOrderTitle(null, values)).toBe(FALLBACK_WORK_ORDER_TITLE)
    expect(resolveWorkOrderTitle(undefined, values)).toBe(FALLBACK_WORK_ORDER_TITLE)
    expect(resolveWorkOrderTitle('{license_plate} - {vin}', {})).toBe(FALLBACK_WORK_ORDER_TITLE)
    expect(resolveWorkOrderTitle(' - ', values)).toBe('-')
  })

  it('takes a fallback of its own when asked', () => {
    expect(resolveWorkOrderTitle('{vin}', {}, 'Parts Sale')).toBe('Parts Sale')
  })

  it('keeps a template with no tags as it is', () => {
    expect(resolveWorkOrderTitle('Service visit', values)).toBe('Service visit')
  })

  it('collapses runs of whitespace', () => {
    expect(resolveWorkOrderTitle('  {order_number}    {license_plate}  ', values)).toBe(
      '2026-1042 AB 12345'
    )
  })

  it('never exceeds what the title field holds', () => {
    const long = { ...values, customer_name: 'x'.repeat(300) }
    const title = resolveWorkOrderTitle('{order_number} - {customer_name}', long)
    expect(title.length).toBe(MAX_WORK_ORDER_TITLE_LENGTH)
    expect(title.startsWith('2026-1042 - x')).toBe(true)
  })

  it('handles a number where a string was expected', () => {
    expect(resolveWorkOrderTitle('{year} {make}', { year: 2019, make: 'Volvo' })).toBe(
      '2019 Volvo'
    )
  })

  it('leaves an unclosed brace alone as text', () => {
    expect(resolveWorkOrderTitle('{order_number - {license_plate}', values)).toBe(
      '{order_number - AB 12345'
    )
  })
})

describe('tokensIn and unknownTokensIn', () => {
  it('lists every tag with the token it resolves to', () => {
    expect(tokensIn('{order_number} {plate} {nope}')).toEqual([
      { tag: 'order_number', token: 'order_number' },
      { tag: 'plate', token: 'license_plate' },
      { tag: 'nope', token: null },
    ])
  })

  it('names the unknown ones once each, in braces, for the settings page', () => {
    expect(unknownTokensIn('{order_number} {nope} {Nope} {other}')).toEqual([
      '{nope}',
      '{Nope}',
      '{other}',
    ])
    expect(unknownTokensIn(DEFAULT_WORK_ORDER_TITLE_TEMPLATE)).toEqual([])
  })
})

describe('workOrderTitleValues', () => {
  it('builds the vehicle name from year, make and model', () => {
    const built = workOrderTitleValues({
      orderNumber: '2026-7',
      vehicle: { licensePlate: 'ZZ 1', make: 'Ford', model: 'Transit', year: 2018, vin: null },
      customerName: 'Acme',
      technicianName: 'Sam',
      date: '2026-09-11',
    })
    expect(built).toEqual({
      order_number: '2026-7',
      license_plate: 'ZZ 1',
      customer_name: 'Acme',
      vehicle: '2018 Ford Transit',
      make: 'Ford',
      model: 'Transit',
      year: 2018,
      vin: null,
      technician: 'Sam',
      date: '2026-09-11',
    })
  })

  it('leaves out a year of zero, which is how an unknown year is stored', () => {
    const built = workOrderTitleValues({
      vehicle: { make: 'Ford', model: 'Transit', year: 0 },
    })
    expect(built.year).toBeNull()
    expect(built.vehicle).toBe('Ford Transit')
  })

  it('has nothing to say about a car for a counter sale', () => {
    const built = workOrderTitleValues({ orderNumber: '2026-8', customerName: 'Walk-in' })
    expect(built.vehicle).toBeNull()
    expect(built.license_plate).toBeNull()
    expect(resolveWorkOrderTitle(DEFAULT_WORK_ORDER_TITLE_TEMPLATE, built)).toBe('2026-8')
  })
})

describe('workOrderTitleTemplateFrom', () => {
  const KEY = 'workshop.workOrderTitleTemplate'

  it('is the default when the workshop has never set one', () => {
    expect(workOrderTitleTemplateFrom({}, KEY)).toBe(DEFAULT_WORK_ORDER_TITLE_TEMPLATE)
  })

  it('is empty when the workshop saved it empty, which means the plain name', () => {
    expect(workOrderTitleTemplateFrom({ [KEY]: '' }, KEY)).toBe('')
    expect(resolveWorkOrderTitle(workOrderTitleTemplateFrom({ [KEY]: '' }, KEY), values)).toBe(
      FALLBACK_WORK_ORDER_TITLE
    )
  })

  it('is what the workshop saved, cut to the allowed length', () => {
    expect(workOrderTitleTemplateFrom({ [KEY]: '{plate}' }, KEY)).toBe('{plate}')
    expect(workOrderTitleTemplateFrom({ [KEY]: 'x'.repeat(500) }, KEY).length).toBe(
      MAX_WORK_ORDER_TITLE_TEMPLATE_LENGTH
    )
  })
})

describe('the settings page preview', () => {
  it('has a sample value for every token', () => {
    for (const token of WORK_ORDER_TITLE_TOKENS) {
      expect(SAMPLE_WORK_ORDER_TITLE_VALUES[token], token).toBeTruthy()
    }
  })
})
