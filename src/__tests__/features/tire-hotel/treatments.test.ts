import { describe, it, expect } from 'vitest'
import {
  applicableTreatments,
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
