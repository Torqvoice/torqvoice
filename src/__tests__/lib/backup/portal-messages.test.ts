import { describe, expect, it } from 'vitest'
import {
  keepsCurrentPortalMessages,
  portalMessageAuthorIds,
  portalMessageRowsToRestore,
} from '@/lib/backup/portal-messages'

describe('the portal chat through a restore', () => {
  it('holds on to the conversations when the file replaces customers without carrying the chat', () => {
    expect(keepsCurrentPortalMessages({ customers: [] })).toBe(true)
  })

  it('takes the chat from the file when the file has it, even empty', () => {
    expect(keepsCurrentPortalMessages({ customers: [], portalMessages: [] })).toBe(false)
  })

  it('leaves the chat alone when the file does not touch customers', () => {
    expect(keepsCurrentPortalMessages({})).toBe(false)
  })

  it('puts back only messages whose customer is in the workshop after the restore', () => {
    const rows = portalMessageRowsToRestore(
      [
        { id: 'm1', customerId: 'c1', authorUserId: null },
        { id: 'm2', customerId: 'gone', authorUserId: null },
        { id: 'm3', authorUserId: null },
      ],
      new Set(['c1']),
      new Set()
    )
    expect(rows.map((r) => r.id)).toEqual(['m1'])
  })

  it('keeps an author who is a member of this workshop and drops one from another workshop', () => {
    const rows = portalMessageRowsToRestore(
      [
        { id: 'm1', customerId: 'c1', authorUserId: 'member' },
        { id: 'm2', customerId: 'c1', authorUserId: 'other-workshop-user' },
      ],
      new Set(['c1']),
      new Set(['member'])
    )
    expect(rows).toEqual([
      { id: 'm1', customerId: 'c1', authorUserId: 'member' },
      { id: 'm2', customerId: 'c1', authorUserId: null },
    ])
  })

  it('names each author once and skips messages the customer wrote', () => {
    expect(
      portalMessageAuthorIds([
        { authorUserId: 'u1' },
        { authorUserId: 'u1' },
        { authorUserId: null },
        { authorUserId: '' },
        { authorUserId: 'u2' },
      ])
    ).toEqual(['u1', 'u2'])
  })
})
