/**
 * The model list behind the AI connectors.
 *
 * OpenAI and Anthropic each publish everything the key can reach, embeddings
 * and image models included, so the list is filtered to the chat models the
 * app actually calls and sorted newest first: a workshop picking a model
 * should find this year's at the top rather than hunting for it among
 * whatever order the vendor returned.
 */

import type { ConnectorContext, SettingOption } from '@/features/integrations/Lib/types'

export const OPENAI_BASE = 'https://api.openai.com/v1'
export const ANTHROPIC_BASE = 'https://api.anthropic.com/v1'
export const ANTHROPIC_VERSION = '2023-06-01'

/** The key as the connect form stored it. */
export function apiKeyOf(ctx: ConnectorContext): string {
  const key = ctx.credentials.apiKey
  return typeof key === 'string' ? key.trim() : ''
}

/** The model picked on the connection page; empty until the workshop has chosen one. */
export function chosenModelOf(ctx: ConnectorContext): string {
  const model = ctx.connection.settings.model
  return typeof model === 'string' ? model.trim() : ''
}

/** Bearer auth, or nothing at all: a local server often has no key to check. */
export function openAiHeaders(apiKey: string): Record<string, string> {
  return apiKey ? { Authorization: `Bearer ${apiKey}` } : {}
}

/**
 * The API root of an OpenAI-compatible server as the connect form stored it,
 * without a trailing slash so `${base}/models` lands where the vendor put it:
 * Open WebUI serves under /api, most others under /v1.
 */
export function compatibleBaseUrlOf(ctx: ConnectorContext): string {
  const url = ctx.credentials.baseUrl
  return typeof url === 'string' ? normalizeBaseUrl(url) : ''
}

export function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '')
}

export function anthropicHeaders(apiKey: string): Record<string, string> {
  return { 'x-api-key': apiKey, 'anthropic-version': ANTHROPIC_VERSION }
}

/** Chat-capable OpenAI models; the rest of the list is embeddings, audio and images. */
const OPENAI_CHAT_PREFIXES = ['gpt-', 'o1', 'o3', 'o4', 'chatgpt-']

/**
 * Words in an id that carries a chat prefix and still cannot answer the app,
 * which sends text and photos to Chat Completions. A workshop that picked one
 * of these would get an error from every AI feature.
 */
const OPENAI_NOT_CHAT = [
  // Served by another endpoint: images, speech, transcription, voice sessions.
  'image',
  'tts',
  'transcribe',
  'realtime',
  'live',
  // Chat Completions takes these, but only for sound in and out or a web search.
  'audio',
  'search',
  // Answered by the Responses API only.
  'pro',
  'deep-research',
  'codex',
  'oss',
  // Security research models for approved organisations, Responses only until GPT-6.
  'cyber',
  'daybreak',
  // The legacy Completions endpoint.
  'instruct',
]

function isOpenAiChatModel(id: string): boolean {
  if (!OPENAI_CHAT_PREFIXES.some((prefix) => id.startsWith(prefix))) return false
  // Whole words between hyphens, so "pro" does not take a model named Proxima with it.
  return !OPENAI_NOT_CHAT.some((word) => `${id}-`.includes(`-${word}-`))
}

/**
 * Size within a version. The GPT-5.6 naming put Sol where the unsuffixed
 * model was, Terra where mini was and Luna where nano was, with Astra above.
 */
function openAiModelSize(id: string): number {
  const words = id.split('-')
  if (words.includes('astra')) return 0
  if (words.includes('terra') || words.includes('mini')) return 2
  if (words.includes('luna') || words.includes('nano')) return 3
  return 1
}

/**
 * Where an OpenAI model sorts, lowest first. The version is read out of the
 * id rather than looked up, so a model released next month lands at the top
 * without a change here: GPT-5 and later, then the o-series that GPT-5
 * replaced, then GPT-4.x. Within a version the larger model leads, and a
 * dated snapshot follows the alias it pins, the latest snapshot first.
 */
