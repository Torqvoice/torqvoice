export const ORG_TELEGRAM_KEYS = {
  TELEGRAM_BOT_TOKEN: "telegram.botToken",
  TELEGRAM_BOT_USERNAME: "telegram.botUsername",
  TELEGRAM_WEBHOOK_SECRET: "telegram.webhookSecret",
} as const;

export type OrgTelegramKey = (typeof ORG_TELEGRAM_KEYS)[keyof typeof ORG_TELEGRAM_KEYS];
export const ALL_ORG_TELEGRAM_KEYS = Object.values(ORG_TELEGRAM_KEYS);
