import 'server-only'
import { aiSetup } from '@/features/integrations/Lib/ai'
import { localeNames, type Locale } from '@/i18n/config'
import OpenAI from 'openai'
import { describeAiError, isAccountLimitError } from '@/lib/ai-error'
import {
  ANTHROPIC_BASE,
  ANTHROPIC_VERSION,
  OPENAI_BASE,
  normalizeBaseUrl,
} from '@/integrations/ai/models'

interface AiConfig {
  provider: string
  apiKey: string
  model: string
  /** API root of an OpenAI-compatible server, for the connector that takes one. */
  baseUrl?: string
}

/**
 * The AI vendor this workshop sends to. Either an active connection in the
 * integrations catalog, or the settings a workshop saved before AI moved
 * there, adopted into one on this first call.
 */
export async function getAiConfig(organizationId: string): Promise<AiConfig> {
  const setup = await aiSetup(organizationId)

  if (!setup) {
    throw new Error('AI is not connected. Connect an AI provider in Settings → Integrations.')
  }

  return {
    provider: setup.provider,
    apiKey: setup.apiKey,
    model: setup.model,
    ...(setup.baseUrl && { baseUrl: setup.baseUrl }),
  }
}

/**
 * Every provider gets its address spelled out. Left blank, the SDK would
 * read OPENAI_BASE_URL from the environment on its own, and completions
 * would quietly go somewhere the connector's key check never looked.
 */
export function createClient(config: AiConfig): OpenAI {
  if (config.provider === 'anthropic') {
    return new OpenAI({
      apiKey: config.apiKey,
      baseURL: `${ANTHROPIC_BASE}/`,
      defaultHeaders: {
        'anthropic-version': ANTHROPIC_VERSION,
      },
    })
  }
  if (config.provider === 'openai-compatible') {
    return new OpenAI({
      // The SDK refuses to start without a key; a server that wants none
      // ignores whatever the header says.
      apiKey: config.apiKey || 'none',
      baseURL: normalizeBaseUrl(config.baseUrl ?? ''),
    })
  }
  return new OpenAI({ apiKey: config.apiKey, baseURL: OPENAI_BASE })
}

/**
 * OpenAI's reasoning models (the o-series and the GPT-5 family) reject the
 * classic `max_tokens` parameter with a 400 and only accept
 * `max_completion_tokens`; they likewise refuse any temperature other than the
 * default. Every current OpenAI chat model accepts `max_completion_tokens`, so
 * it is used across the board there. The Anthropic compatibility endpoint
 * keeps the classic parameter, and so does a self-hosted OpenAI-compatible
 * server: Ollama and LocalAI still only read `max_tokens`.
 *
 * Reasoning models spend billed-but-hidden thinking tokens inside the same
 * cap before producing a visible answer, so they get headroom on top of the
 * requested answer budget; without it the reply comes back truncated or empty.
 */
const REASONING_HEADROOM = 4000

function isReasoningModel(model: string): boolean {
  return /^(o\d|gpt-5)/i.test(model)
}

/**
 * The Claude models that still take a temperature: the 3.x line and Claude 4
 * up to 4.6, with or without a date in the id. Claude 4.7 and every later
 * model (the 5 family, Fable, whatever comes next) answer a temperature with
 * a 400, so it is only sent to the models listed here. Those later models
 * also think before they answer, inside the same token cap, so they get the
 * same headroom as OpenAI's reasoning models.
 */
function isLegacyClaude(model: string): boolean {
  return /^claude-(?:[23]|instant)|^claude-(?:opus|sonnet|haiku)-4(?:-[0-6])?(?:-\d{8})?$/i.test(
    model
  )
}

export function completionTuning(
  config: AiConfig,
  maxTokens: number,
  temperature?: number
): { max_tokens?: number; max_completion_tokens?: number; temperature?: number } {
  if (config.provider === 'anthropic' && !isLegacyClaude(config.model)) {
    return { max_tokens: maxTokens + REASONING_HEADROOM }
  }
  if (config.provider !== 'openai') {
    return { max_tokens: maxTokens, ...(temperature !== undefined && { temperature }) }
  }
  const reasoning = isReasoningModel(config.model)
  return {
    max_completion_tokens: reasoning ? maxTokens + REASONING_HEADROOM : maxTokens,
    ...(temperature !== undefined && !reasoning && { temperature }),
  }
}

function languageInstruction(locale: Locale): string {
  if (locale === 'en') return ''
  const name = localeNames[locale] || locale
  return `\n\nIMPORTANT: You MUST respond entirely in ${name}.`
}

