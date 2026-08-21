/**
 * Wording for the audit trail.
 *
 * Audit messages are composed once and stored, so unlike the rest of the app
 * they cannot be translated at read time. They are English by design, which
 * makes it all the more important that they read as English: a stored line is
 * the one thing nobody can fix later without a migration.
 */

/**
 * "1 file", "3 files".
 *
 * Replaces the `file(s)` shorthand, which reads as a placeholder somebody
 * forgot to finish and is wrong in the singular either way.
 */
export function plural(count: number, noun: string, pluralForm?: string): string {
  return `${count} ${count === 1 ? noun : (pluralForm ?? `${noun}s`)}`
}

/**
 * Turns a stored enum into something readable: `wash_tires` to `wash tires`.
 *
 * Not translated, and deliberately not a lookup table. A table would have to
 * be kept in step with TREATMENT_TYPES by hand, and the failure when it drifts
 * is silent: a new treatment type prints as nothing rather than as itself.
 */
export function humanise(value: string): string {
  return value.replaceAll('_', ' ')
}
