// @vitest-environment node
/**
 * The door inbound mail comes through. It exists only on the cloud
 * instance, accepts only deliveries SNS signed for our topic, confirms a
 * subscription only on SNS's own host, and acknowledges or asks for a retry
 * according to what filing the mail said.
 */
import { createSign, generateKeyPairSync } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { config, receive, db, s3 } = vi.hoisted(() => ({
  config: { ok: true as boolean, missing: [] as string[] },
  receive: vi.fn(),
  db: { systemSetting: { findMany: vi.fn() } },
  s3: { send: vi.fn() },
}))

vi.mock('@/lib/reply-mail', () => ({
  inboundMailConfig: () =>
    config.ok
      ? {
          ok: true,
          config: {
            domain: 'reply.torqvoice.com',
            bucket: 'torqvoice-inbound-mail',
            region: 'eu-west-1',
            topicArn: 'arn:aws:sns:eu-west-1:123456789012:inbound',
          },
        }
      : { ok: false, missing: config.missing },
}))
vi.mock('@/features/messaging/Lib/inboundMail.server', () => ({ receiveSesMail: receive }))
vi.mock('@/lib/db', () => ({ db }))
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: class {
    send = s3.send
  },
  GetObjectCommand: class {
    constructor(public input: unknown) {}
  },
}))

import { POST } from '@/app/api/webhooks/email/ses/route'
import { snsStringToSign, type SnsEnvelope } from '@/lib/sns-signature'

const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const certificatePem = publicKey.export({ type: 'spki', format: 'pem' }) as string
const CERT_URL = 'https://sns.eu-west-1.amazonaws.com/SimpleNotificationService-abc.pem'

const received = {
  notificationType: 'Received',
  mail: { messageId: 'ses-1' },
  receipt: {
    recipients: ['reply-abcdefghijklmnopqrstuvwxyz@reply.torqvoice.com'],
    action: { type: 'S3', bucketName: 'torqvoice-inbound-mail', objectKey: 'ses-1' },
  },
}

function envelope(overrides: Partial<SnsEnvelope> = {}): SnsEnvelope {
  const unsigned: SnsEnvelope = {
    Type: 'Notification',
    MessageId: 'm-1',
    TopicArn: 'arn:aws:sns:eu-west-1:123456789012:inbound',
    Message: JSON.stringify(received),
    Timestamp: '2026-10-29T10:00:00.000Z',
    SignatureVersion: '2',
    Signature: '',
    SigningCertURL: CERT_URL,
    ...overrides,
  }
  const signer = createSign('RSA-SHA256')
  signer.update(snsStringToSign(unsigned) ?? '', 'utf8')
  signer.end()
  return { ...unsigned, Signature: signer.sign(privateKey).toString('base64') }
}

function post(body: unknown) {
  return POST(
    new Request('https://app.torqvoice.com/api/webhooks/email/ses', {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })
  )
}

const fetchMock = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  config.ok = true
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockImplementation(async (url: string) => {
    if (url === CERT_URL) return new Response(certificatePem, { status: 200 })
    return new Response('', { status: 200 })
  })
  db.systemSetting.findMany.mockResolvedValue([
    { key: 'ses.accessKeyId', value: 'AKIA' },
    { key: 'ses.secretAccessKey', value: 'secret' },
  ])
  s3.send.mockResolvedValue({
    ContentLength: 3,
    Body: { transformToByteArray: async () => new Uint8Array([97, 98, 99]) },
  })
  receive.mockResolvedValue({ outcome: 'filed', id: 'em_1', organizationId: 'org_1' })
  // The certificate cache lives on globalThis across tests.
  ;(globalThis as { __snsCertificates?: Map<string, string> }).__snsCertificates?.clear()
})

afterEach(() => vi.unstubAllGlobals())

describe('POST /api/webhooks/email/ses', () => {
  it('does not exist off the cloud instance', async () => {
    config.ok = false
    config.missing = [
      'INBOUND_MAIL_DOMAIN',
      'INBOUND_MAIL_BUCKET',
      'INBOUND_MAIL_REGION',
      'INBOUND_MAIL_TOPIC_ARN',
    ]
    const response = await post(envelope())
    expect(response.status).toBe(404)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(receive).not.toHaveBeenCalled()
  })

  it('files a signed notification from our topic and acknowledges it', async () => {
    const response = await post(envelope())
    expect(response.status).toBe(200)
    expect(receive).toHaveBeenCalledTimes(1)
    const [mail, deps] = receive.mock.calls[0]
    expect(mail).toMatchObject({ messageId: 'ses-1', bucket: 'torqvoice-inbound-mail' })

    // The fetcher reads from the bucket named in the notification.
    const object = await deps.fetchObject('torqvoice-inbound-mail', 'ses-1')
    expect(object.size).toBe(3)
    expect((await object.read()).toString()).toBe('abc')
    expect(s3.send.mock.calls[0][0].input).toEqual({
      Bucket: 'torqvoice-inbound-mail',
      Key: 'ses-1',
    })
  })

  it('refuses a delivery from another topic before fetching anything', async () => {
    const response = await post(envelope({ TopicArn: 'arn:aws:sns:eu-west-1:1:other' }))
    expect(response.status).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refuses a bad signature and a certificate off SNS’s host', async () => {
    const tampered = {
      ...envelope(),
      Message: JSON.stringify({ ...received, mail: { messageId: 'x' } }),
    }
    expect((await post(tampered)).status).toBe(403)
    expect(receive).not.toHaveBeenCalled()

    const elsewhere = envelope({ SigningCertURL: 'https://evil.example/cert.pem' })
    expect((await post(elsewhere)).status).toBe(403)
    expect(fetchMock).not.toHaveBeenCalledWith('https://evil.example/cert.pem', expect.anything())
  })

  it('refuses what is not an SNS message', async () => {
    expect((await post('not json')).status).toBe(400)
    expect((await post({ hello: 'world' })).status).toBe(400)
  })

  it('confirms a subscription only on SNS’s own host', async () => {
    const good = envelope({
      Type: 'SubscriptionConfirmation',
      Token: 'tok',
      SubscribeURL: 'https://sns.eu-west-1.amazonaws.com/?Action=ConfirmSubscription&Token=tok',
    })
    expect((await post(good)).status).toBe(200)
    expect(fetchMock).toHaveBeenCalledWith(good.SubscribeURL, expect.anything())

    fetchMock.mockClear()
    const bad = envelope({
      Type: 'SubscriptionConfirmation',
      Token: 'tok',
      SubscribeURL: 'https://evil.example/?Action=ConfirmSubscription',
    })
    expect((await post(bad)).status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalledWith(bad.SubscribeURL, expect.anything())
    expect(receive).not.toHaveBeenCalled()
  })

  it('acknowledges a dropped mail and asks for a retry on a failure', async () => {
    receive.mockResolvedValue({ outcome: 'dropped', reason: 'automated mail' })
    expect((await post(envelope())).status).toBe(200)

    receive.mockRejectedValue(new Error('database down'))
    expect((await post(envelope())).status).toBe(500)
  })

  it('ignores a notification that is not a stored mail', async () => {
    const bounce = envelope({ Message: JSON.stringify({ notificationType: 'Bounce' }) })
    expect((await post(bounce)).status).toBe(200)
    expect(receive).not.toHaveBeenCalled()
  })

  it('answers 503 when the storage credentials are missing, so SNS retries later', async () => {
    db.systemSetting.findMany.mockResolvedValue([])
    expect((await post(envelope())).status).toBe(503)
    expect(receive).not.toHaveBeenCalled()
  })
})
