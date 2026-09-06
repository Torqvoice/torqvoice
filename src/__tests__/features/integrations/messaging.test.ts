import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listWhatsappAdapters } from '@/lib/whatsapp/registry'
import {
  MESSAGING_PROVIDERS,
  legacyKeysForChannel,
  messagingProvider,
  providerForLegacyId,
  providersForChannel,
} from '@/integrations/messaging/catalog'
import { ORG_SMS_KEYS } from '@/features/sms/Schema/smsSettingsSchema'
import { whatsappCredentialKey } from '@/features/whatsapp/Schema/whatsappSettingsSchema'

const appSetting = { findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), upsert: vi.fn() }
const integrationConnection = {
  findMany: vi.fn(),
  findFirst: vi.fn(),
  findUnique: vi.fn(),
  create: vi.fn(),
  upsert: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
}

vi.mock('@/lib/db', () => ({ db: { appSetting, integrationConnection } }))

const {
  adoptedMarkerKey,
  asLegacyMap,
  channelEnabled,
  channelSetup,
  completeMessagingCredentials,
  legacyProviderNamed,
  organizationForWebhookSecret,
  webhookSecretHash,
} = await import('@/features/integrations/Lib/messaging')

function legacyRows(values: Record<string, string>) {
  return Object.entries(values).map(([key, value]) => ({ key, value, userId: 'user-1' }))
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.INTEGRATIONS_ENCRYPTION_KEY = 'a'.repeat(64)
  integrationConnection.findMany.mockResolvedValue([])
  integrationConnection.findUnique.mockResolvedValue(null)
  integrationConnection.findFirst.mockResolvedValue(null)
  appSetting.findUnique.mockResolvedValue(null)
})

/**
 * The move is only safe if a workshop that set a channel up years ago keeps
 * sending without touching anything, so that is what these check.
 */
describe('messaging catalog', () => {
  it('gives every vendor a unique id and a channel', () => {
    const ids = MESSAGING_PROVIDERS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(providersForChannel('sms').map((p) => p.id)).toEqual([
      'twilio-sms',
      'vonage-sms',
      'telnyx-sms',
    ])
  })

  it('maps every old provider value onto a connector', () => {
    expect(providerForLegacyId('sms', 'twilio')?.id).toBe('twilio-sms')
    expect(providerForLegacyId('email', 'ses')?.id).toBe('amazon-ses')
    // Telegram never had a provider row; the one connector answers regardless.
    expect(providerForLegacyId('telegram', null)?.id).toBe('telegram')
    expect(providerForLegacyId('sms', 'nonsense')).toBeNull()
  })

  it('declares the same WhatsApp credentials the adapters do', () => {
    for (const adapter of listWhatsappAdapters()) {
      const connector = MESSAGING_PROVIDERS.find(
        (p) => p.channel === 'whatsapp' && p.legacyProvider === adapter.id
      )
      expect(connector, `no connector for WhatsApp adapter ${adapter.id}`).toBeTruthy()
      for (const field of adapter.credentials) {
        const declared = connector?.credentials.find((c) => c.key === field.key)
        expect(declared, `${adapter.id} is missing ${field.key}`).toBeTruthy()
        expect(declared?.legacy).toBe(whatsappCredentialKey(adapter.id, field.key))
      }
    }
  })

  it('lists the old keys a channel could have used', () => {
    const keys = legacyKeysForChannel('sms')
    expect(keys).toContain(ORG_SMS_KEYS.SMS_TWILIO_ACCOUNT_SID)
    expect(keys).toContain(ORG_SMS_KEYS.SMS_PHONE_NUMBER)
    // One entry, even though all three vendors point at it.
    expect(keys.filter((k) => k === ORG_SMS_KEYS.SMS_PHONE_NUMBER)).toHaveLength(1)
  })
})

