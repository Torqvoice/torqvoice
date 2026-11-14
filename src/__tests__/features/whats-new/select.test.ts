/**
 * Who is told about what.
 *
 * The entries are written once on torqvoice.com for every install there is.
 * What keeps that from being noise is that each reader only gets the ones
 * they can act on: the feature is in their version, on their kind of install,
 * behind a screen their role opens, and newer than their own account.
 */

import { describe, expect, it } from 'vitest'
import { selectEntries, unreadIds } from '@/features/whats-new/Lib/select'
import type { WhatsNewEntry } from '@/features/whats-new/Schema/whatsNewSchema'

function entry(overrides: Partial<WhatsNewEntry> = {}): WhatsNewEntry {
  return {
    id: 'e1',
    kind: 'new',
    title: 'Appointments on the calendar',
    body: '<p>Body</p>',
    imageUrl: null,
    ctaLabel: null,
    ctaHref: null,
    docsHref: null,
    minVersion: null,
    audience: 'all',
    subject: null,
    publishedAt: '2026-11-13T09:00:00.000Z',
    ...overrides,
  }
}

const everyone = { appVersion: 'v2.14.0', cloud: false, visibleSubjects: ['vehicles', 'settings'] }
const ids = (entries: WhatsNewEntry[]) => entries.map((e) => e.id)

describe('which highlights an install shows', () => {
  it('hides a feature from an install that does not have it yet', () => {
    const entries = [
      entry({ id: 'old', minVersion: '2.13.0' }),
      entry({ id: 'same', minVersion: '2.14.0' }),
      entry({ id: 'next-patch', minVersion: '2.14.1' }),
      entry({ id: 'next-minor', minVersion: '2.15.0' }),
    ]
    expect(ids(selectEntries(entries, everyone))).toEqual(['old', 'same'])
  })

  it('shows everything on a build that is not a release', () => {
    const entries = [entry({ minVersion: '9.0.0' })]
    expect(selectEntries(entries, { ...everyone, appVersion: 'development' })).toHaveLength(1)
  })

  it('keeps cloud news on the cloud and self-hosted news off it', () => {
    const entries = [
      entry({ id: 'all' }),
      entry({ id: 'cloud', audience: 'cloud' }),
      entry({ id: 'self', audience: 'self-hosted' }),
    ]
    expect(ids(selectEntries(entries, everyone))).toEqual(['all', 'self'])
    expect(ids(selectEntries(entries, { ...everyone, cloud: true }))).toEqual(['all', 'cloud'])
  })

  it('does not announce a screen the reader cannot open', () => {
    const entries = [
      entry({ id: 'vehicles', subject: 'vehicles' }),
      entry({ id: 'billing', subject: 'billing' }),
      // The admin writes subjects with a hyphen; the app's own use an underscore.
      entry({ id: 'work-orders', subject: 'work-orders' }),
      entry({ id: 'unknown', subject: 'something-newer' }),
    ]
    expect(ids(selectEntries(entries, everyone))).toEqual(['vehicles', 'unknown'])
    expect(
      ids(selectEntries(entries, { ...everyone, visibleSubjects: ['work_orders', 'billing'] }))
    ).toEqual(['billing', 'work-orders', 'unknown'])
  })
})

describe('which highlights are news to this person', () => {
  const entries = [
    entry({ id: 'nov-13', publishedAt: '2026-11-13T09:00:00.000Z' }),
    entry({ id: 'nov-09', publishedAt: '2026-11-09T09:00:00.000Z' }),
    entry({ id: 'oct-01', publishedAt: '2026-10-01T09:00:00.000Z' }),
  ]

  it('is everything since the panel was last opened', () => {
    expect(
      unreadIds(entries, {
        seenAt: new Date('2026-11-10T00:00:00Z'),
        accountCreatedAt: new Date('2025-01-01T00:00:00Z'),
      })
    ).toEqual(['nov-13'])
  })

  it('does not greet a new account with what shipped before it existed', () => {
    expect(
      unreadIds(entries, { seenAt: null, accountCreatedAt: new Date('2026-11-01T00:00:00Z') })
    ).toEqual(['nov-13', 'nov-09'])
  })
})
