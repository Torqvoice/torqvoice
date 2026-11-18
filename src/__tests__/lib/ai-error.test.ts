/**
 * Tests for the message a failed AI call shows the user.
 *
 * These land in a toast, so the size and shape of the string is the whole
 * point: a wrong API key used to surface as the provider gateway's HTML error
 * page, rendered as markup in the corner of the screen.
 */

import { describe, it, expect } from 'vitest'

import OpenAI from 'openai'
import { describeAiError } from '@/lib/ai-error'

/** A failed request as the SDK raises it; `body` is the provider's own `error` object. */
function apiError(status: number, message: string, body?: { code?: string; type?: string }) {
  return new OpenAI.APIError(status, body && { message, ...body }, message, undefined)
}

describe('describeAiError', () => {
  it('names the API key on a rejected credential', () => {
    const message = describeAiError(apiError(401, 'Incorrect API key provided'))
    expect(message).toContain('API key')
    expect(message).toContain('Settings')
  })

  it('does not leak an HTML error page into the toast', () => {
    const html =
      '<!DOCTYPE html><html><head><title>401 Unauthorized</title></head><body><div class="err"><h1>Unauthorized</h1><p>invalid key</p></div></body></html>'
    const message = describeAiError(new Error(html))
    expect(message).not.toContain('<')
    expect(message).not.toContain('DOCTYPE')
    expect(message.length).toBeLessThan(120)
  })

  it('keeps an HTML page out even when the status is one it recognises', () => {
    const message = describeAiError(apiError(500, '<html><body>Bad gateway</body></html>'))
    expect(message).not.toContain('<')
  })

  it('caps a long provider message', () => {
    const message = describeAiError(new Error('x'.repeat(5000)))
    expect(message.length).toBeLessThanOrEqual(203)
  })

  it('passes a short, useful provider message through', () => {
    expect(describeAiError(new Error('Model is overloaded'))).toBe('Model is overloaded')
  })

  it('has something to say about a rate limit', () => {
    expect(describeAiError(apiError(429, 'slow down'))).toContain('rate limit')
  })

  it('still calls a real rate limit a rate limit when the provider names it', () => {
    const message = describeAiError(
      apiError(429, 'Rate limit reached for gpt-4.1 on requests per min (RPM): Limit 3, Used 3.', {
        code: 'rate_limit_exceeded',
        type: 'requests',
      })
    )
    expect(message).toBe('The AI provider is rate limiting this API key. Try again in a moment.')
  })

  // OpenAI answers an account with no paid credit with the same 429 as a
  // rate limit. A workshop was told to try again in a moment, for a day.
  it('tells an account without credit to add billing, not to wait', () => {
    const noCredit = 'This OpenAI account has no credit left. Add billing at platform.openai.com.'
    const quota = 'You exceeded your current quota, please check your plan and billing details.'

    expect(
      describeAiError(
        apiError(429, quota, { code: 'insufficient_quota', type: 'insufficient_quota' })
      )
    ).toBe(noCredit)
    // The code OpenAI documents today, under the same broader type.
    expect(
      describeAiError(
        apiError(429, quota, { code: 'credit_balance_exhausted', type: 'insufficient_quota' })
      )
    ).toBe(noCredit)
  })

  it('names a spending limit when that is what stopped the request', () => {
    for (const code of [
      'organization_spend_limit_exceeded',
      'project_spend_limit_exceeded',
      'organization_usage_limit_exceeded',
    ]) {
      const message = describeAiError(
        apiError(429, 'Spend limit reached.', { code, type: 'insufficient_quota' })
      )
      expect(message, code).toContain('spending limit')
      expect(message, code).toContain('platform.openai.com')
      expect(message, code).not.toContain('Try again')
    }
  })

  // The model exists and the key is good; the key's project is not allowed
  // to use it. OpenAI sends this as 404 or as 403, with the same code.
  it('says the key has no access to the model, whichever status carries it', () => {
    const noAccess =
      'This API key has no access to the selected model. Pick another in Settings → Integrations.'

    expect(
      describeAiError(
        apiError(404, 'The model `gpt-4.1` does not exist or you do not have access to it.', {
          code: 'model_not_found',
          type: 'invalid_request_error',
        })
      )
    ).toBe(noAccess)
    expect(
      describeAiError(
        apiError(403, 'Project `proj_1` does not have access to model `gpt-4.1`', {
          code: 'model_not_found',
          type: 'invalid_request_error',
        })
      )
    ).toBe(noAccess)
  })

  it('keeps the plain answer for a 404 that carries no code', () => {
    expect(describeAiError(apiError(404, 'Not found'))).toContain(
      'does not offer the selected model'
    )
  })

  it('falls back when there is no message at all', () => {
    expect(describeAiError(new Error(''))).toBe('The AI provider returned an unexpected response.')
  })
})
