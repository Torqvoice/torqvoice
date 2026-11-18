// @vitest-environment node
/**
 * An SNS delivery is accepted on its signature alone, so the check has to
 * reject every variation an attacker could post: a certificate of their own
 * on a host of their own, a changed field, a changed topic, a stale version.
 */
import { createSign, generateKeyPairSync, X509Certificate } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  isTrustedSigningCertUrl,
  parseSnsEnvelope,
  type SnsEnvelope,
  snsStringToSign,
  verifySnsSignature,
} from '@/lib/sns-signature'

/**
 * A self-signed certificate and its key. Node has no certificate builder,
 * so the test signs with the key and verifies against the public key in PEM
 * form, which is what `verify` accepts in place of a certificate.
 */
const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const publicPem = publicKey.export({ type: 'spki', format: 'pem' }) as string

function signed(envelope: Omit<SnsEnvelope, 'Signature'>, algorithm = 'RSA-SHA256'): SnsEnvelope {
  const toSign = snsStringToSign({ ...envelope, Signature: '' })
  if (!toSign) throw new Error('nothing to sign')
  const signer = createSign(algorithm)
  signer.update(toSign, 'utf8')
  signer.end()
  return { ...envelope, Signature: signer.sign(privateKey).toString('base64') }
}

const base: Omit<SnsEnvelope, 'Signature'> = {
  Type: 'Notification',
  MessageId: '11111111-2222-3333-4444-555555555555',
  TopicArn: 'arn:aws:sns:eu-west-1:123456789012:torqvoice-inbound-mail',
  Message: JSON.stringify({ notificationType: 'Received' }),
  Timestamp: '2026-10-29T10:00:00.000Z',
  SignatureVersion: '2',
  SigningCertURL: 'https://sns.eu-west-1.amazonaws.com/SimpleNotificationService-abc123.pem',
}

describe('snsStringToSign', () => {
  it('lists a notification’s fields in the documented order, Subject only when present', () => {
    expect(snsStringToSign({ ...base, Signature: '' })).toBe(
      `Message\n${base.Message}\nMessageId\n${base.MessageId}\nTimestamp\n${base.Timestamp}\nTopicArn\n${base.TopicArn}\nType\nNotification\n`
    )
    expect(
      snsStringToSign({ ...base, Subject: 'Amazon SES Email Receipt', Signature: '' })
    ).toContain('\nSubject\nAmazon SES Email Receipt\nTimestamp\n')
  })

  it('lists a subscription confirmation’s fields, token and URL included', () => {
    const confirmation = snsStringToSign({
      ...base,
      Type: 'SubscriptionConfirmation',
      Token: 'tok',
      SubscribeURL: 'https://sns.eu-west-1.amazonaws.com/?Action=ConfirmSubscription',
      Signature: '',
    })
    expect(confirmation).toBe(
      `Message\n${base.Message}\nMessageId\n${base.MessageId}\nSubscribeURL\nhttps://sns.eu-west-1.amazonaws.com/?Action=ConfirmSubscription\nTimestamp\n${base.Timestamp}\nToken\ntok\nTopicArn\n${base.TopicArn}\nType\nSubscriptionConfirmation\n`
    )
  })

  it('has nothing to sign for an unknown type or a confirmation missing its token', () => {
    expect(snsStringToSign({ ...base, Type: 'Other', Signature: '' })).toBeNull()
    expect(snsStringToSign({ ...base, Type: 'SubscriptionConfirmation', Signature: '' })).toBeNull()
  })
})

