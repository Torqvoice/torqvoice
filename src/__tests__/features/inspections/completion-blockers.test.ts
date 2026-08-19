import { describe, it, expect } from 'vitest'
import {
  describeBlocker,
  findCompletionBlockers,
  summariseBlockers,
  type CompletionCandidate,
} from '@/features/inspections/Lib/completion'

const check = (over: Partial<CompletionCandidate> = {}): CompletionCandidate => ({
  id: 'i1',
  name: 'Brake linings and pads',
  code: '1.1.13',
  condition: 'pass',
  required: false,
  photoRequired: false,
  photoCount: 0,
  ...over,
})

describe('completion blockers', () => {
  it('passes a plain inspection with nothing mandatory', () => {
    expect(findCompletionBlockers([check(), check({ id: 'i2', condition: 'fail' })])).toEqual([])
  })

  it('blocks a defect on a check that requires a photo', () => {
    const blockers = findCompletionBlockers([
      check({ photoRequired: true, condition: 'fail', photoCount: 0 }),
    ])
    expect(blockers).toHaveLength(1)
    expect(blockers[0].reason).toBe('missing-photo')
    expect(blockers[0].label).toBe('1.1.13 Brake linings and pads')
  })

  it('releases the block once a photo is attached', () => {
    expect(
      findCompletionBlockers([check({ photoRequired: true, condition: 'fail', photoCount: 1 })])
    ).toEqual([])
  })

  it('blocks every defect grade, not only major', () => {
    for (const condition of ['attention', 'fail', 'dangerous']) {
      const blockers = findCompletionBlockers([check({ photoRequired: true, condition })])
      expect(blockers, condition).toHaveLength(1)
    }
  })

  it('does not demand a photo of a check that passed', () => {
    // The requirement is evidence of a defect, not a photo of every check.
    expect(findCompletionBlockers([check({ photoRequired: true, condition: 'pass' })])).toEqual([])
    expect(
      findCompletionBlockers([check({ photoRequired: true, condition: 'not_inspected' })])
    ).toEqual([])
  })

  it('blocks a mandatory check that was never graded', () => {
    const blockers = findCompletionBlockers([check({ required: true, condition: 'not_inspected' })])
    expect(blockers[0].reason).toBe('missing-grade')
  })

  it('reports a mandatory ungraded check once, not twice', () => {
    // It is both ungraded and photo-less; the grade is the thing to fix first.
    const blockers = findCompletionBlockers([
      check({ required: true, photoRequired: true, condition: 'not_inspected' }),
    ])
    expect(blockers).toHaveLength(1)
    expect(blockers[0].reason).toBe('missing-grade')
  })

  it('falls back to the name when a check has no reference', () => {
    const blockers = findCompletionBlockers([
      check({ code: null, required: true, condition: 'not_inspected' }),
    ])
    expect(blockers[0].label).toBe('Brake linings and pads')
  })

  it('names the first few and counts the rest', () => {
    const many = Array.from({ length: 5 }, (_, i) =>
      check({
        id: `i${i}`,
        name: `Check ${i}`,
        code: null,
        required: true,
        condition: 'not_inspected',
      })
    )
    const summary = summariseBlockers(findCompletionBlockers(many))
    expect(summary).toContain('5 checks still outstanding')
    expect(summary).toContain('Check 0 (must be graded)')
    expect(summary).toContain('and 2 more')
  })

  it('describes each reason in words a technician can act on', () => {
    expect(describeBlocker('missing-grade')).toBe('must be graded')
    expect(describeBlocker('missing-photo')).toBe('needs a photo of the defect')
  })
})
