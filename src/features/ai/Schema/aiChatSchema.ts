import { z } from 'zod'

/** Longest message the chat accepts from the client, in characters. */
export const MAX_CHAT_MESSAGE_LENGTH = 20000

/** The client sends the whole history each turn; this caps how long it can get. */
export const MAX_CHAT_MESSAGES = 500

export const chatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().max(MAX_CHAT_MESSAGE_LENGTH),
})

export const aiChatInputSchema = z.object({
  chatId: z.string().min(1).max(64).nullable(),
  messages: z.array(chatMessageSchema).max(MAX_CHAT_MESSAGES),
})

export type ChatMessageInput = z.infer<typeof chatMessageSchema>
