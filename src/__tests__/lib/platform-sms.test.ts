/**
 * Texting without an SMS provider of your own.
 *
 * A workshop used to need a Twilio, Vonage or Telnyx account before its first
 * text could go out. On the cloud, a paid workshop that has not connected one
 * now sends through the platform's Twilio account: 30 texts a day on Pro, 100
 * on Enterprise, none on the free plan. A workshop with its own provider is
 * untouched and has no limit. The count lives in the database and a text that
 * fails to send does not use up the day.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const getFeatures = vi.fn()
const isCloudMode = vi.fn()
vi.mock('@/lib/features', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/features')>()),
  getFeatures: (...args: unknown[]) => getFeatures(...args),
  isCloudMode: () => isCloudMode(),
}))

const channelSettings = vi.fn()
vi.mock('@/features/integrations/Lib/messaging', () => ({
  channelSettings: (...args: unknown[]) => channelSettings(...args),
}))

// What the torqvoice.com admin wrote into system_settings.
let systemSettings: { key: string; value: string }[] = []

// The usage table, keyed by workshop and day, with the two operations the
// allowance uses: create-if-missing and a conditional increment or decrement.
const usage = new Map<string, number>()
const keyOf = (w: { organizationId: string; day: string }) => `${w.organizationId}:${w.day}`
const platformSmsUsage = {
  createMany: vi.fn(async ({ data }: { data: { organizationId: string; day: string }[] }) => {
    for (const row of data) if (!usage.has(keyOf(row))) usage.set(keyOf(row), 0)
    return { count: data.length }
  }),
  updateMany: vi.fn(
    async ({
      where,
      data,
    }: {
      where: { organizationId: string; day: string; count: { lte?: number; gte?: number } }
      data: { count: { increment?: number; decrement?: number } }
    }) => {
      const current = usage.get(keyOf(where))
      if (current === undefined) return { count: 0 }
      if (where.count.lte !== undefined && !(current <= where.count.lte)) return { count: 0 }
      if (where.count.gte !== undefined && !(current >= where.count.gte)) return { count: 0 }
      usage.set(keyOf(where), current + (data.count.increment ?? 0) - (data.count.decrement ?? 0))
      return { count: 1 }
    }
  ),
}

vi.mock('@/lib/db', () => ({
  db: {
    platformSmsUsage,
    systemSetting: { findMany: vi.fn(async () => systemSettings) },
    appSetting: { findUnique: vi.fn(async () => null) },
  },
}))

const { sendOrgSms, getOrgSmsProvider, getOrgSmsPhoneNumber, getPlatformSmsAllowance } =
  await import('@/lib/sms')
const { withPlatformSmsAllowance } = await import('@/lib/platform-sms')
// The real plan table, so the numbers below are the ones a workshop gets.
const { PLAN_FEATURES } = await import('@/lib/features')

const PLATFORM_NUMBER = '+15550001111'
const OWN_NUMBER = '+4790000000'
const CUSTOMER = '+4799999999'

const platformAccount = [
  { key: 'platformSms.twilio.accountSid', value: 'ACplatform' },
  { key: 'platformSms.twilio.authToken', value: 'platform-token' },
  { key: 'platformSms.phoneNumber', value: PLATFORM_NUMBER },
]

const ownTwilio = new Map([
  ['sms.provider', 'twilio'],
  ['sms.phoneNumber', OWN_NUMBER],
  ['sms.twilio.accountSid', 'ACown'],
  ['sms.twilio.authToken', 'own-token'],
])

/** Every text Twilio was asked to send: which account, from which number, to whom. */
let sent: { account: string; from: string; to: string; body: string; service?: string }[] = []
let twilioDown = false
/** Set to make Twilio refuse the destination country, as its geo permissions do. */
let countryRefused = false

