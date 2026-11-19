import type { z } from 'zod'

/**
 * Parses the input of an update, keeping only the fields the caller sent.
 *
 * An update schema is its create schema made partial, and the create schema
 * gives most fields a default. Zod applies those defaults to a partial
 * schema too: a field the caller left out comes back holding its default,
 * not undefined. An update that then writes what it parsed resets every
 * field it was not told about. Saving two dates on a finished job would put
 * it back to pending and write its totals as zero.
 *
 * So the defaults are taken out again here. A field that was sent is parsed
 * and coerced as the schema says; a field that was not sent is absent from
 * the result, which is what the code reading it (`data.x !== undefined`)
 * has always taken it to mean.
 */
export function parseSentFields<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const parsed = schema.parse(input) as Record<string, unknown>
  if (!input || typeof input !== 'object') return parsed as z.infer<T>
  const sent = input as Record<string, unknown>
  for (const key of Object.keys(parsed)) {
    if (!Object.hasOwn(sent, key) || sent[key] === undefined) delete parsed[key]
  }
  return parsed as z.infer<T>
}

/**
 * The id an update was sent with, read before the rest of the input is
 * parsed, or null when there is none to read.
 *
 * An update of a locked document is refused whatever else it carries, so the
 * lock is asked first. The page of a locked document turns its inputs off,
 * and a form with its inputs off sends them as null: parsed first, pressing
 * Save answered "title: Invalid input: expected string, received null" where
 * the person needed to hear that the document is locked.
 */
export function sentId(input: unknown): string | null {
  if (!input || typeof input !== 'object') return null
  const id = (input as Record<string, unknown>).id
  return typeof id === 'string' && id ? id : null
}
