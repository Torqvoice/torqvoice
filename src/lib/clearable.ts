/**
 * Optional text fields that a user is allowed to empty.
 *
 * A form and its update action have to agree on what "cleared" looks like.
 * Prisma skips a key whose value is undefined, so an update action reads
 * undefined as "not touched" and leaves the stored value alone. An emptied
 * input therefore has to travel as '' and be turned into null on the server,
 * or the old value comes back after save. Create paths have no old value, so
 * leaving an empty field out is the same thing as clearing it.
 */

/** What an optional text input sends to a server action. */
export function clearableInput(
  value: FormDataEntryValue | string | null | undefined,
  editing: boolean
): string | undefined {
  const text = (typeof value === 'string' ? value : '').trim()
  return text || (editing ? '' : undefined)
}

/**
 * What an update action writes for an optional text field: untouched stays
 * untouched, emptied becomes null, anything else is stored trimmed.
 */
export function clearedToNull(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined
  return value?.trim() || null
}
