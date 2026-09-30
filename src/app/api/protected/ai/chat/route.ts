import { type NextRequest, NextResponse } from 'next/server'
import { getLocale } from 'next-intl/server'
import type OpenAI from 'openai'
import { getAuthContext } from '@/lib/get-auth-context'
import { getCachedMembership } from '@/lib/cached-session'
import {
  hasAllPermissions,
  hasPermission,
  PermissionAction,
  PermissionSubject,
} from '@/lib/permissions'
import { getFeatures } from '@/lib/features'
import { db } from '@/lib/db'
import { completionTuning, createClient, getAiConfig } from '@/lib/ai'
import { describeAiError } from '@/lib/ai-error'
import { localeNames, type Locale } from '@/i18n/config'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { workshopTimeZone } from '@/lib/workshop-timezone'
import { zonedDayKey } from '@/lib/timezone'
import {
  askAiRequestSchema,
  type AskAiStreamEvent,
  CHAT_HISTORY_TURNS,
} from '@/features/ai/Schema/aiChatSchema'
import {
  type AskAiSubject,
  askAiSystemPrompt,
  buildAskAiContext,
} from '@/features/ai/Lib/askAiContext'

export const maxDuration = 120
export const dynamic = 'force-dynamic'

/** Longest answer we ask for. Plenty for a summary, short enough to stay cheap. */
const ANSWER_TOKENS = 1500

function json(status: number, error: string) {
  return NextResponse.json({ error }, { status })
}

/**
 * One turn of a chat about one vehicle or one customer, streamed back as
 * newline-delimited JSON.
 *
 * The record is loaded here by id and organization and handed to the model
 * whole; there are no tools, so the model cannot reach for anything the
 * caller could not open on the page it came from. Nothing is written until
 * the answer has finished: a failed call leaves no half chat behind.
 */
