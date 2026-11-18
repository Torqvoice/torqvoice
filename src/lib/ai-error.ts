import OpenAI from 'openai'
import en from '../../messages/en/integrations.json'

/**
 * What OpenAI puts in `error.code` when the account cannot pay. It answers
 * these with HTTP 429, the status of a real rate limit, so the status alone
 * told a workshop with an empty balance to "try again in a moment".
 * `insufficient_quota` is the older spelling and is still the `error.type`
 * of all of them.
 */
const NO_CREDIT_CODES = new Set(['insufficient_quota', 'credit_balance_exhausted'])
const SPEND_LIMIT_CODES = new Set([
  'organization_spend_limit_exceeded',
  'project_spend_limit_exceeded',
  'organization_usage_limit_exceeded',
])

/**
 * Whether the provider refused because of the account's money rather than
 * its traffic: no credit, or a spending limit reached. Both travel as 429,
 * and unlike a real rate limit neither goes away by trying again.
 */
export function isAccountLimitError(error: unknown): boolean {
  if (!(error instanceof OpenAI.APIError)) return false
  const code = typeof error.code === 'string' ? error.code : ''
  return (
    NO_CREDIT_CODES.has(code) || SPEND_LIMIT_CODES.has(code) || error.type === 'insufficient_quota'
  )
}

/**
 * The failures a workshop can act on, each with a sentence under
 * `integrations.aiErrors` in every locale. Anything else is the provider's
 * own words.
 */
export type AiErrorKind = keyof typeof en.aiErrors

/**
 * Which known failure this is, or null when only the provider's own message
 * can say. `unexpected` covers a reply with nothing a workshop can read.
 */
export function aiErrorKind(error: unknown): AiErrorKind | null {
  const apiError = error instanceof OpenAI.APIError ? error : undefined
  const status = apiError?.status
  const code = typeof apiError?.code === 'string' ? apiError.code : ''

  // The provider's own code says more than the status it travels under: a
  // key that may not use a model comes back as 404 or as 403, and an account
  // without credit as 429.
  if (code === 'model_not_found') return 'modelAccess'
  if (SPEND_LIMIT_CODES.has(code)) return 'spendLimit'
  if (NO_CREDIT_CODES.has(code) || apiError?.type === 'insufficient_quota') return 'noCredit'

  switch (status) {
    case 401:
    case 403:
      return 'keyRejected'
    case 402:
      return 'noUsableCredit'
    case 404:
      return 'modelUnavailable'
    case 413:
      return 'imageTooLarge'
    case 429:
      return 'rateLimited'
  }
  if (status && status >= 500) return 'providerDown'

  // An HTML body says nothing a workshop can act on, and stripping the tags
  // just leaves the debris of a status page.
  const raw = rawMessage(error)
  if (!raw || /<\s*(!doctype|html|head|body|div|p|span|title)\b/i.test(raw)) return 'unexpected'
  return null
}

function rawMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? '')
  return raw.replace(/\s+/g, ' ').trim()
}

/**
 * Turns whatever a provider threw into one short line fit for a toast, in
 * English. Where a request has a language, `aiErrorDescriber` in
 * `@/lib/ai-error-message` gives the same line in it.
 *
 * A rejected key rarely comes back as tidy JSON: a gateway in front of the
 * provider answers with an HTML error page, and the SDK puts that entire page
 * in `error.message`. Users were seeing raw markup in the toast.
 */
export function describeAiError(
  error: unknown,
  translate: (kind: AiErrorKind) => string = (kind) => en.aiErrors[kind]
): string {
  const kind = aiErrorKind(error)
  if (kind) return translate(kind)
  const text = rawMessage(error)
  return text.length > 200 ? `${text.slice(0, 200)}...` : text
}
