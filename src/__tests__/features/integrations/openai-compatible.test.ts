import { describe, expect, it, vi } from 'vitest'
import type { ConnectorContext } from '@/features/integrations/Lib/types'
import {
  listCompatibleModels,
  listOpenAiModels,
  normalizeBaseUrl,
  openAiHeaders,
} from '@/integrations/ai/models'
import { connector } from '@/integrations/openai-compatible/server'

vi.mock('@/lib/db', () => ({ db: {} }))

/** What Ollama lists next to what OpenAI does: none of the local names carry a vendor prefix. */
const LOCAL_MODELS = ['qwen3:8b', 'llama3.1:8b', 'gemma3:12b', 'nomic-embed-text']
const OPENAI_MODELS = ['gpt-4.1-mini', 'text-embedding-3-small', 'o4-mini', 'whisper-1']

function context(
  fetchImpl: (url: string, init?: RequestInit) => Promise<Response>,
  credentials: Record<string, unknown> = {}
): ConnectorContext {
  const fetch = vi.fn(fetchImpl)
  const http = {
    fetch,
    async json<T>(url: string, init?: RequestInit): Promise<T> {
      const res = await fetch(url, init)
      return (await res.json()) as T
    },
  }
  return {
    connection: {
      id: 'c1',
      organizationId: 'org',
      connectorId: 'openai-compatible',
      settings: {},
      state: {},
      externalAccountId: null,
    },
    credentials,
    http,
    links: { get: vi.fn(), set: vi.fn(), remove: vi.fn(), remoteIds: vi.fn(), byRemoteId: vi.fn() },
    log: vi.fn(async () => undefined),
    saveState: vi.fn(),
    timezone: 'Europe/Oslo',
    appUrl: 'https://app.test',
  }
}

const listing = (ids: string[]) => async () =>
  new Response(JSON.stringify({ data: ids.map((id) => ({ id })) }), { status: 200 })

describe('OpenAI-compatible connector', () => {
  it('lists every model the server reports, by its own name, in one order', async () => {
    const ctx = context(listing(LOCAL_MODELS), { baseUrl: 'http://ollama:11434/v1/' })

    await expect(listCompatibleModels(ctx)).resolves.toEqual([
      { value: 'gemma3:12b', label: 'gemma3:12b' },
      { value: 'llama3.1:8b', label: 'llama3.1:8b' },
      { value: 'nomic-embed-text', label: 'nomic-embed-text' },
      { value: 'qwen3:8b', label: 'qwen3:8b' },
    ])
    // The trailing slash the form may carry does not double up in the path.
    expect(ctx.http.fetch).toHaveBeenCalledWith(
      'http://ollama:11434/v1/models',
      expect.objectContaining({ headers: {} })
    )
  })

  it('still filters OpenAI itself down to its chat models', async () => {
    const ctx = context(listing(OPENAI_MODELS), { apiKey: 'sk-1' })

    const ids = (await listOpenAiModels(ctx)).map((m) => m.value)
    expect(ids).toEqual(['o4-mini', 'gpt-4.1-mini'])
  })

  it('sends a bearer token only when there is a key', () => {
    expect(openAiHeaders('sk-1')).toEqual({ Authorization: 'Bearer sk-1' })
    expect(openAiHeaders('')).toEqual({})
    expect(normalizeBaseUrl(' http://open-webui:8080/api// ')).toBe('http://open-webui:8080/api')
  })

  it('passes the check on any 2xx from /models, key or no key', async () => {
    const ctx = context(listing(LOCAL_MODELS), { baseUrl: 'http://open-webui:8080/api' })
    await expect(connector.test(ctx)).resolves.toEqual({ ok: true })
    expect(ctx.http.fetch).toHaveBeenCalledWith(
      'http://open-webui:8080/api/models',
      expect.anything()
    )
  })

  it('says which of the URL and the key is wrong', async () => {
    const answer = (status: number) => async () => new Response('', { status })

    await expect(
      connector.test(context(answer(401), { baseUrl: 'http://x/v1', apiKey: 'bad' }))
    ).resolves.toMatchObject({ ok: false, message: 'The server rejected the API key' })
    await expect(
      connector.test(context(answer(401), { baseUrl: 'http://x/v1' }))
    ).resolves.toMatchObject({ ok: false, message: 'The server wants an API key' })
    await expect(
      connector.test(context(answer(404), { baseUrl: 'http://x:8080' }))
    ).resolves.toMatchObject({ ok: false, message: expect.stringContaining('/models') })
    await expect(
      connector.test(context(answer(200), { baseUrl: 'ollama:11434/v1' }))
    ).resolves.toMatchObject({ ok: false, message: expect.stringContaining('http://') })
    await expect(
      connector.test(
        context(
          async () => {
            throw new Error('ECONNREFUSED')
          },
          { baseUrl: 'http://ollama:11434/v1' }
        )
      )
    ).resolves.toMatchObject({
      ok: false,
      message: 'Could not reach ollama:11434. Check the base URL.',
    })
  })
})
