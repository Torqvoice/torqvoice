import { SETTING_KEYS } from '../Schema/settingsSchema'
import { ORG_TELEGRAM_KEYS } from '@/features/telegram/Schema/telegramSettingsSchema'

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
