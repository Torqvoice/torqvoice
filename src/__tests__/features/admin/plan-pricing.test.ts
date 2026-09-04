/**
 * The admin overview card is labelled monthly revenue, but plan prices are
 * stored per billing interval and the plans sold today all bill yearly. Adding
 * those prices up untouched showed a year's income as a month's.
 */

import { describe, it, expect } from 'vitest'
import { monthlyPlanPrice } from '@/lib/plan-pricing'

describe('monthlyPlanPrice', () => {
  it('leaves a monthly price alone', () => {
    expect(monthlyPlanPrice(99, 'month')).toBe(99)
  })

  it('spreads a yearly price across twelve months', () => {
    expect(monthlyPlanPrice(140, 'year')).toBeCloseTo(11.67, 2)
  })

  it('treats a missing interval as monthly, matching the column default', () => {
    expect(monthlyPlanPrice(99, null)).toBe(99)
    expect(monthlyPlanPrice(99, undefined)).toBe(99)
  })

  it('ignores the casing an interval was written in', () => {
    expect(monthlyPlanPrice(120, 'YEAR')).toBe(10)
  })

  it('handles quarterly and weekly billing', () => {
    expect(monthlyPlanPrice(30, 'quarter')).toBe(10)
    expect(monthlyPlanPrice(12, 'week')).toBe(52)
  })

  it('returns zero for a price that is not a number', () => {
    expect(monthlyPlanPrice(Number.NaN, 'year')).toBe(0)
  })
})
