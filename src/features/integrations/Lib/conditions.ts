import type { SettingCondition } from './types'

type Values = Record<string, unknown>

/**
 * Whether a field's showWhen holds for the values on the page or on the
 * saved connection. Shared by the form, which hides the field, and the save
 * action, which must not demand a hidden field.
 */
export function conditionMet(condition: SettingCondition | undefined, values: Values): boolean {
  if (!condition) return true
  const current = values[condition.key] as string | number | boolean | undefined
  if ('in' in condition) return current !== undefined && condition.in.includes(current)
  return current === condition.equals
}