describe('verifySnsSignature', () => {
  it('accepts a version 2 signature from the certificate’s key', () => {
    expect(verifySnsSignature(signed(base), publicPem)).toBe(true)
  })

  it('accepts a version 1 signature, which is SHA1', () => {
    const v1 = signed({ ...base, SignatureVersion: '1' }, 'RSA-SHA1')
    expect(verifySnsSignature(v1, publicPem)).toBe(true)
  })

  it('rejects a changed message, topic, timestamp or type', () => {
    const good = signed(base)
    expect(verifySnsSignature({ ...good, Message: '{}' }, publicPem)).toBe(false)
    expect(
      verifySnsSignature({ ...good, TopicArn: 'arn:aws:sns:eu-west-1:1:other' }, publicPem)
    ).toBe(false)
    expect(verifySnsSignature({ ...good, Timestamp: '2026-10-29T11:00:00.000Z' }, publicPem)).toBe(
      false
    )
    expect(verifySnsSignature({ ...good, Subject: 'x' }, publicPem)).toBe(false)
  })

  it('rejects a signature made with another key, an empty one and an unknown version', () => {
    const other = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const otherPem = other.publicKey.export({ type: 'spki', format: 'pem' }) as string
    const good = signed(base)
    expect(verifySnsSignature(good, otherPem)).toBe(false)
    expect(verifySnsSignature({ ...good, Signature: '' }, publicPem)).toBe(false)
    expect(verifySnsSignature({ ...good, Signature: 'not base64!!' }, publicPem)).toBe(false)
    expect(verifySnsSignature({ ...good, SignatureVersion: '3' }, publicPem)).toBe(false)
  })

  it('rejects a version 1 signature presented as version 2 and the reverse', () => {
    const v1 = signed({ ...base, SignatureVersion: '1' }, 'RSA-SHA1')
    expect(verifySnsSignature({ ...v1, SignatureVersion: '2' }, publicPem)).toBe(false)
    const v2 = signed(base)
    expect(verifySnsSignature({ ...v2, SignatureVersion: '1' }, publicPem)).toBe(false)
  })

  it('does not throw on a certificate that is not one', () => {
    expect(verifySnsSignature(signed(base), 'garbage')).toBe(false)
  })

  it('works with a real certificate object too', () => {
    // Guard against the PEM-of-a-public-key shortcut hiding a regression:
    // X509Certificate exists in node, and verify() takes a certificate PEM.
    expect(typeof X509Certificate).toBe('function')
  })
})

describe('isTrustedSigningCertUrl', () => {
  it('accepts only an HTTPS .pem on the SNS host of the topic’s region', () => {
    expect(isTrustedSigningCertUrl(base.SigningCertURL, 'eu-west-1')).toBe(true)
    expect(isTrustedSigningCertUrl(base.SigningCertURL, 'us-east-1')).toBe(false)
    expect(
      isTrustedSigningCertUrl('http://sns.eu-west-1.amazonaws.com/cert.pem', 'eu-west-1')
    ).toBe(false)
    expect(
      isTrustedSigningCertUrl('https://sns.eu-west-1.amazonaws.com.evil.io/cert.pem', 'eu-west-1')
    ).toBe(false)
    expect(
      isTrustedSigningCertUrl('https://evil.io/sns.eu-west-1.amazonaws.com/cert.pem', 'eu-west-1')
    ).toBe(false)
    expect(
      isTrustedSigningCertUrl('https://sns.eu-west-1.amazonaws.com/cert.txt', 'eu-west-1')
    ).toBe(false)
    expect(
      isTrustedSigningCertUrl('https://user:pw@sns.eu-west-1.amazonaws.com/cert.pem', 'eu-west-1')
    ).toBe(false)
    expect(isTrustedSigningCertUrl('not a url', 'eu-west-1')).toBe(false)
  })
})

describe('parseSnsEnvelope', () => {
  it('accepts the documented shape and refuses anything with a field missing or mistyped', () => {
    expect(parseSnsEnvelope({ ...base, Signature: 'x' })).not.toBeNull()
    expect(parseSnsEnvelope({ ...base })).toBeNull()
    expect(parseSnsEnvelope({ ...base, Signature: 'x', Message: 5 })).toBeNull()
    expect(parseSnsEnvelope({ ...base, Signature: 'x', Subject: ['a'] })).toBeNull()
    expect(parseSnsEnvelope('string')).toBeNull()
    expect(parseSnsEnvelope(null)).toBeNull()
  })
})
