import { PermissionSubject } from '@/lib/permissions'
import { parseVersion } from '@/lib/update-banner-rule'
import type { WhatsNewEntry } from '../Schema/whatsNewSchema'

const KNOWN_SUBJECTS = new Set<string>(Object.values(PermissionSubject))

/** Whether the running app is at least `minVersion`. */
function hasVersion(appVersion: string, minVersion: string | null): boolean {
  if (!minVersion) return true
  const min = parseVersion(minVersion)
  // An entry with a version nobody can read is the author's typo, not a
  // reason to hide the news from everyone.
  if (!min) return true
  const app = parseVersion(appVersion)
  // A development build, or an image tag that is not a release: there is
  // nothing to compare, and the person running it is the one who wants to
  // see the entry they are about to publish.
  if (!app) return true
  if (app.major !== min.major) return app.major > min.major
  if (app.minor !== min.minor) return app.minor > min.minor
  return app.patch >= min.patch
}

/**
 * The entries this person should be told about.
 *
 * Three rules, all for the same reason: an announcement of something the
 * reader cannot open is worse than no announcement.
 * - The install must already have the feature. Entries are published the day
 *   a release ships, and a self-hosted workshop may be months behind it.
 * - Cloud-only and self-hosted-only features stay with their own audience.
 * - A feature behind a permission is announced to the people who hold it.
 */
export function selectEntries(
  entries: WhatsNewEntry[],
  viewer: { appVersion: string; cloud: boolean; visibleSubjects: readonly string[] }
): WhatsNewEntry[] {
  return entries.filter((entry) => {
    if (!hasVersion(viewer.appVersion, entry.minVersion)) return false
    if (entry.audience === 'cloud' && !viewer.cloud) return false
    if (entry.audience === 'self-hosted' && viewer.cloud) return false
    if (entry.subject) {
      const subject = entry.subject.toLowerCase().replace(/-/g, '_')
      // A subject this version has never heard of cannot be checked, so it
      // does not hide anything.
      if (KNOWN_SUBJECTS.has(subject) && !viewer.visibleSubjects.includes(subject)) return false
    }
    return true
  })
}

/**
 * Which entries are news to this person.
 *
 * Counted from the later of the last time they opened the panel and the day
 * their account was created: somebody who signed up yesterday has never known
 * the product without last month's features, so those are not news to them.
 */
export function unreadIds(
  entries: WhatsNewEntry[],
  viewer: { seenAt: Date | null; accountCreatedAt: Date | null }
): string[] {
  const since = Math.max(viewer.seenAt?.getTime() ?? 0, viewer.accountCreatedAt?.getTime() ?? 0)
  return entries.filter((entry) => Date.parse(entry.publishedAt) > since).map((entry) => entry.id)
}
