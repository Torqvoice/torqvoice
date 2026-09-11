// @vitest-environment node
/**
 * What the Telegram webhook does with the first thing a customer sends.
 *
 * A customer arrives one of two ways: through a link that names them, which
 * sends `/start <customerId>` and ties their chat to that customer, or by
 * opening the bot by name, which sends a bare `/start`. The second used to be
 * filed as a message from nobody and raised a notification that led to the
 * integrations page; now the bot tells them what to do and files nothing.
 * After linking, an ordinary message lands on the customer and its
 * notification leads to the inbox.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { db, sendTelegramMessage, notify } = vi.hoisted(() => ({
  db: {
    customer: { findFirst: vi.fn(), update: vi.fn() },
    telegramMessage: { create: vi.fn(), updateMany: vi.fn() },
  },
  sendTelegramMessage: vi.fn(),
  notify: vi.fn(),
}))
vi.mock('@/lib/db', () => ({ db }))
vi.mock('@/lib/telegram', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/telegram')>()),
  getOrgTelegramWebhookSecret: async () => 'hook-secret',
  sendTelegramMessage,
}))
vi.mock('@/lib/notify', () => ({ notify }))

import { POST } from '@/app/api/webhooks/telegram/[organizationId]/route'
import { BARE_START_REPLY } from '@/lib/telegram'

const ORG = 'org_1'

function update(text: string, chatId = 4242) {
  return new Request(`http://app.test/api/webhooks/telegram/${ORG}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-telegram-bot-api-secret-token': 'hook-secret',
    },
    body: JSON.stringify({
      message: { message_id: 7, chat: { id: chatId, first_name: 'Jane' }, text },
    }),
  })
}

const params = Promise.resolve({ organizationId: ORG })

describe('the Telegram webhook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    db.telegramMessage.create.mockResolvedValue({ id: 'msg_1' })
    db.telegramMessage.updateMany.mockResolvedValue({ count: 0 })
  })

  it('links the chat to the customer named in a deep link, and says so', async () => {
    db.customer.findFirst.mockResolvedValue({ id: 'cust_42', name: 'Jane Cooper' })
    db.customer.update.mockResolvedValue({})

    const response = await POST(update('/start cust_42'), { params })

    expect(response.status).toBe(200)
    expect(db.customer.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'cust_42', organizationId: ORG } })
    )
    expect(db.customer.update).toHaveBeenCalledWith({
      where: { id: 'cust_42' },
      data: { telegramChatId: '4242' },
    })
    expect(sendTelegramMessage).toHaveBeenCalledWith(
      ORG,
      expect.objectContaining({ chatId: '4242', text: expect.stringContaining('now linked') })
    )
    expect(db.telegramMessage.create, 'a link is not a message').not.toHaveBeenCalled()
    expect(notify).not.toHaveBeenCalled()
    // Whatever the chat sent before it was linked is the customer's now,
    // so it can be seen, read and counted like the rest.
    expect(db.telegramMessage.updateMany).toHaveBeenCalledWith({
      where: { organizationId: ORG, chatId: '4242', customerId: null },
      data: { customerId: 'cust_42' },
    })
  })

  it('tells a stranger who opened the bot by name how to connect, and files nothing', async () => {
    const response = await POST(update('/start'), { params })

    expect(response.status).toBe(200)
    expect(sendTelegramMessage).toHaveBeenCalledWith(ORG, {
      chatId: '4242',
      text: BARE_START_REPLY,
    })
    expect(db.customer.update).not.toHaveBeenCalled()
    expect(db.telegramMessage.create).not.toHaveBeenCalled()
    expect(notify, 'nothing for the workshop to act on').not.toHaveBeenCalled()
  })

  it('does not link a chat to a customer of another workshop', async () => {
    db.customer.findFirst.mockResolvedValue(null)

    await POST(update('/start cust_of_someone_else'), { params })

    expect(db.customer.update).not.toHaveBeenCalled()
    expect(db.telegramMessage.updateMany).not.toHaveBeenCalled()
    expect(sendTelegramMessage).not.toHaveBeenCalled()
  })

  it('files a message from a linked chat on the customer, with a link to the inbox', async () => {
    db.customer.findFirst.mockResolvedValue({ id: 'cust_42', name: 'Jane Cooper' })

    const response = await POST(update('Is the car ready?'), { params })

    expect(response.status).toBe(200)
    expect(db.customer.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: ORG, telegramChatId: '4242' } })
    )
    expect(db.telegramMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        direction: 'inbound',
        chatId: '4242',
        body: 'Is the car ready?',
        customerId: 'cust_42',
        organizationId: ORG,
      }),
    })
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'telegram_inbound',
        message: 'Jane Cooper: Is the car ready?',
        entityUrl: '/messages?tab=telegram&customerId=cust_42',
      })
    )
  })

  it('drops a delivery that does not carry the webhook secret', async () => {
    const request = new Request(`http://app.test/api/webhooks/telegram/${ORG}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: { message_id: 1, chat: { id: 1 }, text: 'hi' } }),
    })
    const response = await POST(request, { params })
    expect(response.status).toBe(200)
    expect(db.telegramMessage.create).not.toHaveBeenCalled()
  })
})
