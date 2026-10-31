// @vitest-environment node
/**
 * From the receiving service's notification to a row in the inbox, with
 * every rule that stops a mail on the way: whose it is, whether it was seen,
 * whether it is safe, whether a person wrote it. The mail itself is parsed
 * for real from MIME, so what the parser hands over is what is tested.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { db, notify, store } = vi.hoisted(() => ({
  db: {
    organization: { findUnique: vi.fn() },
    emailMessage: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    customer: { findFirst: vi.fn() },
  },
  notify: vi.fn(async () => undefined),
  // The real store writes to disk; this one keeps the same selection rule.
  store: vi.fn(
    async (
      _org: string,
      files: readonly { filename?: string | null; contentType: string; size: number }[]
    ) =>
      (await import('@/features/messaging/Lib/inboundMail'))
        .selectAttachments(files)
        .map((index) => ({
          fileName: files[index].filename ?? `file-${index}`,
          contentType: files[index].contentType,
          size: 10,
          url: `/api/protected/files/org_1/email/${index}.jpg`,
        }))
  ),
}))
vi.mock('@/lib/db', () => ({ db }))
vi.mock('@/lib/notify', () => ({ notify }))
vi.mock('@/lib/backup/freeze', () => ({ isRestoring: vi.fn(() => false) }))

import { isRestoring } from '@/lib/backup/freeze'
import { type ReceiveOutcome, receiveSesMail } from '@/features/messaging/Lib/inboundMail.server'
import type { SesReceivedMail } from '@/features/messaging/Lib/inboundMail'

/** The reason a mail was dropped, or the outcome when it was not. */
const reasonOf = (result: ReceiveOutcome) =>
  result.outcome === 'dropped' ? result.reason : result.outcome

const TOKEN = 'abcdefghijklmnopqrstuvwxyz'
const DOMAIN = 'reply.torqvoice.com'
const config = {
  domain: DOMAIN,
  bucket: 'torqvoice-inbound-mail',
  region: 'eu-west-1',
  topicArn: 'arn:aws:sns:eu-west-1:123456789012:inbound',
}

const mail: SesReceivedMail = {
  messageId: 'ses-object-1',
  bucket: config.bucket,
  objectKey: 'ses-object-1',
  recipients: [`reply-${TOKEN}@${DOMAIN}`],
  spamVerdict: 'PASS',
  virusVerdict: 'PASS',
}

function raw(parts: { from?: string; headers?: string; text?: string; attachment?: boolean }) {
  const lines = [
    `From: ${parts.from ?? 'Kari Nordmann <Kari@Example.com>'}`,
    `To: reply-${TOKEN}@${DOMAIN}`,
    'Subject: Re: Invoice 2026-104',
    'Message-ID: <abc@mail.example.com>',
    'In-Reply-To: <ours@reply.torqvoice.com>',
    'Date: Tue, 27 Oct 2026 10:30:00 +0100',
    ...(parts.headers ? [parts.headers] : []),
    'MIME-Version: 1.0',
    'Content-Type: multipart/mixed; boundary="b"',
    '',
    '--b',
    'Content-Type: text/plain; charset=utf-8',
    '',
    parts.text ?? 'Looks good, paying today.\n\nOn Mon, 27 Oct 2026 EF Moto wrote:\n> invoice',
    ...(parts.attachment !== false
      ? [
          '--b',
          'Content-Type: image/jpeg; name="photo.jpg"',
          'Content-Disposition: attachment; filename="photo.jpg"',
          'Content-Transfer-Encoding: base64',
          '',
          '/9j/4AAQSkZJRg==',
          '--b',
          'Content-Type: application/x-msdownload; name="setup.exe"',
          'Content-Disposition: attachment; filename="setup.exe"',
          'Content-Transfer-Encoding: base64',
          '',
          'TVqQAAMAAAAEAAAA',
        ]
      : []),
    '--b--',
    '',
  ]
  return Buffer.from(lines.join('\r\n'), 'utf8')
}

