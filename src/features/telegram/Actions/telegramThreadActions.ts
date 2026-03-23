"use server";

import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { PermissionAction, PermissionSubject } from "@/lib/permissions";

export async function getRecentTelegramThreads(
  offset: number = 0,
  limit: number = 50,
) {
  return withAuth(
    async ({ organizationId }) => {
      const customers = await db.customer.findMany({
        where: {
          organizationId,
          telegramMessages: { some: {} },
        },
        select: {
          id: true,
          name: true,
          telegramChatId: true,
          telegramMessages: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              id: true,
              body: true,
              direction: true,
              status: true,
              createdAt: true,
            },
          },
        },
        orderBy: {
          telegramMessages: { _count: "desc" },
        },
        skip: offset,
        take: limit + 1,
      });

      const filtered = customers.filter(
        (c) => c.telegramMessages.length > 0,
      );
      const hasMore = filtered.length > limit;
      const items = hasMore ? filtered.slice(0, limit) : filtered;

      const threads = items
        .map((c) => ({
          customerId: c.id,
          customerName: c.name,
          telegramChatId: c.telegramChatId,
          lastMessage: c.telegramMessages[0],
        }))
        .sort(
          (a, b) =>
            new Date(b.lastMessage.createdAt).getTime() -
            new Date(a.lastMessage.createdAt).getTime(),
        );

      return { threads, hasMore };
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
