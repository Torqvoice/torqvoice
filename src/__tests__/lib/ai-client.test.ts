// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ db: {} }))

import {
  AI_REQUEST_TIMEOUT_MS,
  createClient,
  MAX_RETRY_AFTER_MS,
  SELF_HOSTED_TIMEOUT_MS,
} from '@/lib/ai'
import { formatModelLabel } from '@/integrations/ai/models'

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

/**
 * Somebody waits on every AI request with a spinner. The SDK's defaults were
 * a ten minute timeout, two retries, and a sleep for as long as the provider's
 * Retry-After asked, so a rate-limited account could hold a button busy for
 * minutes before anything was said.
 */
describe('AI request limits', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const ASK = { model: 'gpt-4o', messages: [{ role: 'user' as const, content: 'Hi' }] }

  function reply(status: number, headers: Record<string, string>, body: unknown) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json', ...headers },
    })
  }

  const RATE_LIMITED = {
    error: { message: 'Rate limit reached', type: 'requests', code: 'rate_limit_exceeded' },
  }
  const ANSWER = {
    id: 'c1',
    object: 'chat.completion',
    created: 0,
    model: 'gpt-4o',
    choices: [{ index: 0, message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' }],
  }

  it('answers at once when the provider asks for a long wait', async () => {
    const fetchMock = vi.fn(async () => reply(429, { 'retry-after': '600' }, RATE_LIMITED))
    vi.stubGlobal('fetch', fetchMock)
    const client = createClient({ provider: 'openai', apiKey: 'k', model: 'gpt-4o' })

    const started = Date.now()
    await expect(client.chat.completions.create(ASK)).rejects.toMatchObject({ status: 429 })
    expect(Date.now() - started).toBeLessThan(MAX_RETRY_AFTER_MS)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('tries once more after a short wait the provider asked for', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reply(503, { 'retry-after-ms': '10' }, { error: { message: 'busy' } }))
      .mockResolvedValueOnce(reply(200, {}, ANSWER))
    vi.stubGlobal('fetch', fetchMock)
    const client = createClient({ provider: 'openai', apiKey: 'k', model: 'gpt-4o' })

    const answer = await client.chat.completions.create(ASK)
    expect(answer.choices[0]?.message.content).toBe('OK')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('stops after one retry when the provider keeps failing', async () => {
    const fetchMock = vi.fn(async () =>
      reply(500, { 'retry-after-ms': '10' }, { error: { message: 'down' } })
    )
    vi.stubGlobal('fetch', fetchMock)
    const client = createClient({ provider: 'anthropic', apiKey: 'k', model: 'claude-x' })

    await expect(client.chat.completions.create(ASK)).rejects.toMatchObject({ status: 500 })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('waits minutes at most, longer only for a self-hosted server', () => {
    const openai = createClient({ provider: 'openai', apiKey: 'k', model: 'gpt-4o' })
    expect(openai.timeout).toBe(AI_REQUEST_TIMEOUT_MS)
    expect(openai.maxRetries).toBe(1)
    const local = createClient({
      provider: 'openai-compatible',
      apiKey: '',
      model: 'qwen3:8b',
      baseUrl: 'http://ollama:11434/v1',
    })
    expect(local.timeout).toBe(SELF_HOSTED_TIMEOUT_MS)
  })
})

describe('formatModelLabel', () => {
  it('reads the way the provider writes it', () => {
    expect(formatModelLabel('o3')).toBe('o3')
    expect(formatModelLabel('o4-mini')).toBe('o4 Mini')
    expect(formatModelLabel('gpt-4.1-mini')).toBe('GPT 4.1 Mini')
    expect(formatModelLabel('chatgpt-4o-latest')).toBe('ChatGPT 4o Latest')
  })

  it('leaves off a date in either of the forms OpenAI uses', () => {
    expect(formatModelLabel('gpt-5.4-mini-2026-03-17')).toBe('GPT 5.4 Mini')
    expect(formatModelLabel('gpt-4o-20240806')).toBe('GPT 4o')
  })
})
