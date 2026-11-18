// @vitest-environment node
/**
 * The chat from both ends, over one stand-in for the messages table: a
 * customer writes in the portal, the workshop finds the thread in its inbox
 * with what is unread, answers, and the answer is in the customer's thread.
 * And what must never happen: writing when the chat is off, reading or
 * marking another customer's thread, sending faster than a person types.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

interface Row {
  id: string
  direction: string
  body: string
  attachments: string[]
  readAt: Date | null
  createdAt: Date
  authorUserId: string | null
  organizationId: string
  customerId: string
}

const state = vi.hoisted(() => ({
  rows: [] as Row[],
  session: null as { customerId: string; organizationId: string } | null,
  portalLive: true,
  messagesEnabled: true,
  clock: 0,
}))

const CUSTOMERS: Record<
  string,
  { id: string; name: string; organizationId: string; email: string }
> = {
  kari: { id: 'kari', name: 'Kari Nordmann', organizationId: 'org1', email: 'kari@example.com' },
  ola: { id: 'ola', name: 'Ola Hansen', organizationId: 'org1', email: 'ola@example.com' },
  eve: { id: 'eve', name: 'Eve Other', organizationId: 'org2', email: 'eve@example.com' },
}

vi.mock('@/lib/db', () => {
  type Where = Record<string, unknown>
  const matches = (row: Row, where: Where = {}) =>
    Object.entries(where).every(([key, value]) => {
      const actual = (row as unknown as Record<string, unknown>)[key]
      if (value === null) return actual === null
      if (value && typeof value === 'object' && 'gte' in value) {
        return (actual as Date) >= (value as { gte: Date }).gte
      }
      if (key === 'NOT') return true
      if (value && typeof value === 'object' && 'in' in value) {
        return (value as { in: unknown[] }).in.includes(actual)
      }
      return actual === value
    })
  const shaped = (row: Row) => ({
    ...row,
    author: row.authorUserId ? { name: 'Jonas Berg' } : null,
  })
  const portalMessage = {
    create: async ({ data }: { data: Partial<Row> }) => {
      state.clock += 1000
      const row: Row = {
        id: `pm${state.rows.length + 1}`,
        direction: 'inbound',
        body: '',
        attachments: [],
        readAt: null,
        authorUserId: null,
        organizationId: '',
        customerId: '',
        createdAt: new Date(Date.now() + state.clock),
        ...data,
      }
      state.rows.push(row)
      return shaped(row)
    },
    findMany: async ({ where, take }: { where?: Where; take?: number }) =>
      state.rows
        .filter((row) => matches(row, where))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, take ?? 1000)
        .map(shaped),
    findFirst: async ({ where }: { where?: Where }) =>
      state.rows
        .filter((row) => matches(row, where))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .map(shaped)[0] ?? null,
    count: async ({ where }: { where?: Where }) =>
      state.rows.filter((row) => matches(row, where)).length,
    updateMany: async ({ where, data }: { where?: Where; data: Partial<Row> }) => {
      const hit = state.rows.filter((row) => matches(row, where))
      for (const row of hit) Object.assign(row, data)
      return { count: hit.length }
    },
    update: async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
      const row = state.rows.find((one) => one.id === where.id)
      if (row) Object.assign(row, data)
      return row
    },
    deleteMany: async ({ where }: { where?: Where }) => {
      const before = state.rows.length
      state.rows = state.rows.filter((row) => !matches(row, where))
      return { count: before - state.rows.length }
    },
  }
  // The inbox reads its threads with raw SQL: the newest message of each
  // customer, and the unread count of each. Answered from the same rows.
  const $queryRaw = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const sql = strings.join('?')
    if (!sql.includes('portal_messages')) return []
    const organizationId = values[0] as string
    const mine = state.rows.filter((row) => row.organizationId === organizationId)
    if (sql.includes('COUNT(*)')) {
      const counts = new Map<string, number>()
      for (const row of mine) {
        if (row.direction === 'inbound' && !row.readAt) {
          counts.set(row.customerId, (counts.get(row.customerId) ?? 0) + 1)
        }
      }
      return [...counts].map(([identity, unread]) => ({ identity, unread }))
    }
    const newest = new Map<string, Row>()
    for (const row of mine) {
      const held = newest.get(row.customerId)
      if (!held || held.createdAt < row.createdAt) newest.set(row.customerId, row)
    }
    return [...newest.values()].map((row) => ({
      identity: row.customerId,
      customerId: row.customerId,
      name: CUSTOMERS[row.customerId]?.name ?? null,
      contact: CUSTOMERS[row.customerId]?.email ?? null,
      body: row.body,
      mediaType: row.attachments.length > 0 ? 'photo' : null,
      direction: row.direction,
      createdAt: row.createdAt,
    }))
  }
  const none = { findMany: async () => [] }
  // The other channels are empty in this workshop.
  const quiet = { count: async () => 0 }
  return {
    db: {
      portalMessage,
      $queryRaw,
      customer: {
        findFirst: async ({ where }: { where: { id: string; organizationId: string } }) => {
          const customer = CUSTOMERS[where.id]
          return customer && customer.organizationId === where.organizationId ? customer : null
        },
      },
      serviceRecord: none,
      statusReport: none,
      quote: none,
      smsMessage: quiet,
      telegramMessage: quiet,
      whatsappMessage: quiet,
      emailMessage: quiet,
    },
  }
})
vi.mock('@/lib/customer-session', () => ({ getCustomerSession: async () => state.session }))
vi.mock('@/lib/portal-slug', () => ({
  resolvePortalOrg: async (param: string) =>
    param === 'fjordside' ? { id: 'org1', name: 'Fjordside Auto' } : null,
}))
vi.mock('@/features/portal/Lib/portalLive', () => ({ isPortalLive: async () => state.portalLive }))
vi.mock('@/features/portal/Lib/portalLook.server', () => ({
  loadPortalLook: async () => ({ messagesEnabled: state.messagesEnabled }),
}))
vi.mock('@/lib/workshop-currency', () => ({
  workshopMoneyFormatter: async () => (amount: number) => `kr ${amount}`,
}))
vi.mock('@/lib/workshop-timezone', () => ({ workshopTimeZone: async () => 'Europe/Oslo' }))
const notify = vi.fn()
vi.mock('@/lib/notify', () => ({ notify: (input: unknown) => notify(input) }))
vi.mock('@/lib/demo', () => ({ demoGuard: vi.fn() }))
vi.mock('@/lib/files/manager', () => ({ releaseFiles: vi.fn(async () => ({})) }))
// The workshop is signed in as a member of org1. The real behaviour: a throw
// becomes a returned error.
vi.mock('@/lib/with-auth', () => ({
  withAuth: async (fn: (ctx: { organizationId: string; userId: string }) => Promise<unknown>) => {
    try {
      return { success: true, data: await fn({ organizationId: 'org1', userId: 'jonas' }) }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  },
}))
vi.mock('@/lib/features', () => ({
  getFeatures: async () => ({ sms: false, whatsapp: false, telegram: false }),
}))
vi.mock('@/lib/sms', () => ({ getOrgSmsProvider: async () => null }))
vi.mock('@/lib/telegram', () => ({ getOrgTelegramBotToken: async () => null }))
vi.mock('@/lib/whatsapp', () => ({ isWhatsappConfigured: async () => false }))
vi.mock('@/features/messaging/Lib/emailChannel.server', () => ({
  emailChannelState: async () => 'off',
}))

import {
  getInboxThreads,
  markThreadRead,
  markThreadUnread,
} from '@/features/messaging/Actions/inboxActions'
import {
  deletePortalConversation,
  getPortalConversation,
  markPortalMessagesSeen,
  sendPortalReply,
} from '@/features/messaging/Actions/portalThreadActions'
import { countUnreadMessages } from '@/features/messaging/Lib/unreadCount'
import { getPortalThread } from '@/features/portal/Actions/getPortalThread'
import { getPortalUnread } from '@/features/portal/Actions/getPortalUnread'
import { markPortalMessagesRead } from '@/features/portal/Actions/markPortalMessagesRead'
import { sendPortalMessage } from '@/features/portal/Actions/sendPortalMessage'
import { portalUploadFileName } from '@/features/portal/Lib/portalUploadOwner.server'
import { freezeOrganization, unfreezeOrganization } from '@/lib/backup/freeze'

const as = (customerId: string | null, organizationId = 'org1') => {
  state.session = customerId ? { customerId, organizationId } : null
}
process.env.BETTER_AUTH_SECRET = 'a-secret-for-the-portal-chat'
/** A photo this customer uploaded: its name says whose it is. */
const photoNames = new Map<string, string>()
const photoName = (customerId = 'kari', org = 'org1') => {
  const key = `${org}:${customerId}`
  if (!photoNames.has(key)) photoNames.set(key, portalUploadFileName(org, customerId, 'jpg'))
  return photoNames.get(key) as string
}
const photo = (org = 'org1', customerId = 'kari') =>
  `/api/protected/files/${org}/portal-uploads/${photoName(customerId, org)}`
