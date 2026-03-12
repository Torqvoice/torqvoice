"use server";

import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { revalidatePath } from "next/cache";
import { ALL_AI_KEYS, AI_KEYS, type AiProvider, type AiModel, getModelCost, formatModelLabel } from "../Schema/aiSettingsSchema";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";

const API_KEY_MASK = "••••••••••••••••";

export async function getAiSettings() {
  return withAuth(
    async ({ organizationId }) => {
      const settings = await db.appSetting.findMany({
        where: { organizationId, key: { in: ALL_AI_KEYS } },
      });
      const map: Record<string, string> = {};
      for (const s of settings) {
        // Never send the actual API key to the client
        if (s.key === AI_KEYS.AI_API_KEY) {
          map[s.key] = s.value ? API_KEY_MASK : "";
        } else {
          map[s.key] = s.value;
        }
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
      // Filter out masked API key — only update if user provided a new one
      const filtered = Object.entries(entries).filter(
        ([key, value]) => !(key === AI_KEYS.AI_API_KEY && value === API_KEY_MASK),
      );
      await db.$transaction(
        filtered.map(([key, value]) =>
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

export async function fetchAiModels(provider: AiProvider) {
  return withAuth(
    async ({ organizationId }) => {
      // Read API key from DB — never accept it from the client
      const setting = await db.appSetting.findUnique({
        where: { organizationId_key: { organizationId, key: AI_KEYS.AI_API_KEY } },
        select: { value: true },
      });
      const apiKey = setting?.value;
      if (!apiKey) throw new Error("API key is not configured");

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
        // Anthropic paginates models — fetch all pages
        let afterId: string | undefined;
        let hasMore = true;
        while (hasMore) {
          const url = new URL("https://api.anthropic.com/v1/models");
          url.searchParams.set("limit", "100");
          if (afterId) url.searchParams.set("after_id", afterId);
          const res = await fetch(url.toString(), {
            headers: {
              "x-api-key": apiKey,
              "anthropic-version": "2023-06-01",
            },
          });
          if (!res.ok) throw new Error("Failed to fetch models. Check your API key.");
          const data = (await res.json()) as {
            data: { id: string; display_name?: string }[];
            has_more?: boolean;
            last_id?: string;
          };
          for (const m of data.data) {
            if (isAnthropicChatModel(m.id)) {
              models.push({
                id: m.id,
                label: m.display_name || formatModelLabel(m.id),
                cost: getModelCost("anthropic", m.id),
              });
            }
          }
          hasMore = data.has_more === true && !!data.last_id;
          afterId = data.last_id;
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
