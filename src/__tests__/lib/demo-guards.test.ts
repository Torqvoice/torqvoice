/**
 * The two ways a demo guard goes missing.
 *
 * One is a new action that sends: the transports refuse, so nothing leaves the
 * building, but a nested send is a withAuth action whose refusal comes back as
 * a returned value rather than a thrown one. An action that does not read that
 * return carries on and records a message as sent that was never sent.
 *
 * The other is the settings back door. Each provider's settings action guards
 * itself, but setSettings takes an arbitrary key, so a credential can be
 * written straight past the guarded page into a database twenty strangers
 * share.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { isDemoBlockedSettingKey } from '@/lib/demo'

/** Source of every server action file under src/features. */
function actionFiles(): { file: string; source: string }[] {
  const found: { file: string; source: string }[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(full)
        continue
      }
      if (!entry.name.endsWith('.ts')) continue
      if (!full.includes(`${path.sep}Actions${path.sep}`)) continue
      found.push({ file: full, source: readFileSync(full, 'utf-8') })
    }
  }
  walk('src/features')
  return found
}

/** Names that put a message on a wire. */
const SENDERS = [
  'sendEmail',
  'sendNotificationEmail',
  'sendSms',
  'sendSmsToCustomer',
  'sendTelegramMessage',
  'sendTelegramToCustomer',
]

describe('actions that send', () => {
  it('finds the action files at all', () => {
    // Without this the sweep below can pass by looking at nothing.
    expect(statSync('src/features').isDirectory()).toBe(true)
    expect(actionFiles().length).toBeGreaterThan(20)
  })

  it('every one of them refuses in demo mode', () => {
    const unguarded = actionFiles()
      .filter(({ source }) => SENDERS.some((fn) => source.includes(`${fn}(`)))
      // The call, not the import. A file can import the guard and never
      // reach it, which is exactly the state a bad refactor leaves behind.
      .filter(({ source }) => !/\bdemoGuard\(\)/.test(source))
      .map(({ file }) => file)

    expect(unguarded, `these send without a demo guard:\n${unguarded.join('\n')}`).toEqual([])
  })
})

describe('the settings back door', () => {
  const CREDENTIALS = [
    'payment.stripe.secretKey',
    'payment.vipps.clientSecret',
    'payment.providersEnabled',
    'sms.twilio.authToken',
    'sms.twilio.accountSid',
    'sms.vonage.apiSecret',
    'sms.telnyx.apiKey',
    'sms.provider',
    'sms.phoneNumber',
    'sms.webhookSecret',
    'telegram.botToken',
    'telegram.webhookSecret',
    'email.smtp.pass',
    'email.smtp.host',
    'email.resend.apiKey',
    'email.sendgrid.apiKey',
    'email.mailgun.apiKey',
    'email.postmark.apiKey',
    'email.ses.secretAccessKey',
    'email.provider',
    'ai.apiKey',
  ]

  const PLAYABLE = [
    // The demo is meant to be played with. Blocking these would make it a
    // screenshot, and none of them can put anything on a wire.
    'workshop.name',
    'workshop.currencyCode',
    'invoice.footerNote',
    'tireHotel.enabled',
    'tireHotel.defaultSeasonalPrice',
    'telegram.enabled',
    'telegram.template.quoteReady',
    'sms.template.quoteReady',
    'email.enabled',
    'email.fromName',
    'ai.enabled',
    'ai.model',
    'portal.enabled',
    'maintenance.enabled',
  ]

  it('refuses every credential', () => {
    for (const key of CREDENTIALS) {
      expect(isDemoBlockedSettingKey(key), `${key} should be blocked`).toBe(true)
    }
  })

  it('leaves the rest of the app playable', () => {
    for (const key of PLAYABLE) {
      expect(isDemoBlockedSettingKey(key), `${key} should not be blocked`).toBe(false)
    }
  })
})