const fetchMock = vi.fn(async (url: string, init: { body: string }) => {
  if (countryRefused) {
    return {
      ok: false,
      statusText: 'Bad Request',
      json: async () => ({
        code: 21408,
        message: 'Permission to send an SMS has not been enabled',
      }),
    }
  }
  if (twilioDown) {
    return { ok: false, statusText: 'Service Unavailable', json: async () => ({}) }
  }
  const params = new URLSearchParams(init.body)
  sent.push({
    account: url.split('/Accounts/')[1].split('/')[0],
    from: params.get('From') ?? '',
    to: params.get('To') ?? '',
    body: params.get('Body') ?? '',
    ...(params.get('MessagingServiceSid')
      ? { service: params.get('MessagingServiceSid') ?? '' }
      : {}),
  })
  return { ok: true, json: async () => ({ sid: `SM${sent.length}`, status: 'queued' }) }
})
vi.stubGlobal('fetch', fetchMock)

const text = (org = 'org') => sendOrgSms(org, { to: CUSTOMER, body: 'Your car is ready' })

async function textTimes(times: number, org = 'org') {
  for (let i = 0; i < times; i++) await text(org)
}

beforeEach(() => {
  usage.clear()
  sent = []
  twilioDown = false
  countryRefused = false
  systemSettings = platformAccount
  isCloudMode.mockReset().mockReturnValue(true)
  getFeatures.mockReset().mockResolvedValue(PLAN_FEATURES.pro)
  channelSettings.mockReset().mockResolvedValue(new Map())
})

describe('a paid workshop with no SMS provider of its own', () => {
  it('texts its customer from the platform number', async () => {
    const result = await text()

    expect(result.to).toBe(CUSTOMER)
    expect(sent).toEqual([
      { account: 'ACplatform', from: PLATFORM_NUMBER, to: CUSTOMER, body: 'Your car is ready' },
    ])
  })

  it('is offered SMS, sending from the platform number', async () => {
    expect(await getOrgSmsProvider('org')).toBe('twilio')
    expect(await getOrgSmsPhoneNumber('org')).toBe(PLATFORM_NUMBER)
    expect(await getPlatformSmsAllowance('org')).toBe(30)
  })

  it('can send 30 texts a day on Pro and is asked to upgrade on the 31st', async () => {
    await textTimes(30)

    await expect(text()).rejects.toMatchObject({
      name: 'FeatureGatedError',
      feature: 'platformSmsDaily',
      limit: 30,
    })
    expect(sent).toHaveLength(30)
  })

  it('can send 100 texts a day on Enterprise', async () => {
    getFeatures.mockResolvedValue(PLAN_FEATURES.enterprise)

    await textTimes(100)

    await expect(text()).rejects.toMatchObject({ feature: 'platformSmsDaily', limit: 100 })
    expect(sent).toHaveLength(100)
  })

  it('keeps its own count, whatever another workshop has sent', async () => {
    await textTimes(30, 'busy')

    await expect(text('quiet')).resolves.toMatchObject({ to: CUSTOMER })
  })

  it('does not lose a text from the day when the provider is down', async () => {
    twilioDown = true
    await expect(text()).rejects.toThrow(/Twilio/)
    twilioDown = false

    await textTimes(30)

    expect(sent).toHaveLength(30)
  })

  it('counts a long text as the several SMS it is sent as', async () => {
    // 400 plain characters travel as three SMS, so ten of them are the day.
    const long = 'a'.repeat(400)
    for (let i = 0; i < 10; i++) await sendOrgSms('org', { to: CUSTOMER, body: long })

    await expect(text()).rejects.toMatchObject({ feature: 'platformSmsDaily', limit: 30 })
    expect(sent).toHaveLength(10)
  })

  it('counts a text with an emoji by the shorter segments it is sent in', async () => {
    // 71 characters fit one plain SMS, but an emoji makes it two.
    const body = `${'a'.repeat(69)}🚗`
    for (let i = 0; i < 15; i++) await sendOrgSms('org', { to: CUSTOMER, body })

    await expect(text()).rejects.toMatchObject({ feature: 'platformSmsDaily' })
  })

  it('refuses a long text that no longer fits, and still sends a short one', async () => {
    await textTimes(29)

    await expect(sendOrgSms('org', { to: CUSTOMER, body: 'a'.repeat(400) })).rejects.toMatchObject({
      feature: 'platformSmsDaily',
    })
    await expect(text()).resolves.toMatchObject({ to: CUSTOMER })
  })

  it('gives every part of a long text back when it fails to send', async () => {
    twilioDown = true
    await expect(sendOrgSms('org', { to: CUSTOMER, body: 'a'.repeat(400) })).rejects.toThrow()
    twilioDown = false

    await textTimes(30)

    expect(sent).toHaveLength(30)
  })

  it('says the country is not available from the Torqvoice number when Twilio refuses it', async () => {
    countryRefused = true

    await expect(text()).rejects.toMatchObject({
      name: 'SmsCountryRefusedError',
      platform: true,
      message: expect.stringContaining('not available from the Torqvoice number'),
    })
  })

  it('does not count a text to a refused country against the day', async () => {
    countryRefused = true
    await expect(text()).rejects.toThrow()
    countryRefused = false

    await textTimes(30)

    expect(sent).toHaveLength(30)
  })

  it('starts again the next day', async () => {
    const send = () => Promise.resolve('sent')
    const monday = new Date('2026-11-16T12:00:00Z')
    const tuesday = new Date('2026-11-17T00:00:01Z')
    for (let i = 0; i < 30; i++) await withPlatformSmsAllowance('org', 30, 'Hi', send, monday)
    await expect(withPlatformSmsAllowance('org', 30, 'Hi', send, monday)).rejects.toThrow()

    await expect(withPlatformSmsAllowance('org', 30, 'Hi', send, tuesday)).resolves.toBe('sent')
  })
})