async function chatCompletion(
  organizationId: string,
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const config = await getAiConfig(organizationId)
  const client = createClient(config)

  try {
    const response = await client.chat.completions.create({
      model: config.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      ...completionTuning(config, 2000, 0.7),
    })

    return response.choices[0]?.message?.content ?? ''
  } catch (error) {
    console.error('[ai] chat completion failed:', error)
    throw new Error(describeAiError(error))
  }
}

export async function visionCompletion(
  organizationId: string,
  systemPrompt: string,
  userText: string,
  imageUrls: string | string[]
): Promise<string> {
  const config = await getAiConfig(organizationId)
  const client = createClient(config)

  const urls = Array.isArray(imageUrls) ? imageUrls : [imageUrls]
  const content: Array<
    { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }
  > = [
    { type: 'text', text: userText },
    ...urls.map((url) => ({ type: 'image_url' as const, image_url: { url } })),
  ]

  try {
    const response = await client.chat.completions.create({
      model: config.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content },
      ],
      ...completionTuning(config, 1000, 0.3),
    })

    return response.choices[0]?.message?.content ?? ''
  } catch (error) {
    console.error('[ai] vision completion failed:', error)
    throw new Error(describeAiError(error))
  }
}

// ─── AI Feature Functions ────────────────────────────────────────────────────

export interface ServiceContext {
  vehicleMake: string | null
  vehicleModel: string | null
  vehicleYear: number | null
  licensePlate?: string | null
  serviceType: string
  serviceTitle: string
  parts: { name: string; quantity: number }[]
  labor: { description: string; hours: number }[]
}

export async function generateServiceDescription(
  organizationId: string,
  context: ServiceContext,
  locale: Locale = 'en'
): Promise<string> {
  const systemPrompt = `You are a professional automotive service writer. Generate a clear, professional service description for a customer-facing invoice. Be concise but thorough. Do not include pricing. Write in plain text, no markdown.${languageInstruction(locale)}`

  const partsStr =
    context.parts.length > 0
      ? context.parts.map((p) => `- ${p.name} (qty: ${p.quantity})`).join('\n')
      : 'No parts listed'

  const laborStr =
    context.labor.length > 0
      ? context.labor.map((l) => `- ${l.description} (${l.hours}h)`).join('\n')
      : 'No labor listed'

  const vehicleStr = context.vehicleMake
    ? `${context.vehicleYear} ${context.vehicleMake} ${context.vehicleModel}${context.licensePlate ? ` (${context.licensePlate})` : ''}`
    : 'None (parts-only sale, no vehicle)'

  const userPrompt = `Vehicle: ${vehicleStr}
Service type: ${context.serviceType}
Title: ${context.serviceTitle}

Parts used:
${partsStr}

Labor performed:
${laborStr}

Write a professional service description and diagnostic notes for the invoice.`

  return chatCompletion(organizationId, systemPrompt, userPrompt)
}

export interface ServiceHistoryRecord {
  title: string
  description: string | null
  serviceDate: Date | null
  startDateTime?: Date | null
  type: string
  cost: number
  mileage: number | null
}

export async function summarizeServiceHistory(
  organizationId: string,
  vehicle: { make: string; model: string; year: number; licensePlate?: string | null },
  records: ServiceHistoryRecord[],
  locale: Locale = 'en'
): Promise<string> {
  const systemPrompt = `You are an automotive service advisor. Summarize a vehicle's complete service history as structured JSON.

Return ONLY valid JSON, no markdown, no explanation. Use this exact schema:
{"overview":"1-2 sentence general condition summary","majorWork":[{"title":"Work title","date":"YYYY-MM-DD or null","cost":0}],"recurringIssues":[{"title":"Issue name","description":"Brief explanation of the pattern"}],"upcomingMaintenance":[{"item":"Maintenance item","urgency":"high|medium|low","reason":"Why it's needed"}]}

majorWork: list the 3-5 most significant services performed (most recent first).
recurringIssues: list any patterns or repeated problems with title and description (empty array if none).
upcomingMaintenance: predict 2-4 likely upcoming needs based on mileage, age, and service history.${languageInstruction(locale)}`

  const recordsStr = records
    .map(
      (r) =>
        `- ${r.serviceDate ? new Date(r.startDateTime ?? r.serviceDate).toISOString().slice(0, 10) : 'Unknown date'}: ${r.title} (${r.type}) — Cost: ${r.cost}${r.mileage ? `, Mileage: ${r.mileage}` : ''}${r.description ? `\n  Notes: ${r.description}` : ''}`
    )
    .join('\n')

  const userPrompt = `Vehicle: ${vehicle.year} ${vehicle.make} ${vehicle.model}${vehicle.licensePlate ? ` (${vehicle.licensePlate})` : ''}

Service history (${records.length} records):
${recordsStr || 'No service records found.'}

Return JSON only.`

  return chatCompletion(organizationId, systemPrompt, userPrompt)
}