/** A file in the folder with an ordinary random name: staff uploaded it, or it is old. */
const STAFF_PHOTO =
  '/api/protected/files/org1/portal-uploads/11111111-1111-4111-8111-111111111111.jpg'

beforeEach(() => {
  state.rows = []
  state.portalLive = true
  state.messagesEnabled = true
  state.clock = 0
  notify.mockClear()
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  as('kari')
})

describe('a customer writes to the workshop', () => {
  it('stores the message as theirs and answers it as the thread draws it', async () => {
    const result = await sendPortalMessage({ body: '  Can I pick up after 16?  ' })
    expect(result.success).toBe(true)
    expect(result.data).toMatchObject({
      direction: 'inbound',
      body: 'Can I pick up after 16?',
      attachments: [],
      authorName: null,
      readAt: null,
    })
    expect(state.rows).toHaveLength(1)
    expect(state.rows[0]).toMatchObject({ customerId: 'kari', organizationId: 'org1' })
  })

  it('tells the workshop, with a link that opens the thread in its inbox', async () => {
    await sendPortalMessage({ body: 'Can I pick up after 16?' })
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org1',
        type: 'portal_inbound',
        message: 'Kari Nordmann: Can I pick up after 16?',
        entityUrl: '/messages?channel=portal&customerId=kari',
      })
    )
  })

  it('takes photos, and hands them back at the address a customer can open', async () => {
    const result = await sendPortalMessage({ attachments: [photo()] })
    expect(state.rows[0].attachments).toEqual([photo()])
    expect(result.data?.attachments).toEqual([
      { url: `/portal/org1/files/${photoName()}`, kind: 'image' },
    ])
  })

  it('refuses a message with nothing in it', async () => {
    expect(await sendPortalMessage({ body: '   ' })).toEqual({ success: false, error: 'empty' })
    expect(state.rows).toHaveLength(0)
  })

  it('refuses a message longer than the limit', async () => {
    const result = await sendPortalMessage({ body: 'x'.repeat(4001) })
    expect(result.success).toBe(false)
    expect(state.rows).toHaveLength(0)
  })

  it("refuses a file from another workshop or from the workshop's own folders", async () => {
    for (const url of [
      photo('org2'),
      '/api/protected/files/org1/logos/logo.png',
      'https://x.test/a.jpg',
    ]) {
      expect(await sendPortalMessage({ body: 'look', attachments: [url] })).toEqual({
        success: false,
        error: 'not_yours',
      })
    }
    expect(state.rows).toHaveLength(0)
  })

  it("refuses another customer's upload, so it cannot be read by attaching it", async () => {
    // Ola uploaded a photo and has not sent it, or has: Kari learnt its address.
    const olas = photo('org1', 'ola')
    expect(await sendPortalMessage({ body: 'look', attachments: [olas] })).toEqual({
      success: false,
      error: 'not_yours',
    })
    // Nor a photo the workshop's staff put in the folder for someone else.
    expect((await sendPortalMessage({ attachments: [STAFF_PHOTO] })).error).toBe('not_yours')
    // No message of Kari's mentions the file, which is what would open it to her.
    expect(state.rows).toHaveLength(0)

    as('ola')
    expect((await sendPortalMessage({ attachments: [olas] })).success).toBe(true)
  })

  it('refuses while the workshop is being restored, and takes the message afterwards', async () => {
    freezeOrganization('org1')
    try {
      expect(await sendPortalMessage({ body: 'Hello?' })).toEqual({
        success: false,
        error: 'restoring',
      })
      expect(state.rows).toHaveLength(0)
      expect(notify).not.toHaveBeenCalled()
    } finally {
      unfreezeOrganization('org1')
    }
    expect((await sendPortalMessage({ body: 'Hello?' })).success).toBe(true)
  })

  it('refuses when the workshop has turned the chat off', async () => {
    state.messagesEnabled = false
    expect(await sendPortalMessage({ body: 'Hello?' })).toEqual({
      success: false,
      error: 'chat_off',
    })
    expect(state.rows).toHaveLength(0)
    expect(notify).not.toHaveBeenCalled()
  })

  it('refuses when the portal itself is no longer on', async () => {
    state.portalLive = false
    expect((await sendPortalMessage({ body: 'Hello?' })).error).toBe('chat_off')
  })

  it('refuses a visitor who is not signed in', async () => {
    as(null)
    expect(await sendPortalMessage({ body: 'Hello?' })).toEqual({
      success: false,
      error: 'Not authenticated',
    })
  })

  it('stops a customer who sends faster than a person types', async () => {
    for (let i = 0; i < 12; i++) {
      expect((await sendPortalMessage({ body: `message ${i}` })).success).toBe(true)
    }
    expect(await sendPortalMessage({ body: 'one more' })).toEqual({
      success: false,
      error: 'too_fast',
    })
    // Another customer is not held back by it.
    as('ola')
    expect((await sendPortalMessage({ body: 'Hi' })).success).toBe(true)
  })
})

