import { describe, expect, it } from 'vitest'
import { defectLineText, defectsWorstFirst } from '@/features/inspections/Lib/conversion'

const item = (name: string, condition: string, sortOrder: number) => ({
  name,
  condition,
  sortOrder,
})

describe('what an inspection turns into', () => {
  it('takes every check that was not OK, dangerous first, then major, then minor', () => {
    const items = [
      item('Wipers', 'attention', 1),
      item('Lights', 'pass', 2),
      item('Brake hose', 'dangerous', 3),
      item('Tyres', 'fail', 4),
      item('Horn', 'not_inspected', 5),
      item('Mirror', 'attention', 0),
    ]
    expect(defectsWorstFirst(items).map((i) => i.name)).toEqual([
      'Brake hose',
      'Tyres',
      'Mirror',
      'Wipers',
    ])
  })

  it('takes nothing from a car that passed', () => {
    expect(defectsWorstFirst([item('Lights', 'pass', 0)])).toEqual([])
  })

  it('writes a line as the check, its code and the note, without a dash', () => {
    expect(defectLineText({ code: '1.1.13', name: 'Brake linings', notes: ' Worn to 2 mm ' })).toBe(
      '1.1.13 Brake linings: Worn to 2 mm'
    )
    expect(defectLineText({ name: 'Wipers', notes: null })).toBe('Wipers')
  })
})
