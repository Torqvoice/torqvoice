/**
 * Which releases get a banner, and for how long.
 *
 * The app ships most days. A strip for every patch was never read and never
 * went away: nobody pressed the X, the clock ran per browser from each
 * person's first sight, and the next release restarted them. So a patch is
 * silent, a minor release is announced, and the hour runs once per
 * person on the user record.
 */

import { describe, expect, it } from 'vitest'
import {
  decideUpdateBanner,
  isAnnounced,
  parseVersion,
  UPDATE_BANNER_TTL_MS,
} from '@/lib/update-banner-rule'

describe('isAnnounced', () => {
  it('announces a minor release', () => {
    expect(isAnnounced('v1.2.54', 'v1.3.0')).toBe(true)
  })

  it('announces a major release', () => {
    expect(isAnnounced('v1.9.3', 'v2.0.0')).toBe(true)
  })

  it('says nothing for a patch', () => {
    expect(isAnnounced('v1.2.53', 'v1.2.54')).toBe(false)
  })

  it('says nothing for a rollback', () => {
    expect(isAnnounced('v1.3.0', 'v1.2.54')).toBe(false)
  })

  it('says nothing when either side is not a release', () => {
    expect(isAnnounced('v1.2.54', 'development')).toBe(false)
    expect(isAnnounced('v1.2.54', 'demo-abc1234')).toBe(false)
    expect(isAnnounced(null, 'v1.3.0')).toBe(false)
  })

  it('reads a tag with or without the v, and with a suffix', () => {
    expect(parseVersion('1.3.0')).toEqual({ major: 1, minor: 3, patch: 0 })
    expect(parseVersion('v1.3.0-rc1')).toEqual({ major: 1, minor: 3, patch: 0 })
    expect(parseVersion('latest')).toBeNull()
  })
})

describe('decideUpdateBanner', () => {
  const now = Date.parse('2026-09-22T09:00:00Z')
  const user = (over: Partial<Parameters<typeof decideUpdateBanner>[0]> = {}) => ({
    lastSeenVersion: 'v1.2.54',
    updateBannerVersion: null,
    updateBannerShownAt: null,
    ...over,
  })

  it('shows a minor release the first time, and asks for the clock to be started', () => {
    expect(decideUpdateBanner(user(), 'v1.3.0', now)).toEqual({
      kind: 'show',
      expiresAt: now + UPDATE_BANNER_TTL_MS,
      stamp: true,
    })
  })

  it('keeps the clock that was started on another device', () => {
    const shownAt = new Date(now - 20 * 60 * 1000)
    expect(
      decideUpdateBanner(
        user({ updateBannerVersion: 'v1.3.0', updateBannerShownAt: shownAt }),
        'v1.3.0',
        now
      )
    ).toEqual({ kind: 'show', expiresAt: shownAt.getTime() + UPDATE_BANNER_TTL_MS, stamp: false })
  })

  it('is over an hour after it first appeared, wherever that was', () => {
    const shownAt = new Date(now - UPDATE_BANNER_TTL_MS - 1000)
    expect(
      decideUpdateBanner(
        user({ updateBannerVersion: 'v1.3.0', updateBannerShownAt: shownAt }),
        'v1.3.0',
        now
      )
    ).toEqual({ kind: 'expired' })
  })

  it('gives the next announced release its own hour', () => {
    const old = new Date(now - 10 * UPDATE_BANNER_TTL_MS)
    expect(
      decideUpdateBanner(
        user({ updateBannerVersion: 'v1.3.0', updateBannerShownAt: old }),
        'v1.4.0',
        now
      )
    ).toMatchObject({ kind: 'show', stamp: true })
  })

  it('is silent for a patch, and for a version already seen', () => {
    expect(decideUpdateBanner(user(), 'v1.2.55', now)).toEqual({ kind: 'silent' })
    expect(decideUpdateBanner(user({ lastSeenVersion: 'v1.3.0' }), 'v1.3.0', now)).toEqual({
      kind: 'silent',
    })
  })
})
