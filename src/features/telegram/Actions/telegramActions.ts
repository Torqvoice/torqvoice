"use server";

import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { sendTelegramMessage } from "@/lib/telegram";
import { requireFeature } from "@/lib/features";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";
import { demoGuard } from "@/lib/demo";

export async function sendTelegramToCustomer(input: {
  customerId: string;
  body: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
}) {
  return withAuth(
    async ({ organizationId }) => {
      demoGuard();
      await requireFeature(organizationId, "telegram");

      const customer = await db.customer.findFirst({
        where: { id: input.customerId, organizationId },
        select: { id: true, telegramChatId: true, name: true },
      });

      if (!customer) throw new Error("Customer not found");
      if (!customer.telegramChatId) {
        throw new Error("Customer has no Telegram chat linked");
      }

      // Create the message record first
      const message = await db.telegramMessage.create({
        data: {
          direction: "outbound",
          chatId: customer.telegramChatId,
          body: input.body,
          status: "queued",
          organizationId,
          customerId: customer.id,
          relatedEntityType: input.relatedEntityType,
          relatedEntityId: input.relatedEntityId,
        },
      });

      try {
        const result = await sendTelegramMessage(organizationId, {
          chatId: customer.telegramChatId,
          text: input.body,
        });

        await db.telegramMessage.update({
          where: { id: message.id },
          data: {
            status: "sent",
            telegramMessageId: String(result.messageId),
          },
        });

        return {
          id: message.id,
          status: "sent" as const,
          customerName: customer.name,
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";

        await db.telegramMessage.update({
          where: { id: message.id },
          data: { status: "failed", errorMessage },
        });

        throw new Error(`Failed to send Telegram message: ${errorMessage}`);
      }
    },
    {
      requiredPermissions: [
        {
          action: PermissionAction.UPDATE,
          subject: PermissionSubject.CUSTOMERS,
        },
      ],
      audit: ({ result }) => ({
        action: "telegram.send",
        entity: "TelegramMessage",
        entityId: result.id,
        message: `Sent Telegram message to ${result.customerName}`,
        metadata: { messageId: result.id },
      }),
    },
  );
}

export async function getTelegramConversation(
  customerId: string,
  cursor?: string,
  limit: number = 50,
) {
  return withAuth(
    async ({ organizationId }) => {
      const messages = await db.telegramMessage.findMany({
        where: {
          organizationId,
          customerId,
        },
        orderBy: { createdAt: "desc" },
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: {
          id: true,
          direction: true,
          body: true,
          status: true,
          createdAt: true,
          chatId: true,
        },
      });

      const hasMore = messages.length > limit;
      const items = hasMore ? messages.slice(0, limit) : messages;

      return {
        messages: items.reverse(),
        nextCursor: hasMore ? items[items.length - 1]?.id : null,
      };
    },
    {
      requiredPermissions: [
        {
          action: PermissionAction.READ,
          subject: PermissionSubject.CUSTOMERS,
        },
      ],
    },
  );
}

export async function deleteTelegramMessage(messageId: string) {
  return withAuth(
    async ({ organizationId }) => {
      const message = await db.telegramMessage.findFirst({
        where: { id: messageId, organizationId },
      });
      if (!message) throw new Error("Message not found");

      await db.telegramMessage.delete({ where: { id: messageId } });
      return { deleted: true };
    },
    {
      requiredPermissions: [
        {
          action: PermissionAction.DELETE,
          subject: PermissionSubject.CUSTOMERS,
        },
      ],
    },
  );
}

export async function deleteTelegramConversation(customerId: string) {
  return withAuth(
    async ({ organizationId }) => {
      const customer = await db.customer.findFirst({
        where: { id: customerId, organizationId },
        select: { id: true },
      });
      if (!customer) throw new Error("Customer not found");

      const { count } = await db.telegramMessage.deleteMany({
        where: { organizationId, customerId },
      });

      return { deleted: count };
    },
    {
      requiredPermissions: [
        {
          action: PermissionAction.DELETE,
          subject: PermissionSubject.CUSTOMERS,
        },
      ],
    },
  );
}

// getRecentTelegramThreads is in telegramThreadActions.ts to keep this file under 200 lines
