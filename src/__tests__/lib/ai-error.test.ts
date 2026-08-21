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

function apiError(status: number, message: string) {
  return new OpenAI.APIError(status, undefined, message, undefined)
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

  it('falls back when there is no message at all', () => {
    expect(describeAiError(new Error(''))).toBe('The AI provider returned an unexpected response.')
  })
})
