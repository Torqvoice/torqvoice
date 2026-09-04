/**
 * The settings rows AI used before it moved into the integrations catalog.
 *
 * Nothing writes them any more: a workshop's provider, key and model live on
 * an `IntegrationConnection` now. They are still read once, when an old setup
 * is adopted into a connection, and are left in place afterwards so a
 * rollback finds them where it left them.
 */
export const AI_KEYS = {
  AI_PROVIDER: 'ai.provider',
  AI_API_KEY: 'ai.apiKey',
  AI_MODEL: 'ai.model',
  AI_ENABLED: 'ai.enabled',
} as const

export type AiKey = (typeof AI_KEYS)[keyof typeof AI_KEYS]

export const ALL_AI_KEYS = Object.values(AI_KEYS)
