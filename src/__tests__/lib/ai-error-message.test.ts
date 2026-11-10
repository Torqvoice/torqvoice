/**
 * The AI failure a workshop reads in a toast or on the connection page is in
 * the language they use the app in, not always English.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import OpenAI from 'openai'
import nb from '../../../messages/nb/integrations.json'

const { getTranslations } = vi.hoisted(() => ({ getTranslations: vi.fn() }))
vi.mock('next-intl/server', () => ({ getTranslations }))

import { aiErrorDescriber } from '@/lib/ai-error-message'

function apiError(status: number, message: string, body?: { code?: string; type?: string }) {
  return new OpenAI.APIError(status, body && { message, ...body }, message, undefined)
}

/** A translator over the Norwegian file, the way next-intl resolves one. */
function norwegian(ns: string) {
  expect(ns).toBe('integrations.aiErrors')
  return (key: keyof typeof nb.aiErrors) => nb.aiErrors[key]
}

describe('aiErrorDescriber', () => {
  beforeEach(() => {
    getTranslations.mockReset()
  })

  it('tells an account without credit in the reader’s language', async () => {
    getTranslations.mockImplementation(async (ns: string) => norwegian(ns))
    const describeError = await aiErrorDescriber()
    const message = describeError(
      apiError(429, 'You exceeded your current quota', {
        code: 'insufficient_quota',
        type: 'insufficient_quota',
      })
    )
    expect(message).toBe(nb.aiErrors.noCredit)
    expect(message).toContain('kreditt')
  })

  it('translates a spending limit and a model the key may not use', async () => {
    getTranslations.mockImplementation(async (ns: string) => norwegian(ns))
    const describeError = await aiErrorDescriber()
    expect(describeError(apiError(429, 'limit', { code: 'project_spend_limit_exceeded' }))).toBe(
      nb.aiErrors.spendLimit
    )
    expect(describeError(apiError(403, 'no access', { code: 'model_not_found' }))).toBe(
      nb.aiErrors.modelAccess
    )
  })

  it('passes the provider’s own words through untranslated', async () => {
    getTranslations.mockImplementation(async (ns: string) => norwegian(ns))
    const describeError = await aiErrorDescriber()
    expect(describeError(new Error('Context length exceeded'))).toBe('Context length exceeded')
  })

  it('falls back to English where there is no request language', async () => {
    getTranslations.mockRejectedValue(new Error('no request scope'))
    const describeError = await aiErrorDescriber()
    expect(describeError(apiError(429, 'quota', { code: 'insufficient_quota' }))).toContain(
      'no credit left'
    )
  })
})
