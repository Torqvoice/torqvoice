/**
 * When a release is worth a banner, and for how long.
 *
 * Torqvoice ships most days, and a strip at the top of every screen for
 * every patch stopped being read: nobody pressed the X, and the next release
 * arrived before the notice had let itself out. So a patch (1.2.53 to 1.2.54)
 * says nothing, and only a minor or major release (1.2.x to 1.3.0) is
 * announced. Which is which is decided by the tag.
 *
 * The clock is on the user record, once per release across every device:
 * one hour from when the banner first appeared to that person, wherever
 * that was. Past that it is marked seen and does not come back.
 */

/** One hour: long enough to be read, short enough to never become furniture. */
export const UPDATE_BANNER_TTL_MS = 60 * 60 * 1000

/** Versions the app runs under that are not releases at all. */
const NOT_A_RELEASE = new Set(['development', ''])

interface Parsed {
  major: number
  minor: number
  patch: number
}

/** `v1.2.54`, `1.2.54` or `1.2.54-rc1`. Anything else is not a release. */
export function parseVersion(version: string | null | undefined): Parsed | null {
  if (!version || NOT_A_RELEASE.has(version)) return null
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(version.trim())
  if (!m) return null
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) }
}

/**
 * Whether going from the version the user last saw to the one running is
 * worth telling them about. Only a step up in the major or minor part is; a
 * patch, a rollback, or a version that is not a release is not.
 *
 * A user who has never been seeded is never announced to here: the first
 * load seeds them silently, as it always has.
 */
export function isAnnounced(lastSeen: string | null, current: string): boolean {
  const seen = parseVersion(lastSeen)
  const now = parseVersion(current)
  if (!seen || !now) return false
  if (now.major !== seen.major) return now.major > seen.major
  return now.minor > seen.minor
}

export type UpdateBannerDecision =
  /** Nothing to show; write the version as seen so the next comparison starts here. */
  | { kind: 'silent' }
  /** Show it, and stamp when it first appeared if that has not happened yet. */
  | { kind: 'show'; expiresAt: number; stamp: boolean }
  /** Its hour is over: mark seen, show nothing. */
  | { kind: 'expired' }

export function decideUpdateBanner(
  user: {
    lastSeenVersion: string | null
    updateBannerVersion: string | null
    updateBannerShownAt: Date | string | null
  },
  current: string,
  now = Date.now()
): UpdateBannerDecision {
  if (user.lastSeenVersion === current) return { kind: 'silent' }
  if (!isAnnounced(user.lastSeenVersion, current)) return { kind: 'silent' }

  const shownAt =
    user.updateBannerVersion === current && user.updateBannerShownAt
      ? new Date(user.updateBannerShownAt).getTime()
      : null
  if (shownAt === null) return { kind: 'show', expiresAt: now + UPDATE_BANNER_TTL_MS, stamp: true }
  const expiresAt = shownAt + UPDATE_BANNER_TTL_MS
  if (expiresAt <= now) return { kind: 'expired' }
  return { kind: 'show', expiresAt, stamp: false }
}
