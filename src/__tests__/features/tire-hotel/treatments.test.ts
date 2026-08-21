import { describe, it, expect } from 'vitest'
import {
  applicableTreatments,
  billableTreatments,
  parseTreatmentPrices,
  serializeTreatmentPrices,
  defaultTreatments,
  pendingTreatments,
  treatmentProgress,
  TREATMENT_TYPES,
} from '@/features/tire-hotel/Lib/treatments'

describe('which treatments apply', () => {
  it('hides rim work on a set with no rims', () => {
    const types = applicableTreatments({ withRims: false, hasTpms: false })
    expect(types).not.toContain('wash_rims')
  })

  it('offers rim work once rims are present', () => {
    const types = applicableTreatments({ withRims: true, hasTpms: false })
    expect(types).toContain('wash_rims')
  })

  it('hides TPMS service on a set without sensors', () => {
    expect(applicableTreatments({ withRims: true, hasTpms: false })).not.toContain('tpms_service')
    expect(applicableTreatments({ withRims: true, hasTpms: true })).toContain('tpms_service')
  })

  it('always offers the work that applies to any set', () => {
    const types = applicableTreatments({ withRims: false, hasTpms: false })
    expect(types).toEqual(expect.arrayContaining(['wash_tires', 'balance', 'new_valves', 'repair']))
  })
})

describe('defaults at check-in', () => {
  it('washes the tires', () => {
    expect(defaultTreatments({ withRims: false })).toEqual(['wash_tires'])
  })

  it('also washes the rims when the set has them', () => {
    expect(defaultTreatments({ withRims: true })).toEqual(['wash_tires', 'wash_rims'])
  })
})

describe('outstanding work', () => {
  const rows = [
    { type: 'repair', status: 'pending' },
    { type: 'wash_tires', status: 'done' },
    { type: 'balance', status: 'pending' },
    { type: 'new_valves', status: 'skipped' },
  ]

  it('lists only what is still pending', () => {
    expect(pendingTreatments(rows).map((r) => r.type)).toEqual(['balance', 'repair'])
  })

  it('orders it the way the list is declared, not the way it was stored', () => {
    const order = TREATMENT_TYPES.indexOf('balance') < TREATMENT_TYPES.indexOf('repair')
    expect(order).toBe(true)
  })

  it('counts skipped work as settled rather than outstanding', () => {
    const progress = treatmentProgress(rows)
    expect(progress.total).toBe(4)
    expect(progress.done).toBe(1)
    expect(progress.pending).toBe(2)
    expect(progress.complete).toBe(false)
  })

  it('is complete once nothing is pending, even with something skipped', () => {
    const progress = treatmentProgress([
      { type: 'wash_tires', status: 'done' },
      { type: 'balance', status: 'skipped' },
    ])
    expect(progress.complete).toBe(true)
  })

  it('is not complete when there was never anything to do', () => {
    // An empty list means nobody asked for work, which is different from
    // work that has been finished.
    expect(treatmentProgress([]).complete).toBe(false)
  })
})

describe('treatment prices', () => {
  it('reads back what it wrote', () => {
    const prices = { wash_tires: 200, balance: 350 }
    expect(parseTreatmentPrices(serializeTreatmentPrices(prices))).toEqual(prices)
  })

  it('drops zero and negative prices on the way in and out', () => {
    // A zero price means "not charged", which is the absence of an entry.
    expect(parseTreatmentPrices('{"wash_tires":0,"balance":-5}')).toEqual({})
    expect(serializeTreatmentPrices({ wash_tires: 0 })).toBe('{}')
  })

  it('ignores keys that are not treatments', () => {
    expect(parseTreatmentPrices('{"wash_tires":100,"coffee":50}')).toEqual({ wash_tires: 100 })
  })

  it('survives a value that is not JSON', () => {
    // Hand-edited or from an older shape. It should mean "nothing prefilled",
    // not "the job cannot be raised".
    expect(parseTreatmentPrices('not json')).toEqual({})
    expect(parseTreatmentPrices('[1,2,3]')).toEqual({})
    expect(parseTreatmentPrices(null)).toEqual({})
  })
})

describe('what reaches the bill', () => {
  const prices = { wash_tires: 200, wash_rims: 150, balance: 350 }

  it('bills work that is still to do', () => {
    const lines = billableTreatments([{ type: 'wash_tires', status: 'pending' }], prices)
    expect(lines).toEqual([{ type: 'wash_tires', price: 200 }])
  })

  it('still bills work already finished', () => {
    // It happened, so the customer is paying for it. Ticking it off before
    // raising the job must not lose the charge.
    const lines = billableTreatments([{ type: 'wash_tires', status: 'done' }], prices)
    expect(lines).toHaveLength(1)
  })

  it('does not bill work that was skipped', () => {
    // Someone looked at it and decided against doing it.
    expect(billableTreatments([{ type: 'wash_tires', status: 'skipped' }], prices)).toEqual([])
  })

  it('leaves out anything with no price set', () => {
    // How a shop that folds washing into the storage fee keeps it off the
    // invoice, rather than deleting a zero line every time.
    const lines = billableTreatments(
      [
        { type: 'wash_tires', status: 'pending' },
        { type: 'new_valves', status: 'pending' },
      ],
      prices
    )
    expect(lines.map((l) => l.type)).toEqual(['wash_tires'])
  })

  it('orders lines the way the treatment list is declared', () => {
    const lines = billableTreatments(
      [
        { type: 'balance', status: 'pending' },
        { type: 'wash_rims', status: 'pending' },
        { type: 'wash_tires', status: 'pending' },
      ],
      prices
    )
    expect(lines.map((l) => l.type)).toEqual(['wash_tires', 'wash_rims', 'balance'])
  })

  it('bills nothing when no prices are configured at all', () => {
    expect(billableTreatments([{ type: 'wash_tires', status: 'pending' }], {})).toEqual([])
  })
})
