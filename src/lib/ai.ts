import "server-only";
import { db } from "@/lib/db";
import { AI_KEYS } from "@/features/ai/Schema/aiSettingsSchema";
import { localeNames, type Locale } from "@/i18n/config";
import OpenAI from "openai";

interface AiConfig {
  provider: string;
  apiKey: string;
  model: string;
}

export async function getAiConfig(organizationId: string): Promise<AiConfig> {
  const settings = await db.appSetting.findMany({
    where: {
      organizationId,
      key: {
        in: [
          AI_KEYS.AI_ENABLED,
          AI_KEYS.AI_PROVIDER,
          AI_KEYS.AI_API_KEY,
          AI_KEYS.AI_MODEL,
        ],
      },
    },
  });

  const map = new Map(settings.map((s) => [s.key, s.value]));

  if (map.get(AI_KEYS.AI_ENABLED) !== "true") {
    throw new Error("AI is not enabled. Configure it in Settings → AI.");
  }

  const provider = map.get(AI_KEYS.AI_PROVIDER);
  const apiKey = map.get(AI_KEYS.AI_API_KEY);
  const model = map.get(AI_KEYS.AI_MODEL);

  if (!provider || !apiKey || !model) {
    throw new Error(
      "AI is not fully configured. Set provider, API key, and model in Settings → AI.",
    );
  }

  return { provider, apiKey, model };
}

export function createClient(config: AiConfig): OpenAI {
  if (config.provider === "anthropic") {
    return new OpenAI({
      apiKey: config.apiKey,
      baseURL: "https://api.anthropic.com/v1/",
      defaultHeaders: {
        "anthropic-version": "2023-06-01",
      },
    });
  }
  return new OpenAI({ apiKey: config.apiKey });
}

function languageInstruction(locale: Locale): string {
  if (locale === "en") return "";
  const name = localeNames[locale] || locale;
  return `\n\nIMPORTANT: You MUST respond entirely in ${name}.`;
}

async function chatCompletion(
  organizationId: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const config = await getAiConfig(organizationId);
  const client = createClient(config);

  const response = await client.chat.completions.create({
    model: config.model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.7,
    max_tokens: 2000,
  });

  return response.choices[0]?.message?.content ?? "";
}

// ─── AI Feature Functions ────────────────────────────────────────────────────

export interface ServiceContext {
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: number;
  licensePlate?: string | null;
  serviceType: string;
  serviceTitle: string;
  parts: { name: string; quantity: number }[];
  labor: { description: string; hours: number }[];
}

export async function generateServiceDescription(
  organizationId: string,
  context: ServiceContext,
  locale: Locale = "en",
): Promise<string> {
  const systemPrompt = `You are a professional automotive service writer. Generate a clear, professional service description for a customer-facing invoice. Be concise but thorough. Do not include pricing. Write in plain text, no markdown.${languageInstruction(locale)}`;

  const partsStr =
    context.parts.length > 0
      ? context.parts.map((p) => `- ${p.name} (qty: ${p.quantity})`).join("\n")
      : "No parts listed";

  const laborStr =
    context.labor.length > 0
      ? context.labor
          .map((l) => `- ${l.description} (${l.hours}h)`)
          .join("\n")
      : "No labor listed";

  const userPrompt = `Vehicle: ${context.vehicleYear} ${context.vehicleMake} ${context.vehicleModel}${context.licensePlate ? ` (${context.licensePlate})` : ""}
Service type: ${context.serviceType}
Title: ${context.serviceTitle}

Parts used:
${partsStr}

Labor performed:
${laborStr}

Write a professional service description and diagnostic notes for the invoice.`;

  return chatCompletion(organizationId, systemPrompt, userPrompt);
}

export interface ServiceHistoryRecord {
  title: string;
  description: string | null;
  serviceDate: Date | null;
  type: string;
  cost: number;
  mileage: number | null;
}

export async function summarizeServiceHistory(
  organizationId: string,
  vehicle: { make: string; model: string; year: number; licensePlate?: string | null },
  records: ServiceHistoryRecord[],
  locale: Locale = "en",
): Promise<string> {
  const systemPrompt = `You are an automotive service advisor. Summarize a vehicle's complete service history in a concise, useful format. Highlight major work, recurring issues, and predict likely upcoming maintenance needs. Write in plain text, no markdown headers — use simple line breaks and dashes for structure.${languageInstruction(locale)}`;

  const recordsStr = records
    .map(
      (r) =>
        `- ${r.serviceDate ? new Date(r.serviceDate).toISOString().slice(0, 10) : "Unknown date"}: ${r.title} (${r.type}) — Cost: ${r.cost}${r.mileage ? `, Mileage: ${r.mileage}` : ""}${r.description ? `\n  Notes: ${r.description}` : ""}`,
    )
    .join("\n");

  const userPrompt = `Vehicle: ${vehicle.year} ${vehicle.make} ${vehicle.model}${vehicle.licensePlate ? ` (${vehicle.licensePlate})` : ""}

Service history (${records.length} records):
${recordsStr || "No service records found."}

Provide a concise summary including:
- Overview of the vehicle's service history
- Major work performed
- Any recurring issues or patterns
- Predicted upcoming maintenance needs
- Predicted upcoming maintenance needs`;

  return chatCompletion(organizationId, systemPrompt, userPrompt);
}

export async function getCommonIssues(
  organizationId: string,
  vehicle: { make: string; model: string; year: number },
  locale: Locale = "en",
): Promise<string> {
  const systemPrompt = `You are an expert automotive technician. Return a JSON array of exactly 5 critical known issues for the requested vehicle, sorted by severity and cost (highest first). Only serious, well-documented problems.

Return ONLY valid JSON, no markdown, no explanation. Use this exact schema:
[{"title":"Issue name","description":"1-2 sentence explanation","cost":"X,XXX–X,XXX","risk":"safety|engine|transmission|electrical|other","severity":5}]

severity is 1-5 based on how widely reported the issue is (5 = extremely common/well-documented, affects majority of vehicles; 1 = rare but critical).${languageInstruction(locale)}`;

  const userPrompt = `What are the 5 most critical and common issues with the ${vehicle.year} ${vehicle.make} ${vehicle.model}? Return JSON only.`;

  return chatCompletion(organizationId, systemPrompt, userPrompt);
}

export async function testAiConnection(
  organizationId: string,
): Promise<boolean> {
  const config = await getAiConfig(organizationId);
  const client = createClient(config);

  const response = await client.chat.completions.create({
    model: config.model,
    messages: [{ role: "user", content: "Say OK" }],
    max_tokens: 5,
  });

  return !!response.choices[0]?.message?.content;
}
