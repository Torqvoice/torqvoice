// @vitest-environment node
/**
 * What a customer mail gets on the cloud instance so the answer comes back:
 * the workshop's name as sender, the reply address, a Message-ID of ours,
 * and a row in the thread. And, as importantly, what it gets everywhere
 * else: nothing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { db, email } = vi.hoisted(() => ({
  db: {
    organization: { findUnique: vi.fn(), updateMany: vi.fn() },
    emailMessage: { create: vi.fn() },
  },
  email: {
    usesPlatformMail: vi.fn(async () => true),
    platformFromAddressAs: vi.fn(async (name: string) => `"${name}" <post@torqvoice.com>`),
  },
}))
vi.mock('@/lib/db', () => ({ db }))
vi.mock('@/lib/email', () => email)
vi.mock('@/lib/cloud-instance', () => ({ isCloudInstance: vi.fn(() => true) }))

import { isCloudInstance } from '@/lib/cloud-instance'
import { prepareCustomerMail } from '@/features/messaging/Lib/outboundMail.server'
import { ensureReplyMailToken } from '@/lib/reply-mail.server'

const TOKEN = 'abcdefghijklmnopqrstuvwxyz'

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('INBOUND_MAIL_DOMAIN', 'reply.torqvoice.com')
  vi.mocked(isCloudInstance).mockReturnValue(true)
  email.usesPlatformMail.mockResolvedValue(true)
  db.organization.findUnique.mockResolvedValue({ name: 'EF Moto', replyMailToken: TOKEN })
  db.emailMessage.create.mockResolvedValue({ id: 'em_1' })
})

afterEach(() => vi.unstubAllEnvs())

describe('prepareCustomerMail', () => {
  it('names the workshop, points replies at the reply address and records the send', async () => {
    const prepared = await prepareCustomerMail('org_1', 'Kari <Kari@Example.com>', {
      customerId: 'cust_1',
      kind: 'document',
      relatedEntityType: 'service_record',
      relatedEntityId: 'sr_1',
    })
    expect(prepared).not.toBeNull()
    expect(prepared?.headers.from).toBe('"EF Moto" <post@torqvoice.com>')
    expect(prepared?.headers.replyTo).toBe(`reply-${TOKEN}@reply.torqvoice.com`)
    expect(prepared?.headers.messageId).toMatch(/@reply\.torqvoice\.com$/)

    await prepared?.record({ status: 'sent', subject: 'Invoice 2026-104', body: 'See attached' })
    expect(db.emailMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          direction: 'outbound',
          kind: 'document',
          address: 'kari@example.com',
          subject: 'Invoice 2026-104',
          body: 'See attached',
          messageId: prepared?.headers.messageId,
          status: 'sent',
          relatedEntityType: 'service_record',
          relatedEntityId: 'sr_1',
          organizationId: 'org_1',
          customerId: 'cust_1',
        }),
      })
    )
  })

  it('threads a reply under the customer’s mail', async () => {
    const prepared = await prepareCustomerMail('org_1', 'kari@example.com', {
      customerId: 'cust_1',
      kind: 'message',
      inReplyTo: 'abc@mail.example.com',
      references: ['ours@reply.torqvoice.com', 'abc@mail.example.com'],
    })
    expect(prepared?.headers.inReplyTo).toBe('abc@mail.example.com')
    expect(prepared?.headers.references).toEqual([
      'ours@reply.torqvoice.com',
      'abc@mail.example.com',
    ])
  })

  it('does nothing on a self-hosted install', async () => {
    vi.mocked(isCloudInstance).mockReturnValue(false)
    expect(await prepareCustomerMail('org_1', 'kari@example.com', { kind: 'message' })).toBeNull()
    expect(db.organization.findUnique).not.toHaveBeenCalled()
  })

  it('does nothing without a reply domain', async () => {
    vi.stubEnv('INBOUND_MAIL_DOMAIN', '')
    expect(await prepareCustomerMail('org_1', 'kari@example.com', { kind: 'message' })).toBeNull()
  })

  it('does nothing for a workshop with its own mail vendor', async () => {
    email.usesPlatformMail.mockResolvedValue(false)
    expect(await prepareCustomerMail('org_1', 'kari@example.com', { kind: 'message' })).toBeNull()
    expect(db.organization.findUnique).not.toHaveBeenCalled()
  })
})

describe('ensureReplyMailToken', () => {
  it('returns the token a workshop already has', async () => {
    expect(await ensureReplyMailToken('org_1')).toBe(TOKEN)
    expect(db.organization.updateMany).not.toHaveBeenCalled()
  })

  it('mints one only into the empty column, so two sends racing share one', async () => {
    db.organization.findUnique
      .mockResolvedValueOnce({ replyMailToken: null })
      .mockResolvedValueOnce({ replyMailToken: TOKEN })
    db.organization.updateMany.mockResolvedValue({ count: 0 })
    expect(await ensureReplyMailToken('org_1')).toBe(TOKEN)
    expect(db.organization.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'org_1', replyMailToken: null } })
    )
  })

  it('mints a fresh token when the column is empty', async () => {
    db.organization.findUnique.mockResolvedValue({ replyMailToken: null })
    db.organization.updateMany.mockResolvedValue({ count: 1 })
    const token = await ensureReplyMailToken('org_1')
    expect(token).toMatch(/^[a-z2-7]{26}$/)
    expect(db.organization.updateMany.mock.calls[0][0].data.replyMailToken).toBe(token)
  })
})
