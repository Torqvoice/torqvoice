/**
 * The message a tech sends from the shelf.
 *
 * A set arriving worn is the highest-intent sales moment in the whole cycle:
 * the customer has just handed over tires that need replacing, and there is a
 * full season of lead time before they need them again. The person holding
 * the wheel is the one who knows, so the message has to be one tap away from
 * the reading that prompted it.
 *
 * The body is a starting point, not a script. Every shop has its own voice
 * and its own rules about what it will promise, so the composer hands the
 * text over editable.
 */

import type { TireCondition } from './tireConstants'

export const TIRE_MESSAGE_REASONS = ['low_tread', 'damage', 'stored', 'custom'] as const
export type TireMessageReason = (typeof TIRE_MESSAGE_REASONS)[number]

export type MessageVariables = {
  customer_name: string
  vehicle: string
  plate: string
  season: string
  size: string
  /** Human-readable worst reading, e.g. "3.2 mm" or "4.1/32\"". */
  tread: string
  /** Which wheel positions are at or below the limit, already localised. */
  positions: string
  shop_name: string
  shelf: string
}

/**
 * Substitutes `{variable}` placeholders, leaving unknown ones untouched so a
 * typo in a shop's own template shows up as itself rather than vanishing.
 */
export function interpolate(template: string, variables: Partial<MessageVariables>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in variables ? ((variables as Record<string, string>)[key] ?? match) : match
  )
}

/**
 * Which reason a reading suggests. `replace` is the one worth a message on
 * its own; `fair` is worth mentioning but not chasing, so the composer opens
 * on it only when the tech asks.
 */
export function reasonForCondition(worst: TireCondition | null): TireMessageReason {
  if (worst === 'replace') return 'low_tread'
  return 'stored'
}

/** Trims a body to what one SMS segment comfortably carries. */
export const SMS_SOFT_LIMIT = 320
