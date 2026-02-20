import { db } from "@/lib/db";
import { notificationBus } from "@/lib/notification-bus";

type NotifyInput = {
  organizationId: string;
  type: string;
  title: string;
  message: string;
  entityType: string;
  entityId: string;
  entityUrl: string;
};

export async function notify(input: NotifyInput) {
  try {
    const notification = await db.notification.create({
      data: {
        type: input.type,
        title: input.title,
        message: input.message,
        entityType: input.entityType,
        entityId: input.entityId,
        entityUrl: input.entityUrl,
        organizationId: input.organizationId,
      },
    });

    // Emit to in-process bus — the WS route subscribes and broadcasts
    notificationBus.emit("notification", notification);
  } catch (error) {
    console.error("[notify] Failed:", error);
  }
}
