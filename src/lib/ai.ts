import 'server-only'
import { aiSetup } from '@/features/integrations/Lib/ai'
import { localeNames, type Locale } from '@/i18n/config'
import OpenAI from 'openai'
import { describeAiError } from '@/lib/ai-error'

interface AiConfig {
  provider: string
  apiKey: string
  model: string
}

/**
 * The AI vendor this workshop sends to. Either an active connection in the
 * integrations catalog, or the settings a workshop saved before AI moved
 * there, adopted into one on this first call.
 */
export async function getAiConfig(organizationId: string): Promise<AiConfig> {
  const setup = await aiSetup(organizationId)

  if (!setup) {
    throw new Error(
      'AI is not connected. Connect OpenAI or Anthropic in Settings → Integrations.'
    )
  }

  return { provider: setup.provider, apiKey: setup.apiKey, model: setup.model }
}

export function createClient(config: AiConfig): OpenAI {
  if (config.provider === 'anthropic') {
    return new OpenAI({
      apiKey: config.apiKey,
      baseURL: 'https://api.anthropic.com/v1/',
      defaultHeaders: {
        'anthropic-version': '2023-06-01',
      },
    })
  }
  return new OpenAI({ apiKey: config.apiKey })
}

/**
 * OpenAI's reasoning models (the o-series and the GPT-5 family) reject the
 * classic `max_tokens` parameter with a 400 and only accept
 * `max_completion_tokens`; they likewise refuse any temperature other than the
 * default. Every current OpenAI chat model accepts `max_completion_tokens`, so
 * it is used across the board there. The Anthropic compatibility endpoint
 * keeps the classic parameter.
 *
 * Reasoning models spend billed-but-hidden thinking tokens inside the same
 * cap before producing a visible answer, so they get headroom on top of the
 * requested answer budget; without it the reply comes back truncated or empty.
 */
const REASONING_HEADROOM = 4000

function isReasoningModel(model: string): boolean {
  return /^(o\d|gpt-5)/i.test(model)
}

export function completionTuning(
  config: AiConfig,
  maxTokens: number,
  temperature?: number
): { max_tokens?: number; max_completion_tokens?: number; temperature?: number } {
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
