"use server";

import { db } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";

export async function getNotifications() {
  return withAuth(async ({ organizationId, role }) => {
    const isAdminOrOwner = role === "owner" || role === "admin" || role === "super_admin";
    if (!isAdminOrOwner) return { notifications: [], unreadCount: 0 };

    const [notifications, unreadCount] = await Promise.all([
      db.notification.findMany({
        where: { organizationId },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      db.notification.count({
        where: { organizationId, read: false },
      }),
    ]);

    return { notifications, unreadCount };
  });
}

export async function markNotificationRead(id: string) {
  return withAuth(async ({ organizationId }) => {
    await db.notification.updateMany({
      where: { id, organizationId },
      data: { read: true },
    });
    return { success: true };
  });
}

export async function markAllNotificationsRead() {
  return withAuth(async ({ organizationId }) => {
    await db.notification.updateMany({
      where: { organizationId, read: false },
      data: { read: true },
    });
    return { success: true };
  });
}

export async function deleteNotification(id: string) {
  return withAuth(async ({ organizationId }) => {
    await db.notification.deleteMany({
      where: { id, organizationId },
    });
    return { success: true };
  });
}
