/**
 * The model list behind both AI connectors.
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

export function openAiHeaders(apiKey: string): Record<string, string> {
  return { Authorization: `Bearer ${apiKey}` }
}

export function anthropicHeaders(apiKey: string): Record<string, string> {
  return { 'x-api-key': apiKey, 'anthropic-version': ANTHROPIC_VERSION }
}

/** Chat-capable OpenAI models; the rest of the list is embeddings, audio and images. */
const OPENAI_CHAT_PREFIXES = ['gpt-', 'o1', 'o3', 'o4', 'chatgpt-']

function isOpenAiChatModel(id: string): boolean {
  return OPENAI_CHAT_PREFIXES.some((prefix) => id.startsWith(prefix))
}

/**
 * Sort OpenAI models: newest version first, within a version full > mini >
 * nano. The o-series leads, then GPT-4.x, then GPT-4o, then the rest.
 */
function openAiModelOrder(id: string): number {
  const l = id.toLowerCase()
  if (l.startsWith('o4')) return 100 + (l.includes('mini') ? 1 : 0)
  if (l.startsWith('o3')) return 200 + (l.includes('mini') ? 1 : 0)
  if (l.startsWith('o1')) return 300 + (l.includes('mini') ? 1 : 0)
  if (l.startsWith('gpt-4.1')) return 400 + (l.includes('nano') ? 2 : l.includes('mini') ? 1 : 0)
  if (l.startsWith('gpt-4.5')) return 350 + (l.includes('nano') ? 2 : l.includes('mini') ? 1 : 0)
  if (l.startsWith('gpt-4o')) return 500 + (l.includes('mini') ? 1 : 0)
  if (l.startsWith('gpt-4'))
    return 600 + (l.includes('turbo') ? 0 : 1) + (l.includes('mini') ? 2 : 0)
  if (l.startsWith('chatgpt')) return 700
  return 900
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

/** A model id as something to read in a dropdown: gpt-4.1-mini becomes GPT 4.1 Mini. */
export function formatModelLabel(modelId: string): string {
  return modelId
    .replace(/-(\d{8})$/, '') // strip a date suffix such as -20251001
    .replace(/^gpt-/i, 'GPT-')
    .replace(/^claude-/i, 'Claude ')
    .replace(/^o(\d)/i, 'o$1')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/Gpt/g, 'GPT')
}

export async function listOpenAiModels(ctx: ConnectorContext): Promise<SettingOption[]> {
  const data = await ctx.http.json<{ data: { id: string }[] }>(`${OPENAI_BASE}/models`, {
    headers: openAiHeaders(apiKeyOf(ctx)),
  })
  return data.data
    .filter((m) => isOpenAiChatModel(m.id))
    .sort((a, b) => openAiModelOrder(a.id) - openAiModelOrder(b.id))
    .map((m) => ({ value: m.id, label: formatModelLabel(m.id) }))
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
