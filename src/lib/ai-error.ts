import OpenAI from 'openai'

/**
 * Turns whatever a provider threw into one short line fit for a toast.
 *
 * A rejected key rarely comes back as tidy JSON: a gateway in front of the
 * provider answers with an HTML error page, and the SDK puts that entire page
 * in `error.message`. Users were seeing raw markup in the toast.
 */
export function describeAiError(error: unknown): string {
  const generic = 'The AI provider returned an unexpected response.'
  const status = error instanceof OpenAI.APIError ? error.status : undefined

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
