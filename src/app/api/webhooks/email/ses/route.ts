import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { NextResponse } from 'next/server'
import { SYSTEM_SETTING_KEYS } from '@/features/admin/Schema/systemSettingsSchema'
import { parseSesReceivedNotification } from '@/features/messaging/Lib/inboundMail'
import { receiveSesMail, type StoredObject } from '@/features/messaging/Lib/inboundMail.server'
import { db } from '@/lib/db'
import { inboundMailConfig, type InboundMailConfig } from '@/lib/reply-mail'
import {
  isTrustedSigningCertUrl,
  parseSnsEnvelope,
  type SnsEnvelope,
  verifySnsSignature,
} from '@/lib/sns-signature'
import { warnOnce } from '@/lib/webhook-signatures'

/**
 * Where customer replies arrive on the cloud instance.
 *
 * SES receives mail for the reply domain, stores each message in a bucket
 * and publishes a notification to a topic; SNS delivers that notification
 * here. The route checks that the delivery is SNS's (its signature, from a
 * certificate on SNS's own host) and from our topic, then hands the mail to
 * the inbox. A self-hosted install has no reply domain, so this answers 404
 * there, before reading anything.
 *
 * SNS gives a delivery 15 seconds and retries on anything but a 2xx. A mail
 * dropped by policy is acknowledged, since it would be dropped again; only
 * a fetch or a database failure answers 500 so the delivery comes back.
 */

const MAX_ENVELOPE_BYTES = 512 * 1024
const FETCH_TIMEOUT_MS = 10_000

const certificates =
  (globalThis as { __snsCertificates?: Map<string, string> }).__snsCertificates ??
  new Map<string, string>()
;(globalThis as { __snsCertificates?: Map<string, string> }).__snsCertificates = certificates

async function signingCertificate(url: string, region: string): Promise<string | null> {
  if (!isTrustedSigningCertUrl(url, region)) return null
  const cached = certificates.get(url)
  if (cached) return cached

  const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
  if (!response.ok) return null
  // SNS serves a certificate. A bare public key is accepted as well, so the
  // tests can sign with a key pair node can mint; what makes the key SNS's
  // is the host it came from, checked above, not the PEM label.
  const pem = await response.text()
  if (!/-----BEGIN (CERTIFICATE|PUBLIC KEY)-----/.test(pem) || pem.length > 64 * 1024) return null

  // SNS rotates its keys rarely and a key never changes under a URL, so the
  // cache has no expiry; it is lost on restart, which is soon enough.
  if (certificates.size > 20) certificates.clear()
  certificates.set(url, pem)
  return pem
}

/** The SES credentials the admin pasted for sending, which also read the bucket. */
async function storageClient(config: InboundMailConfig): Promise<S3Client | null> {
  const rows = await db.systemSetting.findMany({
    where: {
      key: {
        in: [SYSTEM_SETTING_KEYS.SES_ACCESS_KEY_ID, SYSTEM_SETTING_KEYS.SES_SECRET_ACCESS_KEY],
      },
    },
  })
  const settings = new Map(rows.map((row) => [row.key, row.value]))
  const accessKeyId = settings.get(SYSTEM_SETTING_KEYS.SES_ACCESS_KEY_ID)
  const secretAccessKey = settings.get(SYSTEM_SETTING_KEYS.SES_SECRET_ACCESS_KEY)
  if (!accessKeyId || !secretAccessKey) return null
  return new S3Client({ region: config.region, credentials: { accessKeyId, secretAccessKey } })
}

function objectFetcher(client: S3Client) {
  return async (bucket: string, key: string): Promise<StoredObject> => {
    const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
    const size = response.ContentLength ?? 0
    return {
      size,
      async read() {
        const bytes = await response.Body?.transformToByteArray()
        return Buffer.from(bytes ?? new Uint8Array())
      },
    }
  }
}

async function confirmSubscription(envelope: SnsEnvelope, region: string) {
  const url = envelope.SubscribeURL
  if (!url) return false
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (parsed.protocol !== 'https:' || parsed.hostname !== `sns.${region}.amazonaws.com`) {
    return false
  }
  const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
  return response.ok
}

export async function POST(request: Request) {
  const setup = inboundMailConfig()
  if (!setup.ok) {
    // Not the cloud instance, or one with the setup half done. The latter
    // is logged once, since every delivery would say the same.
    if (setup.missing.length < 4) {
      warnOnce(
        'inbound-mail-config',
        `[webhook/email/ses] Inbound mail is not configured: ${setup.missing.join(', ')} missing`
      )
    }
    return new Response(null, { status: 404 })
  }
  const { config } = setup

  const raw = await request.text()
  if (raw.length > MAX_ENVELOPE_BYTES) {
    return NextResponse.json({ error: 'Too large' }, { status: 413 })
  }

  let envelope: SnsEnvelope | null
  try {
    envelope = parseSnsEnvelope(JSON.parse(raw))
  } catch {
    envelope = null
  }
  if (!envelope) return NextResponse.json({ error: 'Not an SNS message' }, { status: 400 })

  if (envelope.TopicArn !== config.topicArn) {
    console.warn(`[webhook/email/ses] Delivery from another topic refused: ${envelope.TopicArn}`)
    return NextResponse.json({ error: 'Unknown topic' }, { status: 403 })
  }

  let certificate: string | null
  try {
    certificate = await signingCertificate(envelope.SigningCertURL, config.region)
  } catch (error) {
    console.error('[webhook/email/ses] Could not fetch the signing certificate:', error)
    return NextResponse.json({ error: 'Certificate unavailable' }, { status: 503 })
  }
  if (!certificate || !verifySnsSignature(envelope, certificate)) {
    console.warn('[webhook/email/ses] Delivery with a bad signature refused')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 403 })
  }

  if (envelope.Type === 'SubscriptionConfirmation') {
    const confirmed = await confirmSubscription(envelope, config.region).catch(() => false)
    console.warn(
      `[webhook/email/ses] Subscription ${confirmed ? 'confirmed' : 'NOT confirmed'} for ${envelope.TopicArn}`
    )
    return new Response(null, { status: confirmed ? 200 : 400 })
  }
  if (envelope.Type !== 'Notification') {
    return new Response(null, { status: 200 })
  }

  let notification: unknown
  try {
    notification = JSON.parse(envelope.Message)
  } catch {
    return new Response(null, { status: 200 })
  }
  const mail = parseSesReceivedNotification(notification)
  if (!mail) {
    console.warn('[webhook/email/ses] Notification is not a stored "Received" mail; ignored')
    return new Response(null, { status: 200 })
  }

  const client = await storageClient(config)
  if (!client) {
    warnOnce(
      'inbound-mail-credentials',
      '[webhook/email/ses] No SES credentials in the admin settings; inbound mail cannot be read'
    )
    return NextResponse.json({ error: 'Storage credentials missing' }, { status: 503 })
  }

  try {
    const result = await receiveSesMail(mail, { config, fetchObject: objectFetcher(client) })
    if (result.outcome === 'dropped') {
      console.warn(`[webhook/email/ses] Dropped ${mail.messageId}: ${result.reason}`)
    }
    return new Response(null, { status: 200 })
  } catch (error) {
    console.error(`[webhook/email/ses] Failed to file ${mail.messageId}:`, error)
    return NextResponse.json({ error: 'Try again' }, { status: 500 })
  }
}
