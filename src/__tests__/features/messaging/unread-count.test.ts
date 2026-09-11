// @vitest-environment node
/**
 * The sidebar's Messages pill counts what the inbox can open. A Telegram or
 * SMS message from a chat matched to no customer has no thread, so it could
 * never be marked read; two of them kept the pill at 2 on a workshop whose
 * inbox showed nothing unread. WhatsApp lists unmatched numbers as threads,
 * so every WhatsApp message still counts.
 */
import { describe, expect, it, vi } from 'vitest'

const { db } = vi.hoisted(() => ({
  db: {
    smsMessage: { count: vi.fn(async () => 1) },
    telegramMessage: { count: vi.fn(async () => 2) },
    whatsappMessage: { count: vi.fn(async () => 3) },
  },
}))
vi.mock('@/lib/db', () => ({ db }))

import { countUnreadMessages } from '@/features/messaging/Lib/unreadCount'

describe('countUnreadMessages', () => {
  it('adds up the channels', async () => {
    expect(await countUnreadMessages('org_1')).toBe(6)
  })

  it('counts only messages that belong to a customer on SMS and Telegram', async () => {
    await countUnreadMessages('org_1')
    const listed = {
      organizationId: 'org_1',
      direction: 'inbound',
      readAt: null,
      customerId: { not: null },
    }
    expect(db.smsMessage.count).toHaveBeenCalledWith({ where: listed })
    expect(db.telegramMessage.count).toHaveBeenCalledWith({ where: listed })
  })

  it('counts every WhatsApp message, since unmatched numbers are listed as threads', async () => {
    await countUnreadMessages('org_1')
    expect(db.whatsappMessage.count).toHaveBeenCalledWith({
      where: { organizationId: 'org_1', direction: 'inbound', readAt: null },
    })
  })
})
