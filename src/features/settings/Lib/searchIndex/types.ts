import type { SettingsPageKey } from '@/features/settings/Lib/settingsPages'

/**
 * One thing a person might be looking for inside a settings page: a card, a
 * field, a switch, a tab. The search palette and the settings search box both
 * read these, so "invoice prefix" lands on the input rather than on the page.
 *
 * Titles and descriptions are keys in the `settings` message namespace, so
 * every entry reads in the workshop's own language without a second list of
 * words to keep in step. Keywords are English aliases (plus a few common
 * foreign words where a workshop would type them, such as "mva" for tax)
 * and are matched whatever the language.
 */
export type SettingsEntry = {
  /** Stable, unique across the whole index: `<page>.<something>`. */
  id: string
  page: SettingsPageKey
  /**
   * Key under the `settings` namespace, for example `invoice.dueDays`.
   * Resolved with `t(title)` at render time.
   */
  title: string
  /** Optional key under the `settings` namespace; one quiet line under the title. */
  description?: string
  /**
   * The `id` attribute of the element on the page: a card's `id`, or the
   * input's own id for a field. The palette opens the page and lands on it.
   * Left out for an entry that is the page itself.
   */
  anchor?: string
  /** Query string the page needs to show this entry, for example `tab=customFields`. */
  query?: string
  /**
   * Values for the title's placeholders, for the few labels that carry one
   * ("Service interval ({unit})"). Plain words: the palette has no workshop
   * unit to hand, so "km / mi" says what the field is without claiming which.
   */
  values?: Record<string, string>
  /** English aliases, lower case. */
  keywords: string[]
}