function object(buffer: Buffer, size = buffer.length) {
  return { size, read: async () => buffer }
}

function deps(buffer: Buffer, size?: number) {
  return {
    config,
    fetchObject: vi.fn(async () => object(buffer, size)),
    store,
    notify,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(isRestoring).mockReturnValue(false)
  db.organization.findUnique.mockResolvedValue({ id: 'org_1', name: 'EF Moto' })
  db.emailMessage.findUnique.mockResolvedValue(null)
  db.emailMessage.findMany.mockResolvedValue([
    {
      messageId: 'ours@reply.torqvoice.com',
      customerId: 'cust_1',
      relatedEntityType: 'service_record',
      relatedEntityId: 'sr_1',
    },
  ])
  db.customer.findFirst.mockResolvedValue({ id: 'cust_1', name: 'Kari Nordmann' })
  db.emailMessage.create.mockImplementation(async ({ data }: { data: { customerId: string } }) => ({
    id: 'em_1',
    customerId: data.customerId,
  }))
})

describe('receiveSesMail', () => {
  it('files a customer’s reply with its kept attachment, linked to the mail it answers', async () => {
    const result = await receiveSesMail(mail, deps(raw({})))
    expect(result).toEqual({ outcome: 'filed', id: 'em_1', organizationId: 'org_1' })

    const { data } = db.emailMessage.create.mock.calls[0][0]
    expect(data).toMatchObject({
      direction: 'inbound',
      kind: 'message',
      address: 'kari@example.com',
      fromName: 'Kari Nordmann',
      subject: 'Re: Invoice 2026-104',
      messageId: 'abc@mail.example.com',
      inReplyTo: 'ours@reply.torqvoice.com',
      providerMessageId: 'ses-object-1',
      spamVerdict: 'PASS',
      relatedEntityType: 'service_record',
      relatedEntityId: 'sr_1',
      organizationId: 'org_1',
      customerId: 'cust_1',
    })
    expect(data.body).toContain('Looks good, paying today.')
    expect(data.body).toContain('> invoice')

    // Both files reach the store; only the photo is kept.
    const offered = store.mock.calls[0][1]
    expect(offered.map((file) => file.contentType)).toEqual([
      'image/jpeg',
      'application/x-msdownload',
    ])
    expect(data.attachments.create).toHaveLength(1)
    expect(data.attachments.create[0].contentType).toBe('image/jpeg')

    expect(db.customer.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: 'org_1',
          email: { equals: 'kari@example.com', mode: 'insensitive' },
        },
      })
    )
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org_1',
        type: 'email_inbound',
        entityUrl: '/messages?channel=email&customerId=cust_1',
      })
    )
  })

  it('files a stranger under the address, with the customer from the mail answered when there is one', async () => {
    db.customer.findFirst.mockResolvedValue(null)
    await receiveSesMail(mail, deps(raw({ from: 'Someone <new@example.org>' })))
    const { data } = db.emailMessage.create.mock.calls[0][0]
    expect(data.address).toBe('new@example.org')
    expect(data.customerId).toBe('cust_1')
    // The notification opens the thread the row went into, not an empty one
    // under the address.
    expect(notify).toHaveBeenLastCalledWith(
      expect.objectContaining({ entityUrl: '/messages?channel=email&customerId=cust_1' })
    )

    db.emailMessage.findMany.mockResolvedValue([])
    db.emailMessage.create.mockClear()
    await receiveSesMail(mail, deps(raw({ from: 'Someone <new@example.org>' })))
    expect(db.emailMessage.create.mock.calls[0][0].data.customerId).toBeNull()
    expect(notify).toHaveBeenLastCalledWith(
      expect.objectContaining({ entityUrl: '/messages?channel=email&contact=new%40example.org' })
    )
  })

  it('drops mail that is not for a workshop: no reply address, an unknown token, another bucket', async () => {
    const d = deps(raw({}))
    expect(await receiveSesMail({ ...mail, recipients: ['post@torqvoice.com'] }, d)).toEqual({
      outcome: 'dropped',
      reason: 'no reply address among recipients',
    })
    db.organization.findUnique.mockResolvedValue(null)
    expect((await receiveSesMail(mail, d)).outcome).toBe('dropped')
    db.organization.findUnique.mockResolvedValue({ id: 'org_1', name: 'EF Moto' })
    expect((await receiveSesMail({ ...mail, bucket: 'other' }, d)).outcome).toBe('dropped')
    expect(d.fetchObject).not.toHaveBeenCalled()
    expect(db.emailMessage.create).not.toHaveBeenCalled()
  })

  it('does not file the same mail twice, however it is delivered', async () => {
    db.emailMessage.findUnique.mockResolvedValue({ id: 'em_0' })
    expect(await receiveSesMail(mail, deps(raw({})))).toEqual({
      outcome: 'dropped',
      reason: 'already filed',
    })

    db.emailMessage.findUnique.mockResolvedValue(null)
    db.emailMessage.create.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }))
    expect(await receiveSesMail(mail, deps(raw({})))).toEqual({
      outcome: 'dropped',
      reason: 'already filed',
    })
    expect(notify).not.toHaveBeenCalled()
  })

  it('drops a mail the virus scan failed without reading it', async () => {
    const d = deps(raw({}))
    expect(await receiveSesMail({ ...mail, virusVerdict: 'FAIL' }, d)).toEqual({
      outcome: 'dropped',
      reason: 'virus verdict FAIL',
    })
    expect(d.fetchObject).not.toHaveBeenCalled()
  })

  it('drops auto-replies, bounces and mail from the reply domain itself', async () => {
    expect(
      reasonOf(await receiveSesMail(mail, deps(raw({ headers: 'Auto-Submitted: auto-replied' }))))
    ).toBe('automated mail')
    expect(
      reasonOf(
        await receiveSesMail(
          mail,
          deps(raw({ from: 'Mail Delivery System <MAILER-DAEMON@mx.example>' }))
        )
      )
    ).toBe('automated mail')
    expect(
      reasonOf(await receiveSesMail(mail, deps(raw({ from: `reply-${TOKEN}@${DOMAIN}` }))))
    ).toBe('sent from the reply domain')
    expect(db.emailMessage.create).not.toHaveBeenCalled()
  })

  it('files a mail too large to read as a stub that says so', async () => {
    const d = deps(raw({}), 31 * 1024 * 1024)
    // Without the parsed mail there is no sender to file it under.
    expect(reasonOf(await receiveSesMail(mail, d))).toBe('mail too large to read')
  })

  it('lets a fetch failure through so the delivery is retried', async () => {
    const d = {
      ...deps(raw({})),
      fetchObject: vi.fn(async () => {
        throw new Error('S3 down')
      }),
    }
    await expect(receiveSesMail(mail, d)).rejects.toThrow('S3 down')
  })

  it('keeps a plain reply without attachments', async () => {
    await receiveSesMail(mail, deps(raw({ attachment: false, text: 'Thanks!' })))
    const { data } = db.emailMessage.create.mock.calls[0][0]
    expect(data.body).toBe('Thanks!')
    expect(data.attachments).toBeUndefined()
  })

  it('asks for a retry, reading and filing nothing, while the workshop is being restored', async () => {
    vi.mocked(isRestoring).mockReturnValue(true)
    const d = deps(raw({}))
    const result = await receiveSesMail(mail, d)
    expect(result).toEqual({ outcome: 'retry', reason: 'workshop is being restored' })
    expect(isRestoring).toHaveBeenCalledWith('org_1')
    expect(d.fetchObject).not.toHaveBeenCalled()
    expect(store).not.toHaveBeenCalled()
    expect(db.emailMessage.create).not.toHaveBeenCalled()
    expect(notify).not.toHaveBeenCalled()
  })
})
