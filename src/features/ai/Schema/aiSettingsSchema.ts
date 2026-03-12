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

export const OPENAI_MODELS = [
  { id: "gpt-4o", label: "GPT-4o" },
  { id: "gpt-4o-mini", label: "GPT-4o Mini" },
  { id: "gpt-4.1", label: "GPT-4.1" },
  { id: "gpt-4.1-mini", label: "GPT-4.1 Mini" },
  { id: "gpt-4.1-nano", label: "GPT-4.1 Nano" },
] as const;

export const ANTHROPIC_MODELS = [
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
  { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
] as const;
