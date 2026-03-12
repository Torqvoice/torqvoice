"use server";

import { withAuth } from "@/lib/with-auth";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";
import { getAiConfig, createClient } from "@/lib/ai";
import { getLocale } from "next-intl/server";
import { localeNames, type Locale } from "@/i18n/config";
import { workshopTools, executeTool, DB_SCHEMA } from "../tools/workshop-tools";
import { db } from "@/lib/db";
import type OpenAI from "openai";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatSummary {
  id: string;
  title: string;
  updatedAt: Date;
}

const MAX_TOOL_ROUNDS = 5;

function buildSystemPrompt(locale: Locale): string {
  const langNote =
    locale !== "en"
      ? `\n\nIMPORTANT: You MUST respond entirely in ${localeNames[locale] || locale}.`
      : "";

  return `You are a helpful AI assistant for an automotive workshop management system called TorqVoice. You can query the workshop database using the run_sql_query tool.

${DB_SCHEMA}

Guidelines:
- Write PostgreSQL SELECT queries to answer user questions
- Be concise and direct in your answers
- Format data in easy-to-read lists or tables when returning multiple items
- When showing financial data, include currency amounts
- If a query returns no results, suggest alternative searches
- You can run multiple queries if needed to answer a question
- Never make up data — only report what the queries return
- You can ONLY read data — if asked to modify data, explain that you cannot
- Always double-quote camelCase column names in SQL
- Do NOT add organization filters — they are applied automatically
- Keep queries efficient: use LIMIT, avoid SELECT * on large tables${langNote}`;
}

/** Generate a short title from the first user message */
function generateTitle(content: string): string {
  const trimmed = content.trim();
  if (trimmed.length <= 50) return trimmed;
  return trimmed.slice(0, 47) + "...";
}

// ─── Chat CRUD ──────────────────────────────────────────────────────────────

/** List all chats for the current user/org */
export async function listAiChats() {
  return withAuth(
    async ({ userId, organizationId }) => {
      const chats = await db.aiChat.findMany({
        where: { userId, organizationId },
        select: { id: true, title: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
        take: 50,
      });
      return chats;
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.AI_ASSISTANT },
      ],
    },
  );
}

/** Load messages for a specific chat */
export async function loadAiChat(chatId: string) {
  return withAuth(
    async ({ userId, organizationId }) => {
      const chat = await db.aiChat.findFirst({
        where: { id: chatId, userId, organizationId },
        include: {
          messages: {
            select: { role: true, content: true },
            orderBy: { createdAt: "asc" },
          },
        },
      });
      if (!chat) throw new Error("Chat not found");
      return chat.messages as ChatMessage[];
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.AI_ASSISTANT },
      ],
    },
  );
}

/** Delete a chat */
export async function deleteAiChat(chatId: string) {
  return withAuth(
    async ({ userId, organizationId }) => {
      await db.aiChat.deleteMany({
        where: { id: chatId, userId, organizationId },
      });
      return true;
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.AI_ASSISTANT },
      ],
    },
  );
}

// ─── Chat with AI ───────────────────────────────────────────────────────────

export async function aiChat(chatId: string | null, messages: ChatMessage[]) {
  return withAuth(
    async ({ userId, organizationId }) => {
      const locale = (await getLocale()) as Locale;
      const config = await getAiConfig(organizationId);
      const client = createClient(config);

      const systemPrompt = buildSystemPrompt(locale);

      const apiMessages: OpenAI.ChatCompletionMessageParam[] = [
        { role: "system", content: systemPrompt },
        ...messages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      ];

      // Tool-calling loop
      let rounds = 0;
      while (rounds < MAX_TOOL_ROUNDS) {
        rounds++;

        const response = await client.chat.completions.create({
          model: config.model,
          messages: apiMessages,
          tools: workshopTools,
          temperature: 0.3,
          max_tokens: 3000,
        });

        const choice = response.choices[0];
        if (!choice) throw new Error("No response from AI");

        const message = choice.message;

        // If no tool calls, we have the final response
        if (!message.tool_calls || message.tool_calls.length === 0) {
          const assistantContent = message.content || "";

          // Persist to database
          const lastUserMsg = messages[messages.length - 1];
          if (lastUserMsg) {
            let currentChatId = chatId;

            if (!currentChatId) {
              // Create new chat with title from first user message
              const firstUserMsg = messages.find((m) => m.role === "user");
              const chat = await db.aiChat.create({
                data: {
                  title: generateTitle(firstUserMsg?.content || "New chat"),
                  userId,
                  organizationId,
                },
              });
              currentChatId = chat.id;

              // Save all previous messages if this is a new chat
              for (const msg of messages.slice(0, -1)) {
                await db.aiChatMessage.create({
                  data: { chatId: currentChatId, role: msg.role, content: msg.content },
                });
              }
            }

            // Save the latest user message and assistant response
            await db.aiChatMessage.createMany({
              data: [
                { chatId: currentChatId, role: lastUserMsg.role, content: lastUserMsg.content },
                { chatId: currentChatId, role: "assistant", content: assistantContent },
              ],
            });

            // Update chat timestamp
            await db.aiChat.update({
              where: { id: currentChatId },
              data: { updatedAt: new Date() },
            });

            return { content: assistantContent, chatId: currentChatId };
          }

          return { content: assistantContent, chatId };
        }

        // Add assistant message with tool calls to history
        apiMessages.push(message);

        // Execute each tool call and add results
        for (const toolCall of message.tool_calls) {
          if (toolCall.type !== "function") continue;
          const fn = toolCall.function;
          const args = JSON.parse(fn.arguments || "{}");
          const result = await executeTool(
            fn.name,
            args,
            organizationId,
          );

          apiMessages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: result,
          });
        }
      }

      // If we hit the limit, do one final call without tools
      const finalResponse = await client.chat.completions.create({
        model: config.model,
        messages: apiMessages,
        temperature: 0.3,
        max_tokens: 3000,
      });

      const assistantContent = finalResponse.choices[0]?.message?.content || "";

      // Persist final response
      const lastUserMsg = messages[messages.length - 1];
      if (lastUserMsg) {
        let currentChatId = chatId;
        if (!currentChatId) {
          const firstUserMsg = messages.find((m) => m.role === "user");
          const chat = await db.aiChat.create({
            data: {
              title: generateTitle(firstUserMsg?.content || "New chat"),
              userId,
              organizationId,
            },
          });
          currentChatId = chat.id;
          for (const msg of messages.slice(0, -1)) {
            await db.aiChatMessage.create({
              data: { chatId: currentChatId, role: msg.role, content: msg.content },
            });
          }
        }
        await db.aiChatMessage.createMany({
          data: [
            { chatId: currentChatId, role: lastUserMsg.role, content: lastUserMsg.content },
            { chatId: currentChatId, role: "assistant", content: assistantContent },
          ],
        });
        await db.aiChat.update({
          where: { id: currentChatId },
          data: { updatedAt: new Date() },
        });
        return { content: assistantContent, chatId: currentChatId };
      }

      return { content: assistantContent, chatId };
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.AI_ASSISTANT },
      ],
    },
  );
}
