import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { BARE_START_REPLY, getOrgTelegramWebhookSecret, sendTelegramMessage } from '@/lib/telegram'
import { notify } from '@/lib/notify'
import { safeEqual } from '@/lib/webhook-signatures'

interface TelegramUpdate {
  message?: {
    message_id: number
    chat: { id: number; first_name?: string; username?: string }
    from?: { id: number; first_name?: string; username?: string }
    text?: string
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ organizationId: string }> }
) {
  const { organizationId } = await params

  try {
    // Validate webhook secret from header
    const secretHeader = request.headers.get('x-telegram-bot-api-secret-token')

    if (!secretHeader) {
      // Return 200 to prevent Telegram retries
      return NextResponse.json({ ok: true })
    }

    // The secret follows the Telegram integration, so a bot connected before
    // the move and one connected after are checked the same way. Not being
    // able to read it is our fault, not a bad caller: answer 500 so Telegram
    // keeps the update and retries, rather than 200 which drops it for good.
    let secret: string | null
    try {
      secret = await getOrgTelegramWebhookSecret(organizationId)
    } catch (error) {
      console.error('[webhook/telegram] Could not read the webhook secret:', error)
      return NextResponse.json({ ok: false }, { status: 500 })
    }

    if (!secret || !safeEqual(secret, secretHeader)) {
      return NextResponse.json({ ok: true })
    }

    // Parse the Telegram Update
    const update = (await request.json()) as TelegramUpdate
    const msg = update.message

    if (!msg?.text || !msg.chat?.id) {
      return NextResponse.json({ ok: true })
    }

    const chatId = String(msg.chat.id)
    const text = msg.text
    const telegramMessageId = String(msg.message_id)

    // Handle /start deep-link command: /start {customerId}
    if (text === '/start' || text.startsWith('/start ')) {
      const customerId = text.slice('/start'.length).trim()
      if (customerId) {
        await handleStartCommand(organizationId, chatId, customerId, msg.chat.first_name)
      } else {
        // Somebody opened the bot by name rather than through a link that
        // names them, so there is nobody to link them to. Not a message to
        // file or to raise a notification for; say what to do instead.
        await handleBareStart(organizationId, chatId)
      }
      return NextResponse.json({ ok: true })
    }

    // Regular message: find customer by telegramChatId
    const customer = await db.customer.findFirst({
      where: { organizationId, telegramChatId: chatId },
      select: { id: true, name: true },
    })

    // Create inbound message record
    const message = await db.telegramMessage.create({
      data: {
        direction: 'inbound',
        chatId,
        body: text,
        status: 'received',
        telegramMessageId,
        organizationId,
        customerId: customer?.id,
      },
    })

    // Send in-app notification
    const senderName = msg.from?.first_name || msg.chat.first_name || 'Unknown'

    await notify({
      organizationId,
      type: 'telegram_inbound',
      title: 'New Telegram message',
      message: customer
        ? `${customer.name}: ${text.slice(0, 100)}`
        : `${senderName}: ${text.slice(0, 100)}`,
      entityType: 'telegram_message',
      entityId: message.id,
      entityUrl: customer
        ? `/messages?tab=telegram&customerId=${customer.id}`
        : '/settings/integrations',
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[webhook/telegram] Error:', error)
    // Always return 200 to prevent Telegram retries
    return NextResponse.json({ ok: true })
  }
}

async function handleBareStart(organizationId: string, chatId: string) {
  try {
    await sendTelegramMessage(organizationId, { chatId, text: BARE_START_REPLY })
  } catch (error) {
    console.error('[webhook/telegram] Could not answer a bare /start:', error)
  }
}

async function handleStartCommand(
  organizationId: string,
  chatId: string,
  customerId: string,
  firstName?: string
) {
  // Verify customer belongs to this organization
  const customer = await db.customer.findFirst({
    where: { id: customerId, organizationId },
    select: { id: true, name: true },
  })

  if (!customer) {
    return
  }

  // Link the Telegram chat ID to the customer
  await db.customer.update({
    where: { id: customer.id },
    data: { telegramChatId: chatId },
  })

  // Send confirmation message back
  try {
    await sendTelegramMessage(organizationId, {
      chatId,
      text: `Hi ${firstName || customer.name}! Your Telegram is now linked to your account. You will receive messages here.`,
    })
  } catch (error) {
    console.error('[webhook/telegram] Failed to send confirmation:', error)
  }
}