describe("a customer's thread is theirs alone", () => {
  beforeEach(async () => {
    as('ola')
    await sendPortalMessage({ body: "Ola's private question" })
    await sendPortalReply({ customerId: 'ola', body: 'Answer to Ola' })
    as('kari')
  })

  it('shows a customer only their own messages', async () => {
    await sendPortalMessage({ body: "Kari's question" })
    const thread = await getPortalThread('fjordside')
    expect(thread.data?.messages.map((message) => message.body)).toEqual(["Kari's question"])
    expect(thread.data?.unread).toBe(0)
  })

  it('does not mark another customer read', async () => {
    // Kari names Ola's unread answer by its id.
    const olas = state.rows.find((row) => row.customerId === 'ola' && row.direction === 'outbound')
    expect(await markPortalMessagesRead({ ids: [olas?.id] })).toEqual({
      success: true,
      data: { marked: 0, unread: 0 },
    })
    as('ola')
    expect((await getPortalUnread()).data).toEqual({ unread: 1 })
  })

  it('refuses a session used at another workshop address', async () => {
    expect((await getPortalThread('someone-else')).success).toBe(false)
    as('eve', 'org2')
    expect((await getPortalThread('fjordside')).success).toBe(false)
  })

  it('refuses the workshop reading or answering a customer of another workshop', async () => {
    expect((await getPortalConversation('eve')).success).toBe(false)
    expect((await sendPortalReply({ customerId: 'eve', body: 'Hi' })).success).toBe(false)
    expect(state.rows.some((row) => row.customerId === 'eve')).toBe(false)
  })
})

