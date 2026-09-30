/**
 * Which live changes a page answers, and which it treats as its own echo.
 *
 * The page that made a change has already shown the result, so it must not
 * re-read on hearing about it. That rule once swallowed a real change: the
 * technician app finishing a job, signed in as the same person who had the
 * work order open at the desk. The check read the user, the phone holds no
 * presence in the room, and the desk sat on the old status until a reload.
 * These pin what counts as an echo, so that does not come back.
 */

import { describe, expect, it } from 'vitest'
import { isOwnEcho } from '@/features/realtime/hooks'
import type { PresenceUser, RecordChange } from '@/lib/realtime/events'

const me = { userId: 'u-1', name: 'Christian', color: '#000' }

const change = (by: RecordChange['by']): RecordChange => ({
  kind: 'serviceRecord',
  id: 'rec-1',
  organizationId: 'org-1',
  action: 'updated',
  by,
  at: Date.now(),
})

const here = (devices: number): PresenceUser[] => [
  { userId: 'u-1', name: 'Christian', color: '#000', devices },
]

describe('isOwnEcho', () => {
  it('answers a change the technician app made, whoever is signed in on the phone', () => {
    expect(isOwnEcho(change({ userId: 'u-1', name: null, source: 'app' }), me, here(1))).toBe(false)
  })

  it('answers a change the system made', () => {
    expect(isOwnEcho(change({ userId: null, name: null, source: 'system' }), me, [])).toBe(false)
  })

  it('answers a colleague on the web', () => {
    expect(isOwnEcho(change({ userId: 'u-2', name: 'Ellen', source: 'web' }), me, here(1))).toBe(
      false
    )
  })

  it('ignores its own web save when this is the only page open', () => {
    expect(isOwnEcho(change({ userId: 'u-1', name: null, source: 'web' }), me, here(1))).toBe(true)
    expect(isOwnEcho(change({ userId: 'u-1', name: null, source: 'web' }), me, undefined)).toBe(
      true
    )
  })

  it('answers its own web save when the same person also has the record open elsewhere', () => {
    expect(isOwnEcho(change({ userId: 'u-1', name: null, source: 'web' }), me, here(2))).toBe(false)
  })

  it('answers everything when nobody is signed in to the socket', () => {
    expect(isOwnEcho(change({ userId: 'u-1', name: null, source: 'web' }), null, here(1))).toBe(
      false
    )
  })
})