function openAiModelRank(id: string): number[] {
  const l = id.toLowerCase()
  const gpt = l.match(/^gpt-(\d+)(?:\.(\d+))?(o?)(?=-|$)/)
  const oSeries = l.match(/^o(\d+)(?=-|$)/)
  const major = Number.parseInt(gpt?.[1] ?? oSeries?.[1] ?? '0', 10)
  const minor = Number.parseInt(gpt?.[2] ?? '0', 10)
  const line = gpt ? (major >= 5 ? 0 : 2) : oSeries ? 1 : 3
  // Within GPT-4: GPT-4o, then GPT-4 Turbo (its previews included), then the
  // original GPT-4. GPT-4.1 came after all three and has its own minor.
  const words = l.split('-')
  const turbo = major === 4 && (words.includes('turbo') || words.includes('preview'))
  const generation = gpt?.[3] ? 0 : turbo ? 1 : 2
  const snapshot = l.match(/-(\d{4})-(\d{2})-(\d{2})$/)
  const age = snapshot ? 1e8 - Number.parseInt(snapshot.slice(1).join(''), 10) : 0
  return [line, -major, -minor, generation, openAiModelSize(l), age]
}

function compareOpenAiModels(a: string, b: string): number {
  const rankA = openAiModelRank(a)
  const rankB = openAiModelRank(b)
  for (let i = 0; i < rankA.length; i++) {
    if (rankA[i] !== rankB[i]) return rankA[i] - rankB[i]
  }
  return a.localeCompare(b)
}

/** Sort Anthropic models: newest version first, within a version opus > sonnet > haiku. */
function anthropicModelOrder(id: string): number {
  const l = id.toLowerCase()
  const versionMatch = l.match(/(\d+)[.\-]?(\d*)/)
  const major = versionMatch ? Number.parseInt(versionMatch[1], 10) : 0
  const minor = versionMatch?.[2] ? Number.parseInt(versionMatch[2], 10) : 0
  const versionScore = (10 - major) * 100 + (10 - minor) * 10
  const tierScore = l.includes('opus') ? 0 : l.includes('sonnet') ? 1 : l.includes('haiku') ? 2 : 3
  return versionScore + tierScore
}

/**
 * A model id as something to read in a dropdown: gpt-4.1-mini becomes
 * GPT 4.1 Mini, o4-mini becomes o4 Mini. A date on the end, which OpenAI
 * writes either as -20251001 or as -2026-03-17, is left off.
 */
export function formatModelLabel(modelId: string): string {
  return (
    modelId
      .replace(/-(?:\d{8}|\d{4}-\d{2}-\d{2})$/, '')
      .replace(/-/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .replace(/gpt/gi, 'GPT')
      // OpenAI writes its o-series in lower case
      .replace(/^O(\d)/, 'o$1')
  )
}

async function fetchModelIds(ctx: ConnectorContext, base: string): Promise<string[]> {
  const data = await ctx.http.json<{ data?: { id?: unknown }[] }>(`${base}/models`, {
    headers: openAiHeaders(apiKeyOf(ctx)),
  })
  return (data?.data ?? [])
    .map((m) => m?.id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
}

export async function listOpenAiModels(ctx: ConnectorContext): Promise<SettingOption[]> {
  const ids = await fetchModelIds(ctx, OPENAI_BASE)
  return ids
    .filter(isOpenAiChatModel)
    .sort(compareOpenAiModels)
    .map((id) => ({ value: id, label: formatModelLabel(id) }))
}

/**
 * Every model a compatible server lists, by its own name. The OpenAI filter
 * would drop all of them (qwen3:8b, llama3.1:8b) and the label rewriting
 * would mangle them, and a server that lists a model is offering it: what
 * the model can do is for the workshop running it to know.
 */
export async function listCompatibleModels(ctx: ConnectorContext): Promise<SettingOption[]> {
  const ids = await fetchModelIds(ctx, compatibleBaseUrlOf(ctx))
  return [...new Set(ids)]
    .sort((a, b) => a.localeCompare(b))
    .map((id) => ({ value: id, label: id }))
}

/** Anthropic pages its model list, twenty at a time by default. */
export async function listAnthropicModels(ctx: ConnectorContext): Promise<SettingOption[]> {
  const models: { id: string; display_name?: string }[] = []
  let afterId: string | undefined
  for (;;) {
    const url = new URL(`${ANTHROPIC_BASE}/models`)
    url.searchParams.set('limit', '100')
    if (afterId) url.searchParams.set('after_id', afterId)
    const page = await ctx.http.json<{
      data: { id: string; display_name?: string }[]
      has_more?: boolean
      last_id?: string
    }>(url.toString(), { headers: anthropicHeaders(apiKeyOf(ctx)) })
    models.push(...page.data.filter((m) => m.id.includes('claude')))
    if (page.has_more !== true || !page.last_id) break
    afterId = page.last_id
  }
  return models
    .sort((a, b) => anthropicModelOrder(a.id) - anthropicModelOrder(b.id))
    .map((m) => ({ value: m.id, label: m.display_name || formatModelLabel(m.id) }))
}
