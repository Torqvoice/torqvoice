/**
 * Tests for tread grading against the workshop's own limits.
 *
 * The failure this guards against is quiet: the grader takes the thresholds
 * as an optional argument and falls back to built-in figures. A caller that
 * forgets to pass them still compiles, still runs, and still grades, just
 * against somebody else's rules. A shop with a 3 mm winter limit sees 3.5 mm
 * called Replace and has no way to tell why.
 */

import { describe, it, expect } from 'vitest'
import {
  gradeTread,
  shownCondition,
  DEFAULT_TREAD_THRESHOLDS_MM,
} from '@/features/tire-hotel/Lib/tireConstants'

const SHOP = { summerReplace: 3, winterReplace: 3, warnMargin: 1 }

describe('grading against the workshop limits', () => {
  it('does not condemn a winter tire above the shop limit', () => {
    // The reported bug: 3.5 mm on a 3 mm limit.
    expect(gradeTread(3.5, 'winter', SHOP)).toBe('fair')
  })

  it('condemns one below it', () => {
    expect(gradeTread(2.9, 'winter', SHOP)).toBe('replace')
  })

  it('treats the limit itself as still legal', () => {
    // At the limit, not under it. A tire is replaced when it goes below.
    expect(gradeTread(3, 'winter', SHOP)).toBe('fair')
  })

  it('calls it good once it clears the warning margin', () => {
    expect(gradeTread(4, 'winter', SHOP)).toBe('good')
  })

  it('grades summer against the summer limit', () => {
    const shop = { summerReplace: 1.6, winterReplace: 4, warnMargin: 1 }
    expect(gradeTread(2, 'summer', shop)).toBe('fair')
    expect(gradeTread(2, 'winter', shop)).toBe('replace')
  })

  it('says nothing about a tire nobody measured', () => {
    expect(gradeTread(null, 'winter', SHOP)).toBeNull()
  })
})

describe('the built-in fallback', () => {
  it('is stricter on winter than a shop setting 3 mm', () => {
    // Precisely why a caller that forgets to pass the shop's limits produces
    // the wrong grade rather than an error.
    expect(DEFAULT_TREAD_THRESHOLDS_MM.winterReplace).toBeGreaterThan(SHOP.winterReplace)
    expect(gradeTread(3.5, 'winter')).toBe('replace')
    expect(gradeTread(3.5, 'winter', SHOP)).toBe('fair')
  })
})

describe('the grade shown beside a reading', () => {
  it('comes from the depth, not from what was stored', () => {
    // The reported bug in its second form: the reading was graded and saved
    // when the limits were different, and every screen printed that stale
    // word beside a number that disagreed with it.
    const stale = { treadDepthMm: 3.5, condition: 'replace' }
    expect(shownCondition(stale, 'winter', SHOP)).toBe('fair')
  })

  it('regrades the whole history when a shop changes its limit', () => {
    const reading = { treadDepthMm: 3.5, condition: 'good' }
    expect(shownCondition(reading, 'winter', { ...SHOP, winterReplace: 4 })).toBe('replace')
    expect(shownCondition(reading, 'winter', { ...SHOP, winterReplace: 3 })).toBe('fair')
  })

  it('keeps the stored word when there is no depth to judge', () => {
    // Graded by eye, e.g. a sidewall somebody condemned without a gauge.
    const byEye = { treadDepthMm: null, condition: 'replace' }
    expect(shownCondition(byEye, 'winter', SHOP)).toBe('replace')
  })
})
