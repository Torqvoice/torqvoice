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

/**
 * The models an OpenAI key lists in November 2026 that answer a chat request,
 * in the order the dropdown should show them. Ids, aliases and snapshots are
 * the ones on OpenAI's model pages, where each of these has Chat Completions
 * marked as supported.
 */
const OPENAI_CHAT_NEWEST_FIRST = [
  'gpt-6.1-sol',
  'gpt-6.1-terra',
  'gpt-6-astra',
  'gpt-6-sol',
  'gpt-6-luna',
  'gpt-5.6',
  'gpt-5.6-sol',
  'gpt-5.6-terra',
  'gpt-5.6-luna',
  'gpt-5.5',
  'gpt-5.5-2026-04-23',
  'gpt-5.4',
  'gpt-5.4-2026-03-05',
  'gpt-5.4-mini',
  'gpt-5.4-mini-2026-03-17',
  'gpt-5.4-nano',
  'gpt-5.4-nano-2026-03-17',
  'gpt-5.2',
  'gpt-5.2-2025-12-11',
  'gpt-5.1',
  'gpt-5.1-2025-11-13',
  'gpt-5',
  'gpt-5-2025-08-07',
  'gpt-5-mini',
  'gpt-5-mini-2025-08-07',
  'gpt-5-nano',
  'gpt-5-nano-2025-08-07',
  'o3',
  'o3-2025-04-16',
  'gpt-4.1',
  'gpt-4.1-2025-04-14',
  'gpt-4.1-mini',
  'gpt-4.1-mini-2025-04-14',
  'gpt-4o',
  'gpt-4o-2024-11-20',
  'gpt-4o-2024-08-06',
  'gpt-4o-mini',
  'gpt-4o-mini-2024-07-18',
]

/** What the same key lists that a chat request cannot use, by the reason it cannot. */
const OPENAI_NOT_FOR_CHAT = [
  // Images.
  'gpt-image-2.6-sunburst',
  'gpt-image-2.6-flare',
  'gpt-image-2.5-sunburst',
  'gpt-image-2',
  'gpt-image-2-2026-04-21',
  'gpt-image-1.5',
  'gpt-image-1-mini',
  'chatgpt-image-latest',
  // Voice sessions.
  'gpt-live-1',
  'gpt-realtime-2.1',
  'gpt-realtime-2.1-mini',
  'gpt-realtime-2',
  'gpt-realtime-1.5',
  'gpt-realtime-translate',
  'gpt-realtime-whisper',
  'gpt-realtime',
  'gpt-realtime-mini',
  // Sound in, sound out.
  'gpt-audio-1.5',
  'gpt-audio',
  'gpt-audio-mini',
  // Text to speech.
  'tts-1',
  'tts-1-hd',
  'gpt-4o-mini-tts',
  // Speech to text.
  'whisper-1',
  'gpt-transcribe',
  'gpt-live-transcribe',
  'gpt-4o-transcribe',
  'gpt-4o-mini-transcribe',
  'gpt-4o-transcribe-diarize',
  // Answered by the Responses API only.
  'gpt-5.5-pro',
  'gpt-5.5-pro-2026-04-23',
  'gpt-5.4-pro',
  'gpt-5.2-pro',
  'gpt-5-pro',
  'o3-pro',
  'o3-pro-2025-06-10',
  'gpt-5.3-codex',
  'gpt-5.6-cyber',
  'gpt-oss-120b',
  // Embeddings and moderation.
  'text-embedding-3-large',
  'text-embedding-3-small',
  'text-embedding-ada-002',
  'omni-moderation-latest',
  // Retired during 2026, and the kind may come back under a new name.
  'gpt-4o-search-preview',
  'gpt-4o-mini-search-preview',
  'o3-deep-research',
  'o4-mini-deep-research',
  'gpt-5.1-codex-mini',
  'gpt-3.5-turbo-instruct',
]

describe('OpenAI model list', () => {
  it('offers only the models that can answer a chat, newest first', async () => {
    // The vendor returns them in no useful order; alphabetical stands in for that.
    const listed = [...OPENAI_NOT_FOR_CHAT, ...OPENAI_CHAT_NEWEST_FIRST].sort()
    const ctx = context(listing(listed), { apiKey: 'sk-1' })

    const ids = (await listOpenAiModels(ctx)).map((m) => m.value)
    expect(ids).toEqual(OPENAI_CHAT_NEWEST_FIRST)
  })

  it('names the current models the way a workshop would read them', async () => {
    const ctx = context(listing(OPENAI_CHAT_NEWEST_FIRST), { apiKey: 'sk-1' })

    expect((await listOpenAiModels(ctx)).slice(0, 3)).toEqual([
      { value: 'gpt-6.1-sol', label: 'GPT 6.1 Sol' },
      { value: 'gpt-6.1-terra', label: 'GPT 6.1 Terra' },
      { value: 'gpt-6-astra', label: 'GPT 6 Astra' },
    ])
  })

  it('lists the older GPT-4 models newest first: 4o, then Turbo, then the original', async () => {
    const listed = [
      'gpt-4',
      'gpt-4-0613',
      'gpt-4-turbo',
      'gpt-4-turbo-2024-04-09',
      'gpt-4-0125-preview',
      'gpt-4o',
      'gpt-3.5-turbo',
    ]
    const ctx = context(listing(listed), { apiKey: 'sk-1' })

    const ids = (await listOpenAiModels(ctx)).map((m) => m.value)
    expect(ids).toEqual([
      'gpt-4o',
      'gpt-4-0125-preview',
      'gpt-4-turbo',
      'gpt-4-turbo-2024-04-09',
      'gpt-4',
      'gpt-4-0613',
      'gpt-3.5-turbo',
    ])
  })

  it('puts a model released after this was written at the top', async () => {
    // Made-up ids in the vendor's naming. The last one starts like "pro", the
    // Responses-only kind, and is a chat model all the same.
    const listed = ['gpt-5.6-sol', 'gpt-6.1-sol', 'gpt-6.2-terra', 'gpt-7-sol', 'gpt-7-proxima']
    const ctx = context(listing(listed), { apiKey: 'sk-1' })

    const ids = (await listOpenAiModels(ctx)).map((m) => m.value)
    expect(ids).toEqual([
      'gpt-7-proxima',
      'gpt-7-sol',
      'gpt-6.2-terra',
      'gpt-6.1-sol',
      'gpt-5.6-sol',
    ])
  })
})
