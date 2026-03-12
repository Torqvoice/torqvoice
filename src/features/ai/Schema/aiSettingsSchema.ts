export const AI_KEYS = {
  AI_PROVIDER: "ai.provider",
  AI_API_KEY: "ai.apiKey",
  AI_MODEL: "ai.model",
  AI_ENABLED: "ai.enabled",
} as const;

export type AiKey = (typeof AI_KEYS)[keyof typeof AI_KEYS];

export const ALL_AI_KEYS = Object.values(AI_KEYS);

export const AI_PROVIDERS = ["openai", "anthropic"] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

export interface AiModel {
  id: string;
  label: string;
  cost: "high" | "medium" | "low";
}

// Fallback models when API fetch fails (ordered by version, newest first)
export const OPENAI_FALLBACK_MODELS: AiModel[] = [
  { id: "gpt-4.1", label: "GPT-4.1", cost: "medium" },
  { id: "gpt-4.1-mini", label: "GPT-4.1 Mini", cost: "low" },
  { id: "gpt-4.1-nano", label: "GPT-4.1 Nano", cost: "low" },
  { id: "gpt-4o", label: "GPT-4o", cost: "medium" },
  { id: "gpt-4o-mini", label: "GPT-4o Mini", cost: "low" },
];

export const ANTHROPIC_FALLBACK_MODELS: AiModel[] = [
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", cost: "medium" },
  { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5", cost: "low" },
];

/** Classify a model ID into a cost tier */
export function getModelCost(provider: AiProvider, modelId: string): AiModel["cost"] {
  const id = modelId.toLowerCase();

  if (provider === "anthropic") {
    if (id.includes("opus")) return "high";
    if (id.includes("sonnet")) return "medium";
    if (id.includes("haiku")) return "low";
    return "medium";
  }

  // OpenAI
  if (id.includes("o1") || id.includes("o3") || id.includes("o4-mini")) return "high";
  if (id.includes("nano")) return "low";
  if (id.includes("mini")) return "low";
  if (id.startsWith("gpt-4") || id.startsWith("gpt-4.")) return "medium";
  return "medium";
}

/** Build a human-readable label from a model ID */
export function formatModelLabel(modelId: string): string {
  return modelId
    .replace(/-(\d{8})$/, "") // strip date suffix like -20251001
    .replace(/^gpt-/i, "GPT-")
    .replace(/^claude-/i, "Claude ")
    .replace(/^o(\d)/i, "o$1")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/Gpt/g, "GPT");
}
