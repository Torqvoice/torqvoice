'use server'

import { withAuth } from '@/lib/with-auth'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { db } from '@/lib/db'
import { askAiSubjectSchema } from '../Schema/aiChatSchema'
import type { AskAiSubject } from '../Lib/askAiContext'

/**
 * The saved conversations behind the Ask AI sheet. The answers themselves
 * are streamed by /api/protected/ai/chat; these only list, reopen and delete
 * what that route saved. Every query is keyed on the caller, their
 * workshop and the one record the sheet was opened from.
 */

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ChatSummary {
  id: string
  title: string
  updatedAt: Date
}

const READ_CHATS = [{ action: PermissionAction.READ, subject: PermissionSubject.AI_ASSISTANT }]

function subjectWhere(subject: AskAiSubject) {
  return subject.type === 'vehicle' ? { vehicleId: subject.id } : { customerId: subject.id }
}

/** This user's chats about one record, newest first. */
export async function listAskAiChats(rawSubject: AskAiSubject) {
  return withAuth(
    async ({ userId, organizationId }) => {
      const subject = askAiSubjectSchema.parse(rawSubject)
      return db.aiChat.findMany({
        where: { userId, organizationId, ...subjectWhere(subject) },
        select: { id: true, title: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
        take: 30,
      }) as Promise<ChatSummary[]>
    },
    { requiredPermissions: READ_CHATS }
  )
}

/** The turns of one chat, oldest first. Empty when the chat is not the caller's. */
export async function loadAskAiChat(chatId: string, rawSubject: AskAiSubject) {
  return withAuth(
    async ({ userId, organizationId }) => {
      const subject = askAiSubjectSchema.parse(rawSubject)
      const chat = await db.aiChat.findFirst({
        where: { id: chatId, userId, organizationId, ...subjectWhere(subject) },
        select: {
          messages: {
            select: { role: true, content: true },
            orderBy: { createdAt: 'asc' },
          },
        },
      })
      return (chat?.messages ?? []) as ChatMessage[]
    },
    { requiredPermissions: READ_CHATS }
  )
}

export async function deleteAskAiChat(chatId: string) {
  return withAuth(
    async ({ userId, organizationId }) => {
      await db.aiChat.deleteMany({ where: { id: chatId, userId, organizationId } })
      return true
    },
    { requiredPermissions: READ_CHATS }
  )
}
