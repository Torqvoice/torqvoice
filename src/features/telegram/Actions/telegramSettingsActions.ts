"use server";

import crypto from "crypto";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { revalidatePath } from "next/cache";
import {
  ALL_ORG_TELEGRAM_KEYS,
  ORG_TELEGRAM_KEYS,
} from "../Schema/telegramSettingsSchema";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";
import {
  getTelegramBotInfo,
  setTelegramWebhook,
  deleteTelegramWebhook,
  sendTelegramMessage,
} from "@/lib/telegram";
import { requireFeature } from "@/lib/features";

export async function getTelegramSettings() {
  return withAuth(
    async ({ organizationId }) => {
      const settings = await db.appSetting.findMany({
        where: { organizationId, key: { in: ALL_ORG_TELEGRAM_KEYS } },
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

export async function setTelegramSettings(settings: { botToken: string }) {
  return withAuth(
    async ({ userId, organizationId }) => {
      await requireFeature(organizationId, "telegram");

      // Validate bot token by calling getMe
      const botInfo = await getTelegramBotInfo(settings.botToken);

      // Generate webhook secret
      const webhookSecret = crypto.randomUUID();

      // Build webhook URL
      const appUrl =
        process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || "";
      const webhookUrl = `${appUrl}/api/webhooks/telegram/${organizationId}?secret=${webhookSecret}`;

      // Register webhook with Telegram
      await setTelegramWebhook(settings.botToken, webhookUrl, webhookSecret);

      // Save all settings via upsert
      const entries: Record<string, string> = {
        [ORG_TELEGRAM_KEYS.TELEGRAM_BOT_TOKEN]: settings.botToken,
        [ORG_TELEGRAM_KEYS.TELEGRAM_BOT_USERNAME]: botInfo.username,
        [ORG_TELEGRAM_KEYS.TELEGRAM_WEBHOOK_SECRET]: webhookSecret,
      };

      await db.$transaction(
        Object.entries(entries).map(([key, value]) =>
          db.appSetting.upsert({
            where: { organizationId_key: { organizationId, key } },
            update: { value },
            create: { userId, organizationId, key, value },
          }),
        ),
      );

      revalidatePath("/settings/telegram");
      return { botUsername: botInfo.username };
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

export async function testTelegramSend(input: {
  chatId: string;
  message: string;
}) {
  return withAuth(
    async ({ organizationId }) => {
      await requireFeature(organizationId, "telegram");

      if (!input.chatId?.trim()) {
        throw new Error("Please enter a chat ID to send the test message to");
      }

      await sendTelegramMessage(organizationId, {
        chatId: input.chatId.trim(),
        text:
          input.message?.trim() ||
          "Test message from Torqvoice -- your Telegram bot is configured correctly.",
      });

      return { sentTo: input.chatId.trim() };
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

export async function disconnectTelegram() {
  return withAuth(
    async ({ organizationId }) => {
      // Get current bot token to delete webhook
      const tokenSetting = await db.appSetting.findUnique({
        where: {
          organizationId_key: {
            organizationId,
            key: ORG_TELEGRAM_KEYS.TELEGRAM_BOT_TOKEN,
          },
        },
      });

      if (tokenSetting?.value) {
        try {
          await deleteTelegramWebhook(tokenSetting.value);
        } catch (error) {
          // Log but continue — we still want to remove local settings
          console.error("[disconnectTelegram] Failed to delete webhook:", error);
        }
      }

      // Remove all telegram settings
      await db.appSetting.deleteMany({
        where: {
          organizationId,
          key: { in: ALL_ORG_TELEGRAM_KEYS },
        },
      });

      revalidatePath("/settings/telegram");
      return { disconnected: true };
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