describe('adopting an existing setup', () => {
  it('turns old Twilio settings into a connection without asking anything', async () => {
    appSetting.findMany.mockResolvedValue(
      legacyRows({
        [ORG_SMS_KEYS.SMS_PROVIDER]: 'twilio',
        [ORG_SMS_KEYS.SMS_TWILIO_ACCOUNT_SID]: 'AC123',
        [ORG_SMS_KEYS.SMS_TWILIO_AUTH_TOKEN]: 'secret-token',
        [ORG_SMS_KEYS.SMS_PHONE_NUMBER]: '+15551234567',
        [ORG_SMS_KEYS.SMS_WEBHOOK_SECRET]: 'existing-webhook-secret',
      })
    )
    integrationConnection.create.mockImplementation(({ data }) => ({
      id: 'conn-1',
      credentials: data.credentials,
      settings: data.settings,
      status: data.status,
    }))

    const setup = await channelSetup('org-1', 'sms')

    expect(setup?.connectorId).toBe('twilio-sms')
    expect(setup?.credentials.accountSid).toBe('AC123')
    expect(setup?.credentials.authToken).toBe('secret-token')
    // The vendor already points its webhook at this secret, so it is carried
    // over rather than replaced.
    expect(setup?.credentials.webhookSecret).toBe('existing-webhook-secret')
    expect(setup?.settings.phoneNumber).toBe('+15551234567')

    const created = integrationConnection.create.mock.calls[0][0].data
    expect(created.status).toBe('active')
    expect(created.credentials).not.toContain('secret-token')
    expect(created.settings.webhookSecretHash).toBe(webhookSecretHash('existing-webhook-secret'))
  })

  it('hands the send path its values under the keys it already reads', async () => {
    appSetting.findMany.mockResolvedValue(
      legacyRows({
        [ORG_SMS_KEYS.SMS_PROVIDER]: 'telnyx',
        [ORG_SMS_KEYS.SMS_TELNYX_API_KEY]: 'KEY123',
        [ORG_SMS_KEYS.SMS_PHONE_NUMBER]: '+4791234567',
      })
    )
    integrationConnection.create.mockImplementation(({ data }) => ({
      id: 'conn-2',
      credentials: data.credentials,
      settings: data.settings,
      status: data.status,
    }))

    const setup = await channelSetup('org-2', 'sms')
    const map = asLegacyMap(setup!)

    expect(map.get(ORG_SMS_KEYS.SMS_PROVIDER)).toBe('telnyx')
    expect(map.get(ORG_SMS_KEYS.SMS_TELNYX_API_KEY)).toBe('KEY123')
    expect(map.get(ORG_SMS_KEYS.SMS_PHONE_NUMBER)).toBe('+4791234567')
  })

  it('leaves a half-filled setup alone rather than connecting something that cannot send', async () => {
    appSetting.findMany.mockResolvedValue(
      legacyRows({
        [ORG_SMS_KEYS.SMS_PROVIDER]: 'twilio',
        [ORG_SMS_KEYS.SMS_TWILIO_ACCOUNT_SID]: 'AC123',
        // No auth token: the workshop never finished.
      })
    )

    expect(await channelSetup('org-3', 'sms')).toBeNull()
    expect(integrationConnection.create).not.toHaveBeenCalled()
  })

  it('says nothing is set up when nothing ever was', async () => {
    appSetting.findMany.mockResolvedValue([])
    expect(await channelSetup('org-4', 'whatsapp')).toBeNull()
    expect(integrationConnection.create).not.toHaveBeenCalled()
  })

  it('leaves a marker so a channel is adopted once and a later disconnect sticks', async () => {
    appSetting.findMany.mockResolvedValue(
      legacyRows({
        [ORG_SMS_KEYS.SMS_PROVIDER]: 'twilio',
        [ORG_SMS_KEYS.SMS_TWILIO_ACCOUNT_SID]: 'AC123',
        [ORG_SMS_KEYS.SMS_TWILIO_AUTH_TOKEN]: 'secret-token',
        [ORG_SMS_KEYS.SMS_PHONE_NUMBER]: '+15551234567',
      })
    )
    integrationConnection.create.mockImplementation(({ data }) => ({
      id: 'conn-1',
      credentials: data.credentials,
      settings: data.settings,
      status: data.status,
    }))

    expect((await channelSetup('org-7', 'sms'))?.connectorId).toBe('twilio-sms')
    const marker = appSetting.upsert.mock.calls[0][0]
    expect(marker.create.key).toBe(adoptedMarkerKey('sms'))
    expect(marker.create.userId).toBe('user-1')

    // The workshop disconnects Twilio: the row is gone, the old settings are
    // not, and the marker is what stops them coming back on the next send.
    appSetting.findMany.mockResolvedValue([
      ...legacyRows({
        [ORG_SMS_KEYS.SMS_PROVIDER]: 'twilio',
        [ORG_SMS_KEYS.SMS_TWILIO_ACCOUNT_SID]: 'AC123',
        [ORG_SMS_KEYS.SMS_TWILIO_AUTH_TOKEN]: 'secret-token',
      }),
      { key: adoptedMarkerKey('sms'), value: '2026-09-02T00:00:00.000Z', userId: 'user-1' },
    ])
    integrationConnection.create.mockClear()

    expect(await channelSetup('org-7', 'sms')).toBeNull()
    expect(integrationConnection.create).not.toHaveBeenCalled()
  })

  it('does not adopt a vendor the workshop had switched away from', async () => {
    // The old email form cleared the provider row to go back to the
    // platform's mail, and left the Resend key where it was.
    appSetting.findMany.mockResolvedValue(
      legacyRows({
        'email.provider': '',
        'email.resend.apiKey': 're_123',
        'email.resend.fromEmail': 'hi@example.com',
      })
    )

    expect(await channelSetup('org-8', 'email')).toBeNull()
    expect(integrationConnection.create).not.toHaveBeenCalled()
  })

  it('still adopts a Telegram bot, which never had a provider row', async () => {
    appSetting.findMany.mockResolvedValue(
      legacyRows({
        'telegram.botToken': '123:abc',
        'telegram.botUsername': 'shopbot',
        'telegram.webhookSecret': 'hook-secret',
      })
    )
    integrationConnection.create.mockImplementation(({ data }) => ({
      id: 'conn-t',
      credentials: data.credentials,
      settings: data.settings,
      status: data.status,
    }))

    const setup = await channelSetup('org-9', 'telegram')
    expect(setup?.connectorId).toBe('telegram')
    expect(setup?.credentials.webhookSecret).toBe('hook-secret')
    expect(setup?.settings.botUsername).toBe('shopbot')
  })

  it('applies the catalog defaults a fresh connection never saved', async () => {
    const { sealCredentials } = await import('@/features/integrations/Lib/vault')
    integrationConnection.findMany.mockResolvedValue([
      {
        id: 'conn-w',
        connectorId: 'whatsapp-meta',
        credentials: sealCredentials({ phoneNumberId: '1', accessToken: 't', verifyToken: 'v' }),
        settings: { phoneNumber: '+4712345678' },
      },
    ])

    const setup = await channelSetup('org-10', 'whatsapp')
    expect(setup?.settings.enabled).toBe(true)
    expect(asLegacyMap(setup!).get('whatsapp.enabled')).toBe('true')
    expect(await channelEnabled('org-10', 'whatsapp')).toBe(true)
  })

  it('keeps a switched-off WhatsApp off after adoption', async () => {
    appSetting.findMany.mockResolvedValue(
      legacyRows({
        'whatsapp.provider': 'meta',
        'whatsapp.enabled': 'false',
        'whatsapp.from': '+4712345678',
        [whatsappCredentialKey('meta', 'phoneNumberId')]: '1',
        [whatsappCredentialKey('meta', 'accessToken')]: 't',
        [whatsappCredentialKey('meta', 'verifyToken')]: 'v',
      })
    )
    integrationConnection.create.mockImplementation(({ data }) => ({
      id: 'conn-w2',
      credentials: data.credentials,
      settings: data.settings,
      status: data.status,
    }))

    expect(await channelEnabled('org-11', 'whatsapp')).toBe(false)
  })

  it('mints the webhook secret and its fingerprint when keys come from the form', () => {
    const done = completeMessagingCredentials('telnyx-sms', { apiKey: 'KEY' })
    expect(done.credentials.apiKey).toBe('KEY')
    expect(done.credentials.webhookSecret).toMatch(/^[0-9a-f]{48}$/)
    expect(done.settings.webhookSecretHash).toBe(
      webhookSecretHash(done.credentials.webhookSecret as string)
    )
    // Not a messaging connector: nothing to add.
    expect(completeMessagingCredentials('google-calendar', { a: '1' })).toEqual({
      credentials: { a: '1' },
      settings: {},
    })
  })

  it('prefers a live connection over the old rows', async () => {
    const { sealCredentials } = await import('@/features/integrations/Lib/vault')
    integrationConnection.findMany.mockResolvedValue([
      {
        id: 'conn-9',
        connectorId: 'vonage-sms',
        credentials: sealCredentials({ apiKey: 'new-key', apiSecret: 'new-secret' }),
        settings: { phoneNumber: '+4712345678' },
      },
    ])

    const setup = await channelSetup('org-5', 'sms')

    expect(setup?.connectorId).toBe('vonage-sms')
    expect(setup?.credentials.apiKey).toBe('new-key')
    expect(appSetting.findMany).not.toHaveBeenCalled()
  })

  it('mints a webhook secret for a connection that has none yet', async () => {
    const { sealCredentials } = await import('@/features/integrations/Lib/vault')
    integrationConnection.findMany.mockResolvedValue([
      {
        id: 'conn-10',
        connectorId: 'twilio-sms',
        credentials: sealCredentials({ accountSid: 'AC1', authToken: 'tok' }),
        settings: {},
      },
    ])

    const setup = await channelSetup('org-6', 'sms')

    expect(setup?.credentials.webhookSecret).toMatch(/^[0-9a-f]{48}$/)
    expect(integrationConnection.update).toHaveBeenCalledOnce()
    expect(setup?.settings.webhookSecretHash).toBe(
      webhookSecretHash(setup?.credentials.webhookSecret as string)
    )
  })
})

