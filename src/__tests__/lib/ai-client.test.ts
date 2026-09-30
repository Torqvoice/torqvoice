// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ db: {} }))

import { createClient } from '@/lib/ai'

/**
 * Every provider gets its address spelled out. The SDK reads OPENAI_BASE_URL
 * from the environment when none is given, which once sent completions to a
 * server the connector's key check had never looked at.
 */
describe('createClient', () => {
  it('addresses each provider explicitly, whatever the environment says', () => {
    vi.stubEnv('OPENAI_BASE_URL', 'http://somewhere-else:9999/v1')
    try {
      expect(createClient({ provider: 'openai', apiKey: 'k', model: 'gpt-4o' }).baseURL).toBe(
        'https://api.openai.com/v1'
      )
      expect(
        createClient({ provider: 'anthropic', apiKey: 'k', model: 'claude-sonnet-4-6' }).baseURL
      ).toBe('https://api.anthropic.com/v1/')
      expect(
        createClient({
          provider: 'openai-compatible',
          apiKey: '',
          model: 'qwen3:8b',
          baseUrl: 'http://open-webui:8080/api/',
        }).baseURL
      ).toBe('http://open-webui:8080/api')
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('starts the SDK for a keyless server', () => {
    const client = createClient({
      provider: 'openai-compatible',
      apiKey: '',
      model: 'qwen3:8b',
      baseUrl: 'http://ollama:11434/v1',
    })
    expect(client.apiKey).toBe('none')
  })
})
