/**
 * What a custom field's value may be, for its type.
 *
 * One set of rules for the form and the server. The form uses them to say
 * what is wrong before the save leaves the browser; the server uses them
 * because a request does not have to come from the form.
 *
 * Values are stored as text, whatever the type: a number as typed, a date as
 * a calendar day (YYYY-MM-DD), a checkbox as 'true' or 'false', a choice as
 * the option's own text. An empty string is "no value", and is fine for every
 * type unless the field is required.
 */

/** Why a value was refused. The form turns each into a sentence. */
export type CustomFieldIssue = 'required' | 'number' | 'date' | 'option' | 'checkbox' | 'tooLong'

/** Longer than any text a field is for, and short enough to keep a row small. */
export const CUSTOM_FIELD_VALUE_MAX_LENGTH = 10000

export interface CustomFieldRuleInput {
  fieldType: string
  options: string | null
  required: boolean
}

/** A select field's choices. They are kept as one comma-separated string. */
export function customFieldOptions(options: string | null | undefined): string[] {
  return (options || '')
    .split(',')
    .map((option) => option.trim())
    .filter(Boolean)
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/

/** A real calendar day written YYYY-MM-DD: 2026-02-30 is not one. */
function isCalendarDay(value: string): boolean {
  const match = DATE_ONLY.exec(value)
  if (!match) return false
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  )
}

/**
 * Whether a required field has been left empty. A checkbox never is: left
 * unticked is an answer.
 */
export function isMissingRequiredValue(field: CustomFieldRuleInput, value: string): boolean {
  return field.required && field.fieldType !== 'checkbox' && value.trim() === ''
}

/**
 * Whether the value suits the field's type. Says nothing about "required".
 * A type this file does not know is treated as text, so a field type added
 * later is never refused by an older rule.
 */
export function customFieldTypeIssue(
  field: CustomFieldRuleInput,
  value: string
): CustomFieldIssue | null {
  if (value.length > CUSTOM_FIELD_VALUE_MAX_LENGTH) return 'tooLong'
  if (value === '') return null

  switch (field.fieldType) {
    case 'number':
      // The same test a number field's default value has to pass.
      return value.trim() !== '' && Number.isFinite(Number(value)) ? null : 'number'
    case 'date':
      return isCalendarDay(value) ? null : 'date'
    case 'checkbox':
      return value === 'true' || value === 'false' ? null : 'checkbox'
    case 'select':
      return customFieldOptions(field.options).includes(value) ? null : 'option'
    default:
      return null
  }
}

/** The first thing wrong with a value, or null when it may be saved. */
export function customFieldValueIssue(
  field: CustomFieldRuleInput,
  value: string
): CustomFieldIssue | null {
  if (isMissingRequiredValue(field, value)) return 'required'
  return customFieldTypeIssue(field, value)
}

/** One refused field: which, what the workshop calls it, and what is wrong. */
export interface CustomFieldError {
  fieldId: string
  label: string
  issue: CustomFieldIssue
}

/**
 * What a set of values sent with a save comes to, judged against the fields
 * as they are defined now, in the order the form draws them.
 *
 * - A required field refuses an empty value. One the request leaves out is
 *   judged by what the record shows for it (the stored value, else the
 *   field's default), so leaving a field out is no way around the rule.
 * - A value has to suit its type, unless it is the value already stored for
 *   that field: that one is left alone and not written again.
 * - A field that is unknown or switched off is not in `definitions`, so it
 *   is skipped.
 */
export function judgeCustomFieldValues(
  definitions: (CustomFieldRuleInput & {
    id: string
    label: string
    defaultValue: string | null
  })[],
  storedValue: Map<string, string>,
  values: Record<string, string>
): { fieldErrors: CustomFieldError[]; changed: { fieldId: string; value: string }[] } {
  const fieldErrors: CustomFieldError[] = []
  const changed: { fieldId: string; value: string }[] = []
  const refuse = (definition: { id: string; label: string }, issue: CustomFieldIssue) =>
    fieldErrors.push({ fieldId: definition.id, label: definition.label, issue })
  for (const definition of definitions) {
    // Only own keys: the object came through JSON and zod, so it has no
    // inherited ones a field id could collide with.
    const value: string | undefined = Object.hasOwn(values, definition.id)
      ? values[definition.id]
      : undefined
    if (value === undefined) {
      const shown = storedValue.get(definition.id) ?? definition.defaultValue ?? ''
      if (isMissingRequiredValue(definition, shown)) refuse(definition, 'required')
      continue
    }
    if (isMissingRequiredValue(definition, value)) {
      refuse(definition, 'required')
      continue
    }
    if (storedValue.get(definition.id) === value) continue
    const issue = customFieldTypeIssue(definition, value)
    if (issue) refuse(definition, issue)
    else changed.push({ fieldId: definition.id, value })
  }
  return { fieldErrors, changed }
}
