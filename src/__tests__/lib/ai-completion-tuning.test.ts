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
  it('keeps max_tokens and temperature for the Claude models that take one', () => {
    for (const model of [
      'claude-sonnet-4-6',
      'claude-haiku-4-5',
      'claude-haiku-4-5-20251001',
      'claude-opus-4-1-20250805',
      'claude-sonnet-4-20250514',
      'claude-3-5-sonnet-20241022',
    ]) {
      expect(completionTuning(config('anthropic', model), 2000, 0.7), model).toEqual({
        max_tokens: 2000,
        temperature: 0.7,
      })
    }
  })

  it('sends no temperature to newer Claude models, which answer it with a 400', () => {
    // Reproduced on claude-haiku-5-5: "temperature is deprecated for this model",
    // which failed registration scans and Ask AI.
    for (const model of [
      'claude-haiku-5-5',
      'claude-sonnet-5-5',
      'claude-opus-5-5',
      'claude-opus-4-7',
      'claude-opus-4-8',
      'claude-fable-5-1',
      'claude-sonnet-6',
    ]) {
      const tuning = completionTuning(config('anthropic', model), 2000, 0.7)
      expect(tuning, model).not.toHaveProperty('temperature')
      // They think inside the same cap, so the answer gets headroom on top.
      expect(tuning.max_tokens, model).toBeGreaterThan(2000)
    }
  })

  it('keeps the classic parameters for an OpenAI-compatible server', () => {
    // Ollama and LocalAI read max_tokens only; the model name says nothing
    // about which vendor's rules apply.
    expect(completionTuning(config('openai-compatible', 'o3-local'), 2000, 0.7)).toEqual({
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

  it('treats GPT-6 and later as reasoning models', () => {
    // OpenAI's GPT-6 guide: remove temperature when reasoning effort is not none.
    for (const model of ['gpt-6-astra', 'gpt-6.1-sol', 'gpt-6-luna', 'gpt-7', 'gpt-10-mini']) {
      const tuning = completionTuning(config('openai', model), 2000, 0.7)
      expect(tuning, model).toEqual({ max_completion_tokens: 2000 + 4000 })
    }
  })

  it('keeps GPT-5 a reasoning model and GPT-4.x a classic one', () => {
    expect(completionTuning(config('openai', 'gpt-5-mini'), 2000, 0.7)).toEqual({
      max_completion_tokens: 6000,
    })
    expect(completionTuning(config('openai', 'gpt-5.6-terra'), 2000, 0.7)).toEqual({
      max_completion_tokens: 6000,
    })
    for (const model of ['gpt-4.1', 'gpt-4.1-mini', 'gpt-4o', 'gpt-4', 'gpt-3.5-turbo']) {
      expect(completionTuning(config('openai', model), 2000, 0.7), model).toEqual({
        max_completion_tokens: 2000,
        temperature: 0.7,
      })
    }
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
