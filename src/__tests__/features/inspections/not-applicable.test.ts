/**
 * "Not applicable" is a grade, "not inspected" is the absence of one. A check
 * the vehicle has no part for counts as done and never as a defect; a check
 * nobody has touched counts as outstanding.
 */
import { describe, expect, it } from 'vitest'
import {
  CONDITIONS,
  SCALE_STEPS,
  countConditions,
  deriveTestResult,
  isDefect,
  worstCondition,
} from '@/features/inspections/Lib/conditions'
import { findCompletionBlockers } from '@/features/inspections/Lib/completion'
import { updateInspectionItemSchema } from '@/features/inspections/Schema/inspectionSchema'

describe('a check graded not applicable', () => {
  it('is a grade the row can save, but never a step the scales offer by default', () => {
    expect(CONDITIONS).toContain('not_applicable')
    expect(updateInspectionItemSchema.parse({ condition: 'not_applicable' }).condition).toBe(
      'not_applicable'
    )
    expect(SCALE_STEPS.eu).not.toContain('not_applicable')
    expect(SCALE_STEPS.basic).not.toContain('not_applicable')
  })

  it('counts as inspected and never as a defect', () => {
    const counts = countConditions([
      { condition: 'pass' },
      { condition: 'not_applicable' },
      { condition: 'not_inspected' },
    ])
    expect(counts).toMatchObject({
      total: 3,
      inspected: 2,
      pass: 1,
      notApplicable: 1,
      notInspected: 1,
    })
    expect(isDefect('not_applicable')).toBe(false)
  })

  it('leaves the result to the graded checks', () => {
    expect(
      deriveTestResult([{ condition: 'pass' }, { condition: 'not_applicable' }], {
        requireAllInspected: true,
      })
    ).toBe('pass')
    expect(deriveTestResult([{ condition: 'attention' }, { condition: 'not_applicable' }])).toBe(
      'pass_minor'
    )
  })

  it('does not block completion of a required check, unlike one nobody graded', () => {
    const blockers = findCompletionBlockers([
      { id: 'a', name: 'Tow bar', condition: 'not_applicable', required: true, photoCount: 0 },
      { id: 'b', name: 'Horn', condition: 'not_inspected', required: true, photoCount: 0 },
    ])
    expect(blockers.map((b) => b.id)).toEqual(['b'])
  })

  it('rolls a section up as not applicable only when nothing in it was graded otherwise', () => {
    expect(worstCondition(['not_applicable', 'not_inspected'])).toBe('not_applicable')
    expect(worstCondition(['not_applicable', 'pass'])).toBe('pass')
    expect(worstCondition(['not_applicable', 'fail'])).toBe('fail')
  })
})
