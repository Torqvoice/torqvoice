import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useServiceLabels } from '@/features/vehicles/Lib/useServiceLabels'

/**
 * Lists of work orders print a status and a type on every row. They printed
 * the stored value, "in-progress" and "maintenance", in English whatever the
 * language, beside a work order that said "In Progress".
 */
describe('work order status and type in lists', () => {
  const labels = () => renderHook(() => useServiceLabels()).result.current

  it('says each stored status the way the work order itself does', () => {
    const { status } = labels()
    expect(
      ['pending', 'scheduled', 'in-progress', 'in_progress', 'waiting-parts', 'completed'].map(
        status
      )
    ).toEqual(['Pending', 'Scheduled', 'In Progress', 'In Progress', 'Waiting Parts', 'Completed'])
  })

  it('names the kinds of work', () => {
    const { type } = labels()
    expect(['maintenance', 'repair', 'upgrade', 'inspection'].map(type)).toEqual([
      'Maintenance',
      'Repair',
      'Upgrade',
      'Inspection',
    ])
  })

  it('prints a value it has no label for as it is stored', () => {
    const { status, type } = labels()
    expect(status('on-hold')).toBe('on-hold')
    expect(type('detailing')).toBe('detailing')
  })
})
