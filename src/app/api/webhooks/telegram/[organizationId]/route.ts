import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ORG_TELEGRAM_KEYS } from "@/features/telegram/Schema/telegramSettingsSchema";
import { sendTelegramMessage } from "@/lib/telegram";
import { notify } from "@/lib/notify";

interface TelegramUpdate {
  message?: {
    message_id: number;
    chat: { id: number; first_name?: string; username?: string };
    from?: { id: number; first_name?: string; username?: string };
    text?: string;
  };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ organizationId: string }> },
) {
  const { organizationId } = await params;

  try {
    // Validate webhook secret from header
    const secretHeader = request.headers.get(
      "x-telegram-bot-api-secret-token",
    );

    if (!secretHeader) {
      // Return 200 to prevent Telegram retries
      return NextResponse.json({ ok: true });
    }

    const secretSetting = await db.appSetting.findUnique({
      where: {
        organizationId_key: {
          organizationId,
          key: ORG_TELEGRAM_KEYS.TELEGRAM_WEBHOOK_SECRET,
        },
      },
    });

    if (!secretSetting?.value || secretSetting.value !== secretHeader) {
      return NextResponse.json({ ok: true });
    }

    // Parse the Telegram Update
    const update = (await request.json()) as TelegramUpdate;
    const msg = update.message;

    if (!msg?.text || !msg.chat?.id) {
      return NextResponse.json({ ok: true });
    }

    const chatId = String(msg.chat.id);
    const text = msg.text;
    const telegramMessageId = String(msg.message_id);

    // Handle /start deep-link command: /start {customerId}
    if (text.startsWith("/start ")) {
      const customerId = text.slice(7).trim();
      if (customerId) {
        await handleStartCommand(
          organizationId,
          chatId,
          customerId,
          msg.chat.first_name,
        );
      }
      return NextResponse.json({ ok: true });
    }

    // Regular message: find customer by telegramChatId
    const customer = await db.customer.findFirst({
      where: { organizationId, telegramChatId: chatId },
      select: { id: true, name: true },
    });

    // Create inbound message record
    const message = await db.telegramMessage.create({
      data: {
        direction: "inbound",
        chatId,
        body: text,
        status: "received",
        telegramMessageId,
        organizationId,
        customerId: customer?.id,
      },
    });

    // Send in-app notification
    const senderName =
      msg.from?.first_name || msg.chat.first_name || "Unknown";

    await notify({
      organizationId,
      type: "telegram_inbound",
      title: "New Telegram message",
      message: customer
        ? `${customer.name}: ${text.slice(0, 100)}`
        : `${senderName}: ${text.slice(0, 100)}`,
      entityType: "telegram_message",
      entityId: message.id,
      entityUrl: customer
        ? `/telegram?customerId=${customer.id}`
        : "/settings/telegram",
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[webhook/telegram] Error:", error);
    // Always return 200 to prevent Telegram retries
    return NextResponse.json({ ok: true });
  }
}

async function handleStartCommand(
  organizationId: string,
  chatId: string,
  customerId: string,
  firstName?: string,
) {
  // Verify customer belongs to this organization
  const customer = await db.customer.findFirst({
    where: { id: customerId, organizationId },
    select: { id: true, name: true },
  });

  if (!customer) {
    return;
  }

  // Link the Telegram chat ID to the customer
  await db.customer.update({
    where: { id: customer.id },
    data: { telegramChatId: chatId },
  });

  // Send confirmation message back
  try {
    await sendTelegramMessage(organizationId, {
      chatId,
      text: `Hi ${firstName || customer.name}! Your Telegram is now linked to your account. You will receive messages here.`,
    });
  } catch (error) {
    console.error("[webhook/telegram] Failed to send confirmation:", error);
  }
}
