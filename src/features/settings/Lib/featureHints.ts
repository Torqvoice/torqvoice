import { SETTING_KEYS } from '../Schema/settingsSchema'
import { ORG_TELEGRAM_KEYS } from '@/features/telegram/Schema/telegramSettingsSchema'
import { PermissionSubject } from '@/lib/permissions'
import type { PlanFeatures } from '@/lib/features'

/**
 * Which hint to raise when a setting is switched on.
 *
 * Keyed by the setting, because that is the moment worth announcing. A link
 * that has always been in the sidebar needs no note; one that appeared while
 * somebody was looking at a different screen does.
 *
 * The id carries a version. Rewording a hint means bumping it, which shows
 * the new wording to workshops that dismissed the old one.
 */
export const HINT_FOR_SETTING: Record<string, string> = {
  [SETTING_KEYS.TIRE_HOTEL_ENABLED]: 'tire-hotel.v1',
  [ORG_TELEGRAM_KEYS.TELEGRAM_ENABLED]: 'telegram.v1',
}

/**
 * The plan flags that are simply on or off.
 *
 * Narrower than every plan key on purpose: a limit like `maxOrganizations` is
 * a number, and gating on it would read as satisfied for any non-zero value
 * while meaning nothing.
 */
type PlanFlag = {
  [K in keyof PlanFeatures]: PlanFeatures[K] extends boolean ? K : never
}[keyof PlanFeatures]

/**
 * Something new in the product itself, rather than in this workshop's setup.
 *
 * A setting flip is a moment; shipping a feature is not, so these carry the
 * date they landed and are raised by that instead. Everything after the
 * raising is shared with the setting-flip hints: one card at a time, anchored
 * to where the thing lives, dismissed once for the whole workshop.
 */
export interface Announcement {
  /** Versioned like any hint, so reworded copy can be shown again. */
  id: string
  /** Where it points, and the sidebar link the card is anchored to. */
  href: string
  /**
   * The rights the feature needs. A technician who cannot reach the screen is
   * never told it exists, because the note would only be an offer of a door
   * that stays locked.
   */
  subject: PermissionSubject
  /**
   * When the feature shipped. A workshop that signed up afterwards has never
   * known the product without it, so it is not news to them, and greeting a
   * new customer with a backlog of announcements is how this feature turns
   * into noise nobody reads.
   */
  shippedAt: string
  /**
   * The plan feature the announcement needs, when it needs one. A workshop
   * whose plan does not include it would be sent to an upsell page by a card
   * it cannot dismiss without acknowledging, which is a poor way to sell
   * anything and the same locked door the permission gate exists to avoid.
   */
  feature?: PlanFlag
}

/** Named, because the designer page marks this one read on arrival. */
export const INVOICE_DESIGNER_ANNOUNCEMENT = 'invoice-designer.v1'

export const ANNOUNCEMENTS: Announcement[] = [
  {
    id: INVOICE_DESIGNER_ANNOUNCEMENT,
    // The templates page rather than the designer itself. Somebody sent
    // straight into a full-screen tool learns nothing about where it lives,
    // and has to ask the same question again next week; landing on the page
    // that owns it means the route is learned once.
    href: '/settings/templates',
    subject: PermissionSubject.SETTINGS,
    shippedAt: '2026-08-31',
    feature: 'customTemplates',
  },
]

/**
 * The announcements a given account should be shown, newest feature last.
 *
 * Pure, because every reason to stay quiet here is a rule worth a test: told
 * already, joined after it shipped, or not allowed in.
 */
export function announcementsToShow({
  announcements = ANNOUNCEMENTS,
  organizationCreatedAt,
  visibleSubjects,
  features,
  seen,
}: {
  announcements?: Announcement[]
  /** When this workshop signed up. Unknown counts as old enough to be told. */
  organizationCreatedAt?: Date | string | null
  /** Subjects this account can read; undefined means unrestricted. */
  visibleSubjects?: string[]
  /** What this workshop's plan includes; undefined means do not check. */
  features?: Partial<PlanFeatures>
  seen: string[]
}): string[] {
  const joined = organizationCreatedAt ? new Date(organizationCreatedAt) : null

  return announcements
    .filter((announcement) => {
      if (seen.includes(announcement.id)) return false
      if (visibleSubjects && !visibleSubjects.includes(announcement.subject)) return false
      if (announcement.feature && features && !features[announcement.feature]) return false
      // An unparseable date must not silence an announcement for everybody.
      if (joined && !Number.isNaN(joined.getTime())) {
        if (joined.getTime() >= new Date(announcement.shippedAt).getTime()) return false
      }
      return true
    })
    .map((announcement) => announcement.id)
}

/** The value a setting holds when it is on. Everything else counts as off. */
const ON = 'true'

/**
 * Reads a stored list of hint ids.
 *
 * Lives outside the action file because a 'use server' module may only export
 * async functions, and the server layout needs this one too.
 */
export function parseHintIds(value: string | null | undefined): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  } catch {
    // Hand-edited, or written by something older. An unreadable list means
    // nothing has been seen, which shows a hint again at worst.
    return []
  }
}

/**
 * The hints a settings write should raise.
 *
 * Only an off-to-on flip counts. Saving a page that happens to contain an
 * already-on toggle raises nothing, which matters because most settings
 * forms submit every field they own on every save. Turning something off and
 * on again raises nothing either, once the hint has been dismissed: whoever
 * did that knows where the link is.
 */
export function hintsToArm({
  entries,
  current,
  seen,
}: {
  /** The values about to be written. */
  entries: Record<string, string>
  /** What those keys hold right now. */
  current: Record<string, string | undefined>
  /** Hints this workshop has already been shown. */
  seen: string[]
}): string[] {
  const armed: string[] = []

  for (const [key, value] of Object.entries(entries)) {
    const hint = HINT_FOR_SETTING[key]
    if (!hint) continue
    if (value !== ON) continue
    if (current[key] === ON) continue
    if (seen.includes(hint)) continue
    if (armed.includes(hint)) continue
    armed.push(hint)
  }

  return armed
}
