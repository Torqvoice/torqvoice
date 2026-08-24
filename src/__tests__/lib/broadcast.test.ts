/**
 * The platform-wide notice.
 *
 * This one reads in the root layout, so it is on the path of every page in the
 * app including sign-in and the public customer links. Two things follow from
 * that and neither is obvious from the call site: it must survive a database
 * it cannot reach, and it must never hand the banner a level it cannot style.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const findMany = vi.fn()
vi.mock('@/lib/db', () => ({ db: { systemSetting: { findMany } } }))

/** A fresh module each time, so React's per-request cache cannot leak. */
async function read() {
  vi.resetModules()
  const { getBroadcast } = await import('@/lib/broadcast')
  return getBroadcast()
}

function stored(entries: Record<string, string>) {
  findMany.mockResolvedValue(Object.entries(entries).map(([key, value]) => ({ key, value })))
}

beforeEach(() => {
  findMany.mockReset()
})

describe('who the notice reaches', () => {
  it('never reaches a page a workshop customer opens', async () => {
    // These carry the workshop's branding, not ours, and a white-label licence
    // exists so Torqvoice does not appear on that paperwork at all. A notice
    // aimed at staff is also none of a customer's business.
    const { isCustomerFacingPath } = await import('@/lib/broadcast')
    for (const path of [
      '/portal',
      '/portal/org123',
      '/portal/org123/invoices',
      '/portal/org123/auth/login',
      '/share/invoice/org123/tok',
      '/share/quote/org123/tok',
      '/share/inspection/org123/tok',
      '/share/status-report/org123/tok',
      '/share/terms/org123',
      '/terms',
    ]) {
      expect(isCustomerFacingPath(path), `${path} must not show a notice`).toBe(true)
    }
  })

  it('reaches the staff app, including the sign-in page', async () => {
    // Somebody who cannot sign in during an outage is the person who most
    // needs to know why.
    const { isCustomerFacingPath } = await import('@/lib/broadcast')
    for (const path of [
      '/',
      '/auth/sign-in',
      '/work-orders',
      '/settings/license',
      '/admin/settings',
      '/tire-hotel',
    ]) {
      expect(isCustomerFacingPath(path), `${path} should show a notice`).toBe(false)
    }
  })

  it('is not fooled by a path that merely starts with the same letters', async () => {
    const { isCustomerFacingPath } = await import('@/lib/broadcast')
    expect(isCustomerFacingPath('/portal-settings')).toBe(false)
    expect(isCustomerFacingPath('/shared-notes')).toBe(false)
  })
})

describe('reading the notice', () => {
  it('is nothing when none is set', async () => {
    stored({})
    expect(await read()).toBeNull()
  })

  it('is nothing when the message is only whitespace', async () => {
    // Clearing the field writes an empty string rather than deleting the row.
    stored({ 'broadcast.message': '   ' })
    expect(await read()).toBeNull()
  })

  it('carries the message, level and timestamp', async () => {
    stored({
      'broadcast.message': 'Server trouble, we are on it',
      'broadcast.level': 'critical',
      'broadcast.updatedAt': '2026-08-21T10:00:00.000Z',
    })
    expect(await read()).toEqual({
      message: 'Server trouble, we are on it',
      level: 'critical',
      updatedAt: '2026-08-21T10:00:00.000Z',
    })
  })

  it('falls back to info for a level it cannot style', async () => {
    // The banner indexes a style map by this. An unknown value would render
    // undefined classes on every page at once.
    stored({ 'broadcast.message': 'Hello', 'broadcast.level': 'catastrophic' })
    expect((await read())?.level).toBe('info')
  })

  it('defaults to info when no level was stored', async () => {
    stored({ 'broadcast.message': 'Hello' })
    expect((await read())?.level).toBe('info')
  })

  it('trims the message', async () => {
    stored({ 'broadcast.message': '  spaced  ' })
    expect((await read())?.message).toBe('spaced')
  })

  it('caps a message long enough to push the page around', async () => {
    stored({ 'broadcast.message': 'x'.repeat(5000) })
    expect((await read())?.message.length).toBe(400)
  })

  it('keys dismissals on the text when there is no timestamp', async () => {
    // A notice written before the timestamp existed still needs something
    // stable, or it would reappear on every page load.
    stored({ 'broadcast.message': 'Hello' })
    expect((await read())?.updatedAt).toBe('Hello')
  })

  it('returns nothing rather than taking every page down with it', async () => {
    // It runs in the root layout. A database that is unreachable, or not yet
    // migrated, must not turn a missing notice into a blank app.
    findMany.mockRejectedValue(new Error('connection refused'))
    expect(await read()).toBeNull()
  })
})