describe('one vendor per channel', () => {
  it('knows a connector by id', () => {
    expect(messagingProvider('smtp')?.channel).toBe('email')
    expect(messagingProvider('google-calendar')).toBeNull()
  })

  it('does not adopt over keys the workshop is fixing, and does not mark the channel', async () => {
    appSetting.findMany.mockResolvedValue(
      legacyRows({
        [ORG_SMS_KEYS.SMS_PROVIDER]: 'twilio',
        [ORG_SMS_KEYS.SMS_TWILIO_ACCOUNT_SID]: 'AC123',
        [ORG_SMS_KEYS.SMS_TWILIO_AUTH_TOKEN]: 'secret-token',
      })
    )
    // A Twilio row already exists, in error after a failed check.
    integrationConnection.findUnique.mockResolvedValue({ id: 'conn-err' })

    expect(await channelSetup('org-12', 'sms')).toBeNull()
    expect(integrationConnection.create).not.toHaveBeenCalled()
    expect(appSetting.upsert).not.toHaveBeenCalled()
  })

  it('uses the winner of a first-send race instead of failing', async () => {
    const { sealCredentials } = await import('@/features/integrations/Lib/vault')
    appSetting.findMany.mockResolvedValue(
      legacyRows({
        [ORG_SMS_KEYS.SMS_PROVIDER]: 'twilio',
        [ORG_SMS_KEYS.SMS_TWILIO_ACCOUNT_SID]: 'AC123',
        [ORG_SMS_KEYS.SMS_TWILIO_AUTH_TOKEN]: 'secret-token',
      })
    )
    integrationConnection.create.mockRejectedValue({ code: 'P2002' })
    integrationConnection.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 'conn-winner',
      credentials: sealCredentials({ accountSid: 'AC123', authToken: 'secret-token' }),
      settings: {},
      status: 'active',
    })

    const setup = await channelSetup('org-13', 'sms')
    expect(setup?.connectionId).toBe('conn-winner')
    expect(setup?.credentials.accountSid).toBe('AC123')
  })

  it('keeps sending from the old rows when a connection cannot be unsealed', async () => {
    appSetting.findMany.mockResolvedValue(
      legacyRows({
        [ORG_SMS_KEYS.SMS_PROVIDER]: 'twilio',
        [ORG_SMS_KEYS.SMS_TWILIO_ACCOUNT_SID]: 'AC123',
        [ORG_SMS_KEYS.SMS_TWILIO_AUTH_TOKEN]: 'secret-token',
        [ORG_SMS_KEYS.SMS_PHONE_NUMBER]: '+15551234567',
      })
    )
    integrationConnection.findMany.mockResolvedValue([
      {
        id: 'conn-bad',
        connectorId: 'twilio-sms',
        credentials: 'v1.not.real.data',
        settings: {},
      },
    ])
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const setup = await channelSetup('org-14', 'sms')
    expect(setup?.credentials.accountSid).toBe('AC123')
    expect(setup?.settings.phoneNumber).toBe('+15551234567')
    expect(error).toHaveBeenCalled()
    expect(integrationConnection.create).not.toHaveBeenCalled()
    error.mockRestore()
  })

  it('names the vendor an unfinished email setup pointed at', async () => {
    appSetting.findUnique.mockResolvedValue({ value: 'mailgun' })
    expect(await legacyProviderNamed('org-15', 'email')).toBe('mailgun')
    appSetting.findUnique.mockResolvedValue({ value: '' })
    expect(await legacyProviderNamed('org-15', 'email')).toBeNull()
    expect(await legacyProviderNamed('org-15', 'telegram')).toBeNull()
  })
})

