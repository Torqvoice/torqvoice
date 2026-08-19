import { describe, it, expect } from 'vitest'
import {
  addMonths,
  duePeriods,
  extrasTotal,
  monthsBetween,
  parseExtras,
  periodAmount,
  periodFor,
  nextPeriod,
  round2,
} from '@/features/tire-hotel/Lib/billing'

const d = (iso: string) => new Date(`${iso}T12:00:00`)

describe('extras', () => {
  it('ignores anything that is not a priced label', () => {
    const extras = parseExtras([
      { label: 'Wash', price: 100 },
      { label: '   ', price: 50 },
      { label: 'Balance' },
      null,
      'nonsense',
      { label: 'Valves', price: '80' },
    ])
    expect(extras).toEqual([
      { label: 'Wash', price: 100 },
      { label: 'Valves', price: 80 },
    ])
  })

  it('treats a non-array column as empty rather than throwing', () => {
    expect(parseExtras(null)).toEqual([])
    expect(parseExtras({ label: 'Wash', price: 10 })).toEqual([])
  })

  it('adds extras onto the base price', () => {
    const extras = parseExtras([{ label: 'Wash', price: 199.5 }])
    expect(extrasTotal(extras)).toBe(199.5)
    expect(periodAmount(1200, extras)).toBe(1399.5)
  })

  it('rounds to whole cents so float noise never reaches an invoice', () => {
    expect(round2(0.1 + 0.2)).toBe(0.3)
    expect(periodAmount(0.1, [{ label: 'x', price: 0.2 }])).toBe(0.3)
  })
})

describe('period arithmetic', () => {
  it('keeps the day of month when the target month has it', () => {
    expect(addMonths(d('2026-01-15'), 6)).toEqual(d('2026-07-15'))
  })

  it('clamps to the last day rather than rolling into the next month', () => {
    // A set stored on the 31st must not drift a day forward every short
    // month, or a year of billing walks off the calendar.
    const result = addMonths(d('2026-01-31'), 1)
    expect(result.getMonth()).toBe(1)
    expect(result.getDate()).toBe(28)
  })

  it('counts whole months only', () => {
    expect(monthsBetween(d('2026-01-15'), d('2026-07-14'))).toBe(5)
    expect(monthsBetween(d('2026-01-15'), d('2026-07-15'))).toBe(6)
  })

  it('places a date in its seasonal period', () => {
    const period = periodFor('seasonal', d('2026-01-15'), d('2026-03-01'))
    expect(period.periodStart).toEqual(d('2026-01-15'))
    expect(period.periodEnd).toEqual(d('2026-07-15'))
  })

  it('rolls to the next season once six months pass', () => {
    const period = periodFor('seasonal', d('2026-01-15'), d('2026-08-01'))
    expect(period.periodStart).toEqual(d('2026-07-15'))
  })

  it('steps a month at a time on monthly billing', () => {
    expect(nextPeriod('monthly', d('2026-01-15')).periodStart).toEqual(d('2026-02-15'))
  })
})

describe('which periods are due', () => {
  const agreement = {
    billingModel: 'seasonal',
    startDate: d('2026-01-15'),
    endDate: null,
    status: 'active',
  }

  it('bills the first period once the agreement has started', () => {
    const due = duePeriods(agreement, [], d('2026-02-01'))
    expect(due).toHaveLength(1)
    expect(due[0].periodStart).toEqual(d('2026-01-15'))
  })

  it('bills nothing before the start date', () => {
    expect(duePeriods(agreement, [], d('2026-01-01'))).toEqual([])
  })

  it('catches up every period after a long gap', () => {
    const due = duePeriods(agreement, [], d('2027-02-01'))
    expect(due.map((p) => p.periodStart)).toEqual([
      d('2026-01-15'),
      d('2026-07-15'),
      d('2027-01-15'),
    ])
  })

  it('never bills a period twice, however often it runs', () => {
    // The guarantee that makes the sweep safe to re-run.
    const first = duePeriods(agreement, [], d('2026-08-01'))
    const billed = first.map((p) => p.periodStart)
    expect(duePeriods(agreement, billed, d('2026-08-01'))).toEqual([])
  })

  it('skips a period that is already recorded, even out of order', () => {
    const due = duePeriods(agreement, [d('2026-07-15')], d('2026-08-01'))
    expect(due.map((p) => p.periodStart)).toEqual([d('2026-01-15')])
  })

  it('stops at the agreement end date', () => {
    const ending = { ...agreement, endDate: d('2026-07-01') }
    const due = duePeriods(ending, [], d('2027-01-01'))
    expect(due.map((p) => p.periodStart)).toEqual([d('2026-01-15')])
  })

  it('bills nothing once the agreement is no longer active', () => {
    expect(duePeriods({ ...agreement, status: 'ended' }, [], d('2027-01-01'))).toEqual([])
  })

  it('bills monthly agreements every month', () => {
    const monthly = { ...agreement, billingModel: 'monthly' }
    const due = duePeriods(monthly, [], d('2026-04-20'))
    expect(due.map((p) => p.periodStart)).toEqual([
      d('2026-01-15'),
      d('2026-02-15'),
      d('2026-03-15'),
      d('2026-04-15'),
    ])
  })
})
