import { describe, expect, it } from 'vitest'
import {
  isRedacted,
  isSecretSettingKey,
  keepCurrentSecrets,
  keepCurrentWebhookSecrets,
  REDACTED,
  redactSettingRow,
  redactWebhookRow,
  SECRET_SETTING_KEYS,
} from '@/lib/backup/secrets'

describe('SECRET_SETTING_KEYS', () => {
  it('is exactly the reviewed set', () => {
    // A new secret setting fails here until someone decides it is one.
    expect([...SECRET_SETTING_KEYS]).toEqual([
      'ai.apiKey',
      'email.mailgun.apiKey',
      'email.postmark.apiKey',
      'email.resend.apiKey',
      'email.sendgrid.apiKey',
      'email.ses.secretAccessKey',
      'email.smtp.pass',
      'license.key',
      'license.token',
      'payment.paypal.clientSecret',
      'payment.stripe.secretKey',
      'payment.stripe.webhookSecret',
      'payment.vipps.clientSecret',
      'payment.vipps.subscriptionKey',
      'sms.telnyx.apiKey',
      'sms.twilio.authToken',
      'sms.vonage.apiKey',
      'sms.vonage.apiSecret',
      'sms.webhookSecret',
      'telegram.botToken',
      'telegram.webhookSecret',
    ])
  })

  it('treats every WhatsApp credential as secret', () => {
    expect(isSecretSettingKey('whatsapp.cred.twilio.authToken')).toBe(true)
    expect(isSecretSettingKey('whatsapp.cred.meta.webhookToken')).toBe(true)
    expect(isSecretSettingKey('whatsapp.template.name')).toBe(false)
  })

  it('leaves ordinary settings alone', () => {
    for (const key of [
      'workshop.logo',
      'payment.stripe.publishableKey',
      'payment.vipps.clientId',
      'vehicle.typeKeyEnabled',
      'email.smtp.user',
    ]) {
      expect(isSecretSettingKey(key), key).toBe(false)
    }
  })
})

describe('redaction', () => {
  it('replaces the value of a secret setting', () => {
    const row = { id: 's1', key: 'payment.stripe.secretKey', value: 'sk_live_x', userId: 'u1' }
    expect(redactSettingRow(row)).toEqual({ ...row, value: REDACTED })
    expect(row.value).toBe('sk_live_x')
  })

  it('keeps a non-secret setting as it is', () => {
    const row = { key: 'workshop.phone', value: '+47 123' }
    expect(redactSettingRow(row)).toBe(row)
  })

  it('replaces a webhook secret', () => {
    const row = { id: 'w1', url: 'https://x.test', secret: 'whsec_abc' }
    expect(redactWebhookRow(row)).toEqual({ ...row, secret: REDACTED })
  })

  it('recognises only the marker', () => {
    expect(isRedacted(REDACTED)).toBe(true)
    expect(isRedacted('')).toBe(false)
    expect(isRedacted(null)).toBe(false)
    expect(isRedacted('sk_live_x')).toBe(false)
  })
})

describe('keepCurrentSecrets', () => {
  it('keeps the install value, drops a key it has none for, and lists both', () => {
    const rows = [
      { id: 'a', key: 'workshop.phone', value: '123' },
      { id: 'b', key: 'payment.stripe.secretKey', value: REDACTED },
      { id: 'c', key: 'ai.apiKey', value: REDACTED },
    ]
    const result = keepCurrentSecrets(rows, new Map([['payment.stripe.secretKey', 'sk_now']]))
    expect(result.rows).toEqual([
      { id: 'a', key: 'workshop.phone', value: '123' },
      { id: 'b', key: 'payment.stripe.secretKey', value: 'sk_now' },
    ])
    expect(result.redacted).toEqual(['ai.apiKey', 'payment.stripe.secretKey'])
  })

  it('keeps a secret the install has that a data-only file does not carry', () => {
    const rows = [
      { id: 'a', key: 'workshop.phone', value: '123' },
      { id: 'b', key: 'payment.stripe.secretKey', value: REDACTED },
    ]
    const installed = [
      { id: 'x1', key: 'payment.stripe.secretKey', value: 'sk_now' },
      // Entered after the backup was taken: not in the file at all.
      { id: 'x2', key: 'ai.apiKey', value: 'sk-ai-now' },
      { id: 'x3', key: 'whatsapp.cred.twilio.authToken', value: 'tw-now' },
      // Not a secret: the file is the truth for it, so it is not kept.
      { id: 'x4', key: 'workshop.email', value: 'post@x.test' },
    ]
    const result = keepCurrentSecrets(
      rows,
      new Map([['payment.stripe.secretKey', 'sk_now']]),
      installed
    )
    expect(result.rows).toEqual([
      { id: 'a', key: 'workshop.phone', value: '123' },
      { id: 'b', key: 'payment.stripe.secretKey', value: 'sk_now' },
      { id: 'x2', key: 'ai.apiKey', value: 'sk-ai-now' },
      { id: 'x3', key: 'whatsapp.cred.twilio.authToken', value: 'tw-now' },
    ])
    expect(result.redacted).toEqual([
      'ai.apiKey',
      'payment.stripe.secretKey',
      'whatsapp.cred.twilio.authToken',
    ])
  })

  it('keeps nothing extra from the install when the file carries its secrets', () => {
    const rows = [
      { id: 'a', key: 'workshop.phone', value: '123' },
      { id: 'b', key: 'payment.stripe.secretKey', value: 'sk_backup' },
    ]
    const installed = [{ id: 'x2', key: 'ai.apiKey', value: 'sk-ai-now' }]
    const result = keepCurrentSecrets(rows, new Map([['ai.apiKey', 'sk-ai-now']]), installed)
    expect(result.rows).toEqual(rows)
    expect(result.redacted).toEqual([])
  })

  it('still drops a redacted key the install has no value for', () => {
    const rows = [{ id: 'c', key: 'ai.apiKey', value: REDACTED }]
    const installed = [{ id: 'x1', key: 'telegram.botToken', value: 'tg-now' }]
    const result = keepCurrentSecrets(rows, new Map(), installed)
    expect(result.rows).toEqual([{ id: 'x1', key: 'telegram.botToken', value: 'tg-now' }])
    expect(result.redacted).toEqual(['ai.apiKey', 'telegram.botToken'])
  })

  it('writes a secret the backup carries in full', () => {
    const rows = [{ key: 'ai.apiKey', value: 'sk-from-backup' }]
    const result = keepCurrentSecrets(rows, new Map([['ai.apiKey', 'sk-now']]))
    expect(result.rows).toEqual(rows)
    expect(result.redacted).toEqual([])
  })
})

describe('keepCurrentWebhookSecrets', () => {
  const current = [
    { id: 'w1', url: 'https://one.test', secret: 'whsec_one' },
    { id: 'w2', url: 'https://two.test', secret: 'whsec_two' },
  ]

  it('matches by id, then URL, then mints', () => {
    const rows = [
      { id: 'w1', url: 'https://changed.test', secret: REDACTED },
      { id: 'old', url: 'https://two.test', secret: REDACTED },
      { id: 'w3', url: 'https://three.test', secret: REDACTED },
      { id: 'w4', url: 'https://four.test', secret: 'whsec_backup' },
    ]
    const result = keepCurrentWebhookSecrets(rows, current, () => 'whsec_new')
    expect(result.rows.map((r) => r.secret)).toEqual([
      'whsec_one',
      'whsec_two',
      'whsec_new',
      'whsec_backup',
    ])
    expect(result.minted).toEqual(['w3'])
  })
})
