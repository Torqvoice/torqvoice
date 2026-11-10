// @vitest-environment node
/**
 * The "Test connection" button on the OpenAI and Anthropic connectors.
 *
 * Listing models proves a key exists. A workshop's OpenAI key did that, the
 * test passed, and every request afterwards failed because the account had
 * no credit. Once a model is chosen the test has to ask that model for
 * something, and say what the provider said when it will not answer.
 *
 * The provider is played at the network: the SDK is the real one, so what
 * these assert is what a workshop reads for a given answer from the vendor.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ConnectorContext } from '@/features/integrations/Lib/types'
import { connector as anthropic } from '@/integrations/anthropic/server'
import { connector as openai } from '@/integrations/openai/server'

vi.mock('@/lib/db', () => ({ db: {} }))

type Provider = (url: string, init?: RequestInit) => Response

/** A saved connection; `listing` is what the model list answers through the connector's own client. */
function connection(
  connectorId: string,
  settings: Record<string, unknown>,
  listing: Response = json(200, { data: [{ id: 'gpt-4.1' }] })
): ConnectorContext {
  const fetch = vi.fn(async (_url: string, _init?: RequestInit) => listing)
  return {
    connection: {
      id: 'c1',
      organizationId: 'org',
      connectorId,
      settings,
      state: {},
      externalAccountId: null,
    },
    credentials: { apiKey: 'sk-test' },
    http: {
      fetch,
      async json<T>(url: string, init?: RequestInit): Promise<T> {
        return (await (await fetch(url, init)).json()) as T
      },
    },
    links: { get: vi.fn(), set: vi.fn(), remove: vi.fn(), remoteIds: vi.fn(), byRemoteId: vi.fn() },
    log: vi.fn(async () => undefined),
    saveState: vi.fn(),
    timezone: 'Europe/Paris',
    appUrl: 'https://app.test',
  }
}

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

/** Stand in for the vendor's API, which completions reach through the SDK. */
function provider(answer: Provider) {
  const calls: { url: string; body: Record<string, unknown> }[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input)
      calls.push({ url, body: JSON.parse(typeof init?.body === 'string' ? init.body : '{}') })
      return answer(url, init)
    })
  )
  return calls
}

/** A completion that stopped at the token cap: thinking used it up, nothing was written. */
const cutOff = (model: string) =>
  json(200, {
    id: 'chatcmpl-1',
    object: 'chat.completion',
    created: 1,
    model,
    choices: [{ index: 0, message: { role: 'assistant', content: '' }, finish_reason: 'length' }],
    usage: { prompt_tokens: 9, completion_tokens: 16, total_tokens: 25 },
  })

/** A refusal in OpenAI's shape. The SDK retries a 429, so it is told not to wait between tries. */
const refusal = (status: number, error: { message: string; type: string; code: string | null }) =>
  json(status, { error: { param: null, ...error } }, { 'retry-after-ms': '1' })

describe('AI connection test', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  describe('OpenAI', () => {
    it('fails with the credit message when the account cannot pay for a completion', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined)
      provider(() =>
        refusal(429, {
          message: 'You exceeded your current quota, please check your plan and billing details.',
          type: 'insufficient_quota',
          code: 'insufficient_quota',
        })
      )

      await expect(openai.test(connection('openai', { model: 'gpt-4.1' }))).resolves.toEqual({
        ok: false,
        message: 'This OpenAI account has no credit left. Add billing at platform.openai.com.',
      })
    })

    it('fails when the key may not use the chosen model, and says so', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined)
      provider(() =>
        refusal(404, {
          message: 'The model `gpt-4.1-nano` does not exist or you do not have access to it.',
          type: 'invalid_request_error',
          code: 'model_not_found',
        })
      )

      await expect(openai.test(connection('openai', { model: 'gpt-4.1-nano' }))).resolves.toEqual({
        ok: false,
        message:
          'This API key has no access to the selected model. Pick another in Settings → Integrations.',
      })
    })

    it('passes on a reply the token cap cut off', async () => {
      const calls = provider(() => cutOff('gpt-5-mini'))

      await expect(openai.test(connection('openai', { model: 'gpt-5-mini' }))).resolves.toEqual({
        ok: true,
      })
      // The model the workshop picked is the one that was asked, and without
      // a temperature, which the reasoning models answer with a 400.
      expect(calls).toHaveLength(1)
      expect(calls[0].url).toBe('https://api.openai.com/v1/chat/completions')
      expect(calls[0].body.model).toBe('gpt-5-mini')
      expect(calls[0].body).not.toHaveProperty('temperature')
    })

    it('passes when the provider reports the cap as an error instead of a short reply', async () => {
      provider(() =>
        refusal(400, {
          message:
            'Could not finish the message because max_tokens or model output limit was reached. Please try again with higher max_tokens.',
          type: 'invalid_request_error',
          code: null,
        })
      )

      await expect(openai.test(connection('openai', { model: 'gpt-5-nano' }))).resolves.toEqual({
        ok: true,
      })
    })

    it('lists models, and asks for no completion, while no model is chosen', async () => {
      const calls = provider(() => cutOff('gpt-4.1'))
      const ctx = connection('openai', {})

      await expect(openai.test(ctx)).resolves.toEqual({ ok: true })
      expect(ctx.http.fetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/models',
        expect.objectContaining({ headers: { Authorization: 'Bearer sk-test' } })
      )
      expect(calls).toHaveLength(0)
    })

    it('still names a rejected key before a model is chosen', async () => {
      provider(() => cutOff('gpt-4.1'))

      await expect(
        openai.test(connection('openai', { model: '  ' }, json(401, { error: {} })))
      ).resolves.toEqual({ ok: false, message: 'OpenAI rejected the key' })
    })
  })

  describe('Anthropic', () => {
    it('fails with what the provider refused the completion for', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined)
      provider(() =>
        refusal(402, {
          message: 'There is an issue with your billing or payment information.',
          type: 'billing_error',
          code: null,
        })
      )

      await expect(
        anthropic.test(connection('anthropic', { model: 'claude-sonnet-4-6' }))
      ).resolves.toEqual({
        ok: false,
        message: 'The AI provider reports no usable credit for this API key.',
      })
    })

    it('passes on a reply the token cap cut off', async () => {
      const calls = provider(() => cutOff('claude-opus-5-5'))

      await expect(
        anthropic.test(connection('anthropic', { model: 'claude-opus-5-5' }))
      ).resolves.toEqual({ ok: true })
      expect(calls).toHaveLength(1)
      expect(calls[0].url).toBe('https://api.anthropic.com/v1/chat/completions')
      expect(calls[0].body.model).toBe('claude-opus-5-5')
      expect(calls[0].body).not.toHaveProperty('temperature')
    })

    it('lists models, and asks for no completion, while no model is chosen', async () => {
      const calls = provider(() => cutOff('claude-opus-5-5'))
      const ctx = connection('anthropic', {})

      await expect(anthropic.test(ctx)).resolves.toEqual({ ok: true })
      expect(ctx.http.fetch).toHaveBeenCalledWith(
        'https://api.anthropic.com/v1/models?limit=1',
        expect.objectContaining({
          headers: expect.objectContaining({ 'x-api-key': 'sk-test' }),
        })
      )
      expect(calls).toHaveLength(0)
    })
  })
})