export async function getCommonIssues(
  organizationId: string,
  vehicle: { make: string; model: string; year: number },
  locale: Locale = 'en'
): Promise<string> {
  const systemPrompt = `You are an expert automotive technician. Return a JSON array of exactly 5 critical known issues for the requested vehicle, sorted by severity and cost (highest first). Only serious, well-documented problems.

Return ONLY valid JSON, no markdown, no explanation. Use this exact schema:
[{"title":"Issue name","description":"1-2 sentence explanation","cost":"X,XXX–X,XXX","risk":"safety|engine|transmission|electrical|other","severity":5}]

severity is 1-5 based on how widely reported the issue is (5 = extremely common/well-documented, affects majority of vehicles; 1 = rare but critical).${languageInstruction(locale)}`

  const userPrompt = `What are the 5 most critical and common issues with the ${vehicle.year} ${vehicle.make} ${vehicle.model}? Return JSON only.`

  return chatCompletion(organizationId, systemPrompt, userPrompt)
}

/**
 * The answer budget of a connection test. The reply is never read, so this
 * is the smallest cap no model turns down: OpenAI's Responses API refuses
 * one under 16 outright, and a cap of 1 made its GPT-5 models fail other
 * tools' health checks. `completionTuning` adds the thinking headroom on top
 * for the models that need it, as it does for a real request. The cap is a
 * ceiling; the test costs the few tokens of a one-word reply.
 */
const PROBE_TOKENS = 16

/**
 * OpenAI's GPT-5 family answers a cap that ran out before the reply was
 * whole with a 400 where the other models return a cut-off reply. Either way
 * the key was accepted, the account could pay and the model ran.
 */
function cutOffByTokenCap(error: unknown): boolean {
  return (
    error instanceof OpenAI.APIError &&
    error.status === 400 &&
    /max_tokens or model output limit was reached/i.test(error.message)
  )
}

/** How long a connection test waits on the model before it gives up. */
const PROBE_TIMEOUT_MS = 30_000

/**
 * A failure that says nothing about the key: the provider was busy, down or
 * slow, or never answered. A real rate limit is one of these; an account
 * that cannot pay is not, though it arrives under the same status.
 */
function providerTrouble(error: unknown): boolean {
  if (!(error instanceof OpenAI.APIError)) return false
  if (error.status === undefined || error.status >= 500) return true
  return error.status === 429 && !isAccountLimitError(error)
}

/**
 * One tiny completion on the model the workshop chose, for a connector's
 * connection test. Listing models proves the key exists; only a completion
 * proves the account has credit and the key may use that model, and without
 * it a test passed on a connection where every request then failed. It goes
 * out the way real requests do, and a failure is worded the way theirs is.
 *
 * Any reply passes, an empty or cut-off one included: what it says is not
 * the question. No temperature is sent, because several models refuse one.
 *
 * It is asked once and not for long. The SDK would otherwise try a refusal
 * three times and wait as long as the provider told it to, with somebody
 * watching a spinner. And a failed test switches the connection off, so when
 * the provider was merely busy the answer is `inconclusive`: the caller
 * falls back to the check it had before rather than turn off an AI
 * connection that works.
 */
export async function probeAiModel(
  config: AiConfig
): Promise<{ ok: boolean; message?: string; inconclusive?: boolean }> {
  const client = createClient(config)
  try {
    await client.chat.completions.create(
      {
        model: config.model,
        messages: [{ role: 'user', content: 'Reply with OK.' }],
        ...completionTuning(config, PROBE_TOKENS),
      },
      { maxRetries: 0, timeout: PROBE_TIMEOUT_MS }
    )
    return { ok: true }
  } catch (error) {
    if (cutOffByTokenCap(error)) return { ok: true }
    console.error('[ai] connection test failed:', error)
    return {
      ok: false,
      message: describeAiError(error),
      ...(providerTrouble(error) && { inconclusive: true }),
    }
  }
}

export async function testAiConnection(organizationId: string): Promise<boolean> {
  const config = await getAiConfig(organizationId)
  const client = createClient(config)

  const response = await client.chat.completions.create({
    model: config.model,
    messages: [{ role: 'user', content: 'Say OK' }],
    ...completionTuning(config, 5),
  })

  return !!response.choices[0]?.message?.content
}
