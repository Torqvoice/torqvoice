import OpenAI from 'openai'

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
 * Turns whatever a provider threw into one short line fit for a toast.
 *
 * A rejected key rarely comes back as tidy JSON: a gateway in front of the
 * provider answers with an HTML error page, and the SDK puts that entire page
 * in `error.message`. Users were seeing raw markup in the toast.
 */
export function describeAiError(error: unknown): string {
  const generic = 'The AI provider returned an unexpected response.'
  const apiError = error instanceof OpenAI.APIError ? error : undefined
  const status = apiError?.status
  const code = typeof apiError?.code === 'string' ? apiError.code : ''

  // The provider's own code says more than the status it travels under: a
  // key that may not use a model comes back as 404 or as 403, and an account
  // without credit as 429.
  if (code === 'model_not_found') {
    return 'This API key has no access to the selected model. Pick another in Settings → Integrations.'
  }
  if (SPEND_LIMIT_CODES.has(code)) {
    return 'This OpenAI account has reached its spending limit. Check the limits at platform.openai.com.'
  }
  if (NO_CREDIT_CODES.has(code) || apiError?.type === 'insufficient_quota') {
    return 'This OpenAI account has no credit left. Add billing at platform.openai.com.'
  }

  switch (status) {
    case 401:
    case 403:
      return 'The AI provider rejected the API key. Check it in Settings → Integrations.'
    case 402:
      return 'The AI provider reports no usable credit for this API key.'
    case 404:
      return 'The AI provider does not offer the selected model. Pick another in Settings → Integrations.'
    case 413:
      return 'The image was too large for the AI provider.'
    case 429:
      return 'The AI provider is rate limiting this API key. Try again in a moment.'
  }
  if (status && status >= 500) {
    return 'The AI provider is unavailable right now. Try again in a moment.'
  }

  const raw = error instanceof Error ? error.message : String(error ?? '')

  // An HTML body says nothing a workshop can act on, and stripping the tags
  // just leaves the debris of a status page.
  if (/<\s*(!doctype|html|head|body|div|p|span|title)\b/i.test(raw)) return generic

  const text = raw.replace(/\s+/g, ' ').trim()
  if (!text) return generic
  return text.length > 200 ? `${text.slice(0, 200)}...` : text
}
