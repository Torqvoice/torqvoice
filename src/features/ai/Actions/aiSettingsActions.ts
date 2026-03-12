"use server";

import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { revalidatePath } from "next/cache";
import { ALL_AI_KEYS, type AiProvider, type AiModel, getModelCost, formatModelLabel } from "../Schema/aiSettingsSchema";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";

export async function getAiSettings() {
  return withAuth(
    async ({ organizationId }) => {
      const settings = await db.appSetting.findMany({
        where: { organizationId, key: { in: ALL_AI_KEYS } },
      });
      const map: Record<string, string> = {};
      for (const s of settings) {
        map[s.key] = s.value;
      }
      return map;
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.SETTINGS },
      ],
    },
  );
}

export async function setAiSettings(entries: Record<string, string>) {
  return withAuth(
    async ({ userId, organizationId }) => {
      await db.$transaction(
        Object.entries(entries).map(([key, value]) =>
          db.appSetting.upsert({
            where: { organizationId_key: { organizationId, key } },
            update: { value },
            create: { userId, organizationId, key, value },
          }),
        ),
      );
      revalidatePath("/settings/ai");
      return true;
    },
    {
      requiredPermissions: [
        {
          action: PermissionAction.UPDATE,
          subject: PermissionSubject.SETTINGS,
        },
      ],
    },
  );
}

// Chat-capable model prefixes for OpenAI (filter out embeddings, whisper, dall-e, etc.)
const OPENAI_CHAT_PREFIXES = ["gpt-", "o1", "o3", "o4", "chatgpt-"];

function isOpenAiChatModel(id: string): boolean {
  return OPENAI_CHAT_PREFIXES.some((prefix) => id.startsWith(prefix));
}

// Anthropic model patterns to include
function isAnthropicChatModel(id: string): boolean {
  return id.includes("claude");
}

/**
 * Sort OpenAI models: newest version first, within same version: full > mini > nano.
 * o-series models come first (o4 > o3 > o1), then GPT-4.x, then GPT-4o, then older.
 */
function openAiModelOrder(id: string): number {
  const l = id.toLowerCase();
  // o-series: o4, o3, o1 (newest first)
  if (l.startsWith("o4")) return 100 + (l.includes("mini") ? 1 : 0);
  if (l.startsWith("o3")) return 200 + (l.includes("mini") ? 1 : 0);
  if (l.startsWith("o1")) return 300 + (l.includes("mini") ? 1 : 0);
  // GPT-4.1
  if (l.startsWith("gpt-4.1")) return 400 + (l.includes("nano") ? 2 : l.includes("mini") ? 1 : 0);
  // GPT-4.5
  if (l.startsWith("gpt-4.5")) return 350 + (l.includes("nano") ? 2 : l.includes("mini") ? 1 : 0);
  // GPT-4o
  if (l.startsWith("gpt-4o")) return 500 + (l.includes("mini") ? 1 : 0);
  // GPT-4 (non-turbo / turbo)
  if (l.startsWith("gpt-4")) return 600 + (l.includes("turbo") ? 0 : 1) + (l.includes("mini") ? 2 : 0);
  // chatgpt-4o
  if (l.startsWith("chatgpt")) return 700;
  // Everything else
  return 900;
}

/**
 * Sort Anthropic models: newest version first, within same version: opus > sonnet > haiku.
 */
function anthropicModelOrder(id: string): number {
  const l = id.toLowerCase();
  // Extract version: claude-4, claude-3.5, claude-3, etc.
  const versionMatch = l.match(/(\d+)[\.\-]?(\d*)/);
  const major = versionMatch ? parseInt(versionMatch[1]) : 0;
  const minor = versionMatch && versionMatch[2] ? parseInt(versionMatch[2]) : 0;
  // Higher version = lower order number (sorts first)
  const versionScore = (10 - major) * 100 + (10 - minor) * 10;
  // Tier within version
  const tierScore = l.includes("opus") ? 0 : l.includes("sonnet") ? 1 : l.includes("haiku") ? 2 : 3;
  return versionScore + tierScore;
}

export async function fetchAiModels(provider: AiProvider, apiKey: string) {
  return withAuth(
    async () => {
      if (!apiKey) throw new Error("API key is required");

      const models: AiModel[] = [];

      if (provider === "openai") {
        const res = await fetch("https://api.openai.com/v1/models", {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (!res.ok) throw new Error("Failed to fetch models. Check your API key.");
        const data = (await res.json()) as { data: { id: string }[] };
        for (const m of data.data) {
          if (isOpenAiChatModel(m.id)) {
            models.push({
              id: m.id,
              label: formatModelLabel(m.id),
              cost: getModelCost("openai", m.id),
            });
          }
        }
      } else {
        const res = await fetch("https://api.anthropic.com/v1/models?limit=100", {
          headers: {
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
        });
        if (!res.ok) throw new Error("Failed to fetch models. Check your API key.");
        const data = (await res.json()) as { data: { id: string; display_name?: string }[] };
        for (const m of data.data) {
          if (isAnthropicChatModel(m.id)) {
            models.push({
              id: m.id,
              label: m.display_name || formatModelLabel(m.id),
              cost: getModelCost("anthropic", m.id),
            });
          }
        }
      }

      // Sort by model version (newest first) within each provider
      if (provider === "openai") {
        models.sort((a, b) => openAiModelOrder(a.id) - openAiModelOrder(b.id));
      } else {
        models.sort((a, b) => anthropicModelOrder(a.id) - anthropicModelOrder(b.id));
      }

      return models;
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.SETTINGS },
      ],
    },
  );
}
