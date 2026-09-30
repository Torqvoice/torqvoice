/**
 * The rules behind a concern's four steps: what is written on a save, who
 * gets the credit for confirming, and how the editor keeps hold of a concern
 * across the save that gives it an id.
 */

import { describe, expect, it } from 'vitest'
import {
  concernHasStory,
  concernSteps,
  concernStoryData,
  reconcileConcernRows,
  type ConcernRowLike,
} from '@/features/vehicles/Lib/concernStory'
import { findServiceFormProblem } from '@/features/vehicles/Lib/validateServiceForm'

const NOW = new Date('2026-09-21T12:10:00Z')

describe('concernStoryData', () => {
  it('stamps who confirmed and when, the first time the tick arrives', () => {
    expect(concernStoryData({ confirmed: true }, null, 'user-1', NOW)).toEqual({
      confirmedAt: NOW,
      confirmedById: 'user-1',
    })
  })

  it('keeps the first stamp when somebody else saves the job later', () => {
    const existing = { confirmedAt: new Date('2026-09-20T09:00:00Z'), confirmedById: 'user-1' }
    expect(concernStoryData({ confirmed: true }, existing, 'user-2', NOW)).toEqual({})
  })

  it('clears the stamp when the tick is taken away', () => {
    const existing = { confirmedAt: new Date('2026-09-20T09:00:00Z'), confirmedById: 'user-1' }
    expect(concernStoryData({ confirmed: false }, existing, 'user-2', NOW)).toEqual({
      confirmedAt: null,
      confirmedById: null,
    })
  })

  it('leaves the confirmation alone for a client that does not send it', () => {
    expect(concernStoryData({ cause: 'Coil cracked' }, null, 'user-1', NOW)).toEqual({
      cause: 'Coil cracked',
    })
  })

  it('stores an emptied field as nothing rather than as spaces', () => {
    expect(
      concernStoryData({ cause: '  ', correction: '', confirmation: null }, null, 'u', NOW)
    ).toEqual({ cause: null, correction: null, confirmation: null })
  })
})

describe('concernSteps', () => {
  it('says which of the four steps are done', () => {
    expect(
      concernSteps({ description: 'Engine light on', cause: 'P0303', correction: ' ' })
    ).toEqual({ condition: true, cause: true, correction: false, confirm: false })
  })
})

describe('a story with no condition', () => {
  it('is refused rather than dropped with its text', () => {
    expect(concernHasStory({ correction: 'Replaced coil' })).toBe(true)
    expect(
      findServiceFormProblem({
        title: 'Job',
        partItems: [],
        laborItems: [],
        concerns: [{ description: ' ', correction: 'Replaced coil' }],
      })
    ).toBe('concernCondition')
  })

  it('lets an untouched blank row through, as the editor always keeps one ready', () => {
    expect(
      findServiceFormProblem({
        title: 'Job',
        partItems: [],
        laborItems: [],
        concerns: [{ description: '' }],
      })
    ).toBeNull()
  })
})

describe('reconcileConcernRows', () => {
  const server: ConcernRowLike[] = [
    {
      id: 'c1',
      description: 'Pulls right when braking',
      sortOrder: 0,
      confirmed: true,
      confirmedAt: '2026-09-21T12:10:00.000Z',
      confirmedByName: 'Jonas Berg',
    },
  ]

  it('takes the saved rows as they are when nothing is unsaved', () => {
    const typed: ConcernRowLike[] = [{ description: 'Pulls right when braking', sortOrder: 0 }]
    expect(reconcileConcernRows(typed, server, false)).toBe(server)
  })

  it('gives a row typed this session the id it was saved under, keeping later edits', () => {
    const typed: ConcernRowLike[] = [
      { description: 'Pulls right when braking', sortOrder: 0, cause: 'typed since the save' },
    ]
    const [row] = reconcileConcernRows(typed, server, true)
    expect(row.id).toBe('c1')
    expect(row.cause).toBe('typed since the save')
    expect(row.confirmedByName).toBe('Jonas Berg')
  })

  it('does not hand one saved id to two rows that say the same thing', () => {
    const typed: ConcernRowLike[] = [
      { description: 'Pulls right when braking', sortOrder: 0 },
      { description: 'Pulls right when braking', sortOrder: 1 },
    ]
    const rows = reconcileConcernRows(typed, server, true)
    expect(rows.map((r) => r.id)).toEqual(['c1', undefined])
  })
})
