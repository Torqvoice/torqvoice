import type { CustomFieldsSaveOutcome } from '@/features/custom-fields/Components/CustomFieldsForm'

/**
 * What to tell someone whose save was stopped by the workshop's own fields:
 * nothing was saved, and which fields, by the labels the workshop gave them.
 * The server's own words instead when it refused the whole save. `t` reads
 * `settings.customFields`.
 */
export function customFieldsRefusal(
  outcome: Extract<CustomFieldsSaveOutcome, { valid: false }>,
  t: (key: 'notSavedMissing' | 'notSavedInvalid', values: { fields: string }) => string
): string {
  if (outcome.error) return outcome.error
  return t(outcome.problem === 'invalid' ? 'notSavedInvalid' : 'notSavedMissing', {
    fields: (outcome.fields ?? []).join(', '),
  })
}
