import { z } from 'zod'

/** Longest message the chat accepts from the client, in characters. */
export const MAX_CHAT_MESSAGE_LENGTH = 20000

/** How many earlier turns of a chat go back to the model with each question. */
export const CHAT_HISTORY_TURNS = 30

/** The workshop chat's client sends the whole history each turn; this caps how long it can get. */
export const MAX_CHAT_MESSAGES = 500

export const chatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().max(MAX_CHAT_MESSAGE_LENGTH),
})

/** One turn of the workshop-wide chat at /ai, which answers by querying the database. */
export const aiChatInputSchema = z.object({
  chatId: z.string().min(1).max(64).nullable(),
  messages: z.array(chatMessageSchema).max(MAX_CHAT_MESSAGES),
})

export type ChatMessageInput = z.infer<typeof chatMessageSchema>

export const askAiSubjectSchema = z.object({
  type: z.enum(['vehicle', 'customer']),
  id: z.string().min(1).max(64),
})

/**
 * One question about one record. The client sends only the new message and
 * the chat it belongs to; the earlier turns are read back from the database,
 * so a client cannot put words in the assistant's mouth.
 */
export const askAiRequestSchema = z.object({
  subject: askAiSubjectSchema,
  chatId: z.string().min(1).max(64).nullable(),
  message: z.string().trim().min(1).max(MAX_CHAT_MESSAGE_LENGTH),
})

export type AskAiRequest = z.infer<typeof askAiRequestSchema>

/**
 * The lines the chat route streams back, one JSON object per line.
 * `chat` names the conversation the answer is saved to, `delta` carries a
 * piece of the answer, `done` closes it, `error` explains why it stopped.
 */
export type AskAiStreamEvent =
  | { t: 'chat'; id: string }
  | { t: 'delta'; d: string }
  | { t: 'done' }
  | { t: 'error'; m: string }
