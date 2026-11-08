import { describe, expect, it } from 'vitest'
import { portalConditionCounts } from '@/features/portal/Lib/inspectionSummary'

/**
 * The portal sums up an inspection in plain words: "12 good, 2 fair, 1 poor".
 * Items are stored on the grading scale, and the portal used to count them
 * under the words themselves, so a customer saw no summary at all.
 */
describe('the inspection summary in the customer portal', () => {
  it('counts the stored grades under the words the customer reads', () => {
    const items = [
      ...Array.from({ length: 12 }, () => ({ condition: 'pass' })),
      { condition: 'attention' },
      { condition: 'attention' },
      { condition: 'fail' },
      { condition: 'dangerous' },
    ]
    expect(portalConditionCounts(items)).toEqual({ good: 12, fair: 2, poor: 2 })
  })

  it('leaves out checks that were not done or do not apply', () => {
    expect(
      portalConditionCounts([
        { condition: 'not_inspected' },
        { condition: 'not_applicable' },
        { condition: 'pass' },
      ])
    ).toEqual({ good: 1, fair: 0, poor: 0 })
  })
})
