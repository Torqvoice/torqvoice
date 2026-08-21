/**
 * The values a workshop can drop into an approved template.
 *
 * Pure vocabulary, kept away from the code that resolves it: the settings form
 * offers these as chips so nobody has to spell them, and a client component
 * cannot import a server-only module.
 */

export const TEMPLATE_TOKENS = ['customer', 'vehicle', 'plate', 'message', 'workshop'] as const

export type TemplateToken = (typeof TEMPLATE_TOKENS)[number]

export function parseTemplateTokens(value: string | undefined | null): TemplateToken[] {
  if (!value?.trim()) return []
  return value
    .split(',')
    .map((token) => token.trim().toLowerCase())
    .filter((token): token is TemplateToken =>
      (TEMPLATE_TOKENS as readonly string[]).includes(token)
    )
}

/** Names any entry that is not one of ours, for the settings form to refuse. */
export function unknownTemplateTokens(value: string | undefined | null): string[] {
  if (!value?.trim()) return []
  return value
    .split(',')
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean)
    .filter((token) => !(TEMPLATE_TOKENS as readonly string[]).includes(token))
}
