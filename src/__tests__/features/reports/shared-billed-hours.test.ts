/**
 * Whose billed hours a shared job's labor is.
 *
 * The efficiency report divides what a person billed by what they clocked.
 * With two people on one job, giving every billed hour to the technician
 * makes them look faster than they are and the helper look idle. The hours
 * are shared by clocked time instead, but only when that can be done
 * honestly, which needs everybody on the job to have clocked on it.
 */

import { describe, expect, it } from 'vitest'
import { shareBilledHours } from '@/features/reports/Lib/sharedBilledHours'

const clocked = (entries: Record<string, number>) => new Map(Object.entries(entries))
const round = (shares: Map<string, number>) =>
  Object.fromEntries([...shares].map(([id, hours]) => [id, Math.round(hours * 100) / 100]))

describe('billed hours on a job', () => {
  it('are all the technician’s when nobody is helping', () => {
    const shares = shareBilledHours({
      hours: 5,
      technicianId: 'andy',
      helperIds: [],
      clockedMinutes: clocked({ andy: 180 }),
    })

    expect(round(shares)).toEqual({ andy: 5 })
  })

  it('are shared by the time each person clocked on it', () => {
    const shares = shareBilledHours({
      hours: 6,
      technicianId: 'andy',
      helperIds: ['sam'],
      clockedMinutes: clocked({ andy: 240, sam: 120 }),
    })

    expect(round(shares)).toEqual({ andy: 4, sam: 2 })
  })

  it('add up to what was billed, however many are on it', () => {
    const shares = shareBilledHours({
      hours: 7.5,
      technicianId: 'andy',
      helperIds: ['sam', 'jo'],
      clockedMinutes: clocked({ andy: 100, sam: 70, jo: 45 }),
    })

    const total = [...shares.values()].reduce((sum, hours) => sum + hours, 0)
    expect(total).toBeCloseTo(7.5, 10)
  })

  it('stay with the technician when a helper did not clock', () => {
    // Sam has no phone on the shop floor. Guessing his share would move
    // hours off Andy for no reason anybody could check.
    const shares = shareBilledHours({
      hours: 5,
      technicianId: 'andy',
      helperIds: ['sam'],
      clockedMinutes: clocked({ andy: 180 }),
    })

    expect(round(shares)).toEqual({ andy: 5 })
  })

  it('stay with the technician when only the helper clocked', () => {
    // An owner who never uses the clock keeps the hours on their own jobs,
    // as they did before the job could be shared.
    const shares = shareBilledHours({
      hours: 5,
      technicianId: 'andy',
      helperIds: ['sam'],
      clockedMinutes: clocked({ sam: 180 }),
    })

    expect(round(shares)).toEqual({ andy: 5 })
  })

  it('stay with the technician when nobody clocked at all', () => {
    const shares = shareBilledHours({
      hours: 5,
      technicianId: 'andy',
      helperIds: ['sam'],
      clockedMinutes: clocked({}),
    })

    expect(round(shares)).toEqual({ andy: 5 })
  })

  it('ignore time clocked by somebody who is not on the job', () => {
    const shares = shareBilledHours({
      hours: 4,
      technicianId: 'andy',
      helperIds: ['sam'],
      clockedMinutes: clocked({ andy: 60, sam: 60, jo: 600 }),
    })

    expect(round(shares)).toEqual({ andy: 2, sam: 2 })
  })
})