describe('a platform account with a Messaging Service', () => {
  const SERVICE = 'MG00000000000000000000000000000000'

  beforeEach(() => {
    systemSettings = [
      ...platformAccount.filter((row) => !row.key.endsWith('phoneNumber')),
      { key: 'platformSms.twilio.messagingServiceSid', value: SERVICE },
    ]
  })

  it('sends through the service, which picks the sender for the country', async () => {
    await text()

    expect(sent).toEqual([
      {
        account: 'ACplatform',
        from: '',
        to: CUSTOMER,
        body: 'Your car is ready',
        service: SERVICE,
      },
    ])
  })

  it('needs no phone number, and records the text as from Torqvoice', async () => {
    expect(await getOrgSmsProvider('org')).toBe('twilio')
    expect(await getOrgSmsPhoneNumber('org')).toBe('Torqvoice')
  })

  it('uses the service when a number is saved as well', async () => {
    systemSettings = [...systemSettings, platformAccount[2]]

    await text()

    expect(sent[0]).toMatchObject({ from: '', service: SERVICE })
  })

  it('still counts against the daily allowance', async () => {
    await textTimes(30)

    await expect(text()).rejects.toMatchObject({ feature: 'platformSmsDaily', limit: 30 })
  })
})

describe('a workshop on the free plan', () => {
  beforeEach(() => {
    getFeatures.mockResolvedValue(PLAN_FEATURES.free)
  })

  it('is not offered SMS', async () => {
    expect(await getOrgSmsProvider('org')).toBeNull()
    expect(await getOrgSmsPhoneNumber('org')).toBeNull()
  })

  it('cannot send through the platform account', async () => {
    await expect(text()).rejects.toThrow('SMS is not configured')
    expect(sent).toHaveLength(0)
  })
})

describe('a workshop that connected its own provider', () => {
  beforeEach(() => {
    channelSettings.mockResolvedValue(ownTwilio)
  })

  it('keeps sending from its own number', async () => {
    await text()

    expect(sent).toEqual([
      { account: 'ACown', from: OWN_NUMBER, to: CUSTOMER, body: 'Your car is ready' },
    ])
    expect(await getPlatformSmsAllowance('org')).toBeNull()
  })

  it('has no daily limit', async () => {
    await textTimes(60)

    expect(sent).toHaveLength(60)
    expect(usage.size).toBe(0)
  })
})

describe('when there is no platform account to fall back on', () => {
  it('does not offer SMS until the account is complete', async () => {
    systemSettings = platformAccount.filter((row) => !row.key.endsWith('authToken'))

    expect(await getOrgSmsProvider('org')).toBeNull()
    await expect(text()).rejects.toThrow('SMS is not configured')
  })

  it('ignores a platform account on a self-hosted install', async () => {
    isCloudMode.mockReturnValue(false)

    expect(await getOrgSmsProvider('org')).toBeNull()
    await expect(text()).rejects.toThrow('SMS is not configured')
    expect(sent).toHaveLength(0)
  })
})
