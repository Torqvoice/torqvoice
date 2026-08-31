/**
 * Tests for the per-model completion parameters.
 *
 * OpenAI's reasoning models reject the classic `max_tokens` parameter with a
 * 400 ("Use 'max_completion_tokens' instead") and refuse any temperature other
 * than the default, while the Anthropic compatibility endpoint keeps the
 * classic parameter. Picking wrong surfaces as an error toast on every AI
 * feature, so the mapping is pinned down here.
 */

import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ db: {} }))

import { completionTuning } from '@/lib/ai'

const config = (provider: string, model: string) => ({ provider, apiKey: 'key', model })

describe('completionTuning', () => {
  it('keeps max_tokens and temperature for the anthropic endpoint', () => {
    expect(completionTuning(config('anthropic', 'claude-sonnet-4-6'), 2000, 0.7)).toEqual({
      max_tokens: 2000,
      temperature: 0.7,
    })
  })

  it('sends max_completion_tokens for classic OpenAI models, keeping temperature', () => {
    expect(completionTuning(config('openai', 'gpt-4o'), 2000, 0.7)).toEqual({
      max_completion_tokens: 2000,
      temperature: 0.7,
    })
  })

  it('drops temperature for reasoning models', () => {
    for (const model of ['o1', 'o3-mini', 'o4-mini', 'gpt-5', 'gpt-5-mini']) {
      const tuning = completionTuning(config('openai', model), 2000, 0.7)
      expect(tuning).not.toHaveProperty('temperature')
      expect(tuning).not.toHaveProperty('max_tokens')
    }
  })

  it('gives reasoning models headroom for hidden thinking tokens', () => {
    const tuning = completionTuning(config('openai', 'gpt-5'), 2000, 0.7)
    expect(tuning.max_completion_tokens).toBeGreaterThan(2000)
  })

  it('omits temperature when the caller does not set one', () => {
    expect(completionTuning(config('openai', 'gpt-4o'), 5)).toEqual({
      max_completion_tokens: 5,
    })
    expect(completionTuning(config('anthropic', 'claude-sonnet-4-6'), 5)).toEqual({
      max_tokens: 5,
    })
  })
})