export async function POST(request: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx) return json(401, 'Unauthorized')
  const { organizationId, userId } = ctx

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return json(400, 'Expected a JSON body.')
  }
  const parsed = askAiRequestSchema.safeParse(body)
  if (!parsed.success) return json(400, 'Invalid request.')
  const { subject, chatId, message } = parsed.data

  // The same gate the buttons that open the chat sit behind, checked again
  // here because a URL can be called without a button.
  const features = await getFeatures(organizationId)
  if (!features.ai) return json(403, 'AI is not included in your plan.')

  const membership = ctx.isSuperAdmin ? null : await getCachedMembership(userId)
  const permissions = membership?.customRole?.permissions ?? []
  const subjectPermission =
    subject.type === 'vehicle' ? PermissionSubject.VEHICLES : PermissionSubject.CUSTOMERS
  const allowed =
    ctx.isAdmin ||
    hasAllPermissions(permissions, [
      { action: PermissionAction.READ, subject: PermissionSubject.AI_ASSISTANT },
      { action: PermissionAction.READ, subject: subjectPermission },
    ])
  if (!allowed) return json(403, 'Insufficient permissions')
  // Money follows the work orders permission, which is what the invoices tab
  // on the customer page and the totals on a job already require.
  const showMoney =
    ctx.isAdmin ||
    hasPermission(permissions, {
      action: PermissionAction.READ,
      subject: PermissionSubject.WORK_ORDERS,
    })

  let config: Awaited<ReturnType<typeof getAiConfig>>
  try {
    config = await getAiConfig(organizationId)
  } catch (err) {
    return json(409, err instanceof Error ? err.message : 'AI is not connected.')
  }

  const [settings, timeZone, organization, locale] = await Promise.all([
    db.appSetting.findMany({
      where: {
        organizationId,
        key: { in: [SETTING_KEYS.CURRENCY_CODE, SETTING_KEYS.UNIT_SYSTEM] },
      },
      select: { key: true, value: true },
    }),
    workshopTimeZone(organizationId),
    db.organization.findUnique({ where: { id: organizationId }, select: { name: true } }),
    getLocale() as Promise<Locale>,
  ])
  const setting = (key: string) => settings.find((s) => s.key === key)?.value
  const options = {
    showMoney,
    currencyCode: setting(SETTING_KEYS.CURRENCY_CODE) || 'USD',
    unitSystem: (setting(SETTING_KEYS.UNIT_SYSTEM) === 'metric' ? 'metric' : 'imperial') as
      | 'metric'
      | 'imperial',
    timeZone,
  }

  const context = await buildAskAiContext(organizationId, subject, options)
  if (!context) return json(404, 'Record not found.')

  // An existing chat has to be this user's, in this workshop, about this
  // very record; otherwise a chat id is a way to append to someone else's.
  const existing = chatId
    ? await db.aiChat.findFirst({
        where: {
          id: chatId,
          userId,
          organizationId,
          ...(subject.type === 'vehicle' ? { vehicleId: subject.id } : { customerId: subject.id }),
        },
        select: {
          id: true,
          messages: {
            select: { role: true, content: true },
            orderBy: { createdAt: 'desc' },
            take: CHAT_HISTORY_TURNS * 2,
          },
        },
      })
    : null
  if (chatId && !existing) return json(404, 'Chat not found.')

  const history = (existing?.messages ?? [])
    .reverse()
    .filter(
      (m): m is { role: 'user' | 'assistant'; content: string } =>
        m.role === 'user' || m.role === 'assistant'
    )

  const systemPrompt = askAiSystemPrompt({
    workshopName: organization?.name ?? 'the workshop',
    subject,
    context,
    options,
    today: zonedDayKey(new Date(), timeZone),
    languageName: locale === 'en' ? null : (localeNames[locale] ?? locale),
  })
  const apiMessages: OpenAI.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: message },
  ]

  const client = createClient(config)
  let stream: AsyncIterable<OpenAI.ChatCompletionChunk>
  try {
    stream = await client.chat.completions.create(
      {
        model: config.model,
        messages: apiMessages,
        stream: true,
        ...completionTuning(config, ANSWER_TOKENS, 0.4),
      },
      { signal: request.signal }
    )
  } catch (err) {
    console.error('[ai] ask-ai stream failed to start:', err)
    return json(502, describeAiError(err))
  }

  const encoder = new TextEncoder()
  const send = (controller: ReadableStreamDefaultController<Uint8Array>, event: AskAiStreamEvent) =>
    controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))

  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      let answer = ''
      try {
        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content
          if (!delta) continue
          answer += delta
          send(controller, { t: 'delta', d: delta })
        }
      } catch (err) {
        if (!request.signal.aborted) {
          console.error('[ai] ask-ai stream failed:', err)
          send(controller, { t: 'error', m: describeAiError(err) })
        }
        controller.close()
        return
      }

      if (!answer.trim()) {
        send(controller, { t: 'error', m: 'The AI provider returned an empty answer.' })
        controller.close()
        return
      }

      // Saved only now, so a failed or abandoned call leaves nothing behind.
      try {
        const saved = await persistTurn({
          existingId: existing?.id ?? null,
          userId,
          organizationId,
          subject,
          title: context.title,
          question: message,
          answer,
        })
        send(controller, { t: 'chat', id: saved })
      } catch (err) {
        console.error('[ai] ask-ai could not save the turn:', err)
      }
      send(controller, { t: 'done' })
      controller.close()
    },
  })

  return new Response(readable, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
    },
  })
}

async function persistTurn(input: {
  existingId: string | null
  userId: string
  organizationId: string
  subject: AskAiSubject
  title: string
  question: string
  answer: string
}): Promise<string> {
  const turn = [
    { role: 'user', content: input.question },
    { role: 'assistant', content: input.answer },
  ]
  if (input.existingId) {
    await db.aiChat.update({
      where: { id: input.existingId },
      data: { updatedAt: new Date(), messages: { create: turn } },
    })
    return input.existingId
  }
  const chat = await db.aiChat.create({
    data: {
      title: chatTitle(input.question),
      userId: input.userId,
      organizationId: input.organizationId,
      ...(input.subject.type === 'vehicle'
        ? { vehicleId: input.subject.id }
        : { customerId: input.subject.id }),
      messages: { create: turn },
    },
    select: { id: true },
  })
  return chat.id
}

/** The first question, cut to fit the history list. */
function chatTitle(question: string): string {
  const flat = question.replace(/\s+/g, ' ').trim()
  return flat.length <= 60 ? flat : `${flat.slice(0, 57)}...`
}