describe('the workshop answers in its inbox', () => {
  it('lists the thread as the portal channel with what is unread', async () => {
    await sendPortalMessage({ body: 'Can I pick up after 16?' })
    await sendPortalMessage({ attachments: [photo()] })

    const inbox = await getInboxThreads()
    expect(inbox.data?.channels).toEqual(['portal'])
    expect(inbox.data?.threads).toEqual([
      expect.objectContaining({
        key: 'portal:kari',
        channel: 'portal',
        customerId: 'kari',
        name: 'Kari Nordmann',
        contact: 'kari@example.com',
        lastMessage: '[photo]',
        lastDirection: 'inbound',
        unread: 2,
      }),
    ])
    expect(await countUnreadMessages('org1')).toBe(2)
  })

  it('keeps the thread listed, but is no channel to write on, once the chat is off', async () => {
    await sendPortalMessage({ body: 'Hello' })
    state.messagesEnabled = false
    const inbox = await getInboxThreads()
    expect(inbox.data?.channels).toEqual([])
    expect(inbox.data?.threads).toHaveLength(1)
    expect((await getPortalConversation('kari')).data).toMatchObject({ canReply: false })
    expect((await sendPortalReply({ customerId: 'kari', body: 'Hi' })).success).toBe(false)
  })

  it('reads the thread when it is opened, and can put it back as unread', async () => {
    await sendPortalMessage({ body: 'One' })
    await sendPortalMessage({ body: 'Two' })
    const thread = { channel: 'portal' as const, customerId: 'kari', contact: 'kari@example.com' }

    // The conversation on screen says which messages it shows.
    const shown = (await getPortalConversation('kari')).data?.messages.map((m) => m.id) ?? []
    expect((await markPortalMessagesSeen({ customerId: 'kari', ids: shown })).data).toEqual({
      marked: 2,
    })
    expect(await countUnreadMessages('org1')).toBe(0)
    // The customer sees their last message was read.
    expect((await getPortalThread('fjordside')).data?.messages.at(-1)?.readAt).not.toBeNull()

    expect((await markThreadUnread(thread)).data).toEqual({ marked: 1 })
    expect((await getInboxThreads()).data?.threads[0].unread).toBe(1)
  })

  it("puts the workshop's answer in the customer's thread, unread until they open it", async () => {
    await sendPortalMessage({ body: 'Can I pick up after 16?' })
    const reply = await sendPortalReply({ customerId: 'kari', body: 'Yes, we close at 17.' })
    expect(reply.success).toBe(true)

    // Answering is having read what the customer wrote.
    expect(await countUnreadMessages('org1')).toBe(0)

    const thread = await getPortalThread('fjordside')
    expect(thread.data?.enabled).toBe(true)
    expect(thread.data?.unread).toBe(1)
    expect(thread.data?.messages.map((message) => [message.direction, message.body])).toEqual([
      ['inbound', 'Can I pick up after 16?'],
      ['outbound', 'Yes, we close at 17.'],
    ])
    // A customer knows the mechanic by first name.
    expect(thread.data?.messages[1].authorName).toBe('Jonas')
    expect((await getPortalUnread()).data).toEqual({ unread: 1 })

    const shown = thread.data?.messages.map((message) => message.id) ?? []
    expect((await markPortalMessagesRead({ ids: shown })).data).toEqual({ marked: 1, unread: 0 })
    expect((await getPortalUnread()).data).toEqual({ unread: 0 })
    // And the workshop sees that it was seen.
    const conversation = await getPortalConversation('kari')
    expect(conversation.data?.messages.at(-1)).toMatchObject({
      body: 'Yes, we close at 17.',
      authorName: 'Jonas Berg',
    })
    expect(conversation.data?.messages.at(-1)?.readAt).not.toBeNull()
  })

  it('leaves unread what the customer has not been shown', async () => {
    await sendPortalReply({ customerId: 'kari', body: 'The car is on the lift.' })
    const onScreen = (await getPortalThread('fjordside')).data?.messages.map((m) => m.id) ?? []
    // A second answer arrives after the customer's page read the thread.
    await sendPortalReply({ customerId: 'kari', body: 'Ready at 15:00.' })

    expect((await markPortalMessagesRead({ ids: onScreen })).data).toEqual({ marked: 1, unread: 1 })
    expect((await getPortalUnread()).data).toEqual({ unread: 1 })
    const after = (await getPortalConversation('kari')).data?.messages ?? []
    expect(after.map((message) => [message.body, message.readAt !== null])).toEqual([
      ['The car is on the lift.', true],
      // Not seen, so the workshop is not told it was.
      ['Ready at 15:00.', false],
    ])
  })

  it('marks nothing for a customer who names no message, or their own', async () => {
    await sendPortalMessage({ body: 'Mine' })
    expect((await markPortalMessagesRead({ ids: [] })).success).toBe(false)
    expect((await markPortalMessagesRead({})).success).toBe(false)
    expect((await markPortalMessagesRead({ ids: [state.rows[0].id] })).data).toMatchObject({
      marked: 0,
    })
    expect(state.rows[0].readAt).toBeNull()
  })

  it('does not mark the thread read while the workshop is being restored', async () => {
    await sendPortalReply({ customerId: 'kari', body: 'Ready at 15:00.' })
    freezeOrganization('org1')
    try {
      expect((await markPortalMessagesRead({ ids: [state.rows[0].id] })).success).toBe(false)
      expect(state.rows[0].readAt).toBeNull()
    } finally {
      unfreezeOrganization('org1')
    }
  })

  it('leaves unread what the workshop has not been shown', async () => {
    await sendPortalMessage({ body: 'One' })
    const onScreen = (await getPortalConversation('kari')).data?.messages.map((m) => m.id) ?? []
    // The customer writes again after the conversation was read from the server.
    await sendPortalMessage({ body: 'Two' })

    expect((await markPortalMessagesSeen({ customerId: 'kari', ids: onScreen })).data).toEqual({
      marked: 1,
    })
    expect(await countUnreadMessages('org1')).toBe(1)
    // The customer is told "seen" for the first message only.
    const theirs = (await getPortalThread('fjordside')).data?.messages ?? []
    expect(theirs.map((message) => message.readAt !== null)).toEqual([true, false])
    // Opening a thread in the list no longer stamps everything in it.
    const row = { channel: 'portal' as const, customerId: 'kari', contact: 'kari@example.com' }
    expect((await markThreadRead(row)).data).toEqual({ marked: 0 })
    expect(await countUnreadMessages('org1')).toBe(1)
  })

  it("does not mark another workshop's or another customer's messages seen", async () => {
    await sendPortalMessage({ body: "Kari's" })
    const id = state.rows[0].id
    expect((await markPortalMessagesSeen({ customerId: 'ola', ids: [id] })).data).toEqual({
      marked: 0,
    })
    expect(state.rows[0].readAt).toBeNull()
  })

  it('refuses an empty answer', async () => {
    expect((await sendPortalReply({ customerId: 'kari', body: '  ' })).success).toBe(false)
  })

  it('deletes a thread for both sides', async () => {
    await sendPortalMessage({ body: 'Hello' })
    await sendPortalReply({ customerId: 'kari', body: 'Hi' })
    expect((await deletePortalConversation('kari')).data).toEqual({ deleted: 2 })
    expect((await getPortalThread('fjordside')).data?.messages).toEqual([])
    expect((await getInboxThreads()).data?.threads).toEqual([])
  })
})