describe('inbound webhook lookup', () => {
  it('resolves a connected workshop by the fingerprint of its secret', async () => {
    integrationConnection.findFirst.mockResolvedValue({ organizationId: 'org-20' })
    expect(await organizationForWebhookSecret('sms', 'abc', 'sms.webhookSecret')).toBe('org-20')
    expect(integrationConnection.findFirst.mock.calls[0][0].where.settings.equals).toBe(
      webhookSecretHash('abc')
    )
    expect(appSetting.findFirst).not.toHaveBeenCalled()
  })

  it('still resolves a workshop that has not been adopted yet from its old row', async () => {
    appSetting.findFirst.mockResolvedValue({ organizationId: 'org-21' })
    expect(await organizationForWebhookSecret('sms', 'old', 'sms.webhookSecret')).toBe('org-21')
  })

  it('stops answering for an old secret once the channel has moved on', async () => {
    appSetting.findFirst.mockResolvedValue({ organizationId: 'org-22' })
    appSetting.findUnique.mockResolvedValue({ id: 'marker' })
    expect(await organizationForWebhookSecret('sms', 'old', 'sms.webhookSecret')).toBeNull()

    appSetting.findUnique.mockResolvedValue(null)
    integrationConnection.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'conn-retired' })
    expect(await organizationForWebhookSecret('sms', 'old', 'sms.webhookSecret')).toBeNull()
  })

  it('ignores an empty secret', async () => {
    expect(await organizationForWebhookSecret('sms', '  ', 'sms.webhookSecret')).toBeNull()
    expect(integrationConnection.findFirst).not.toHaveBeenCalled()
  })
})
