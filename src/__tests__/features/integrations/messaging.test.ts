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

const appSetting = { findMany: vi.fn(), findFirst: vi.fn() }
const integrationConnection = {
  findMany: vi.fn(),
  findFirst: vi.fn(),
  upsert: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
}

vi.mock('@/lib/db', () => ({ db: { appSetting, integrationConnection } }))

const { asLegacyMap, channelSetup, webhookSecretHash } = await import(
  '@/features/integrations/Lib/messaging'
)

function legacyRows(values: Record<string, string>) {
  return Object.entries(values).map(([key, value]) => ({ key, value, userId: 'user-1' }))
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.INTEGRATIONS_ENCRYPTION_KEY = 'a'.repeat(64)
  integrationConnection.findMany.mockResolvedValue([])
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
    integrationConnection.upsert.mockImplementation(({ create }) => ({
      id: 'conn-1',
      credentials: create.credentials,
      settings: create.settings,
      status: create.status,
    }))

    const setup = await channelSetup('org-1', 'sms')

    expect(setup?.connectorId).toBe('twilio-sms')
    expect(setup?.credentials.accountSid).toBe('AC123')
    expect(setup?.credentials.authToken).toBe('secret-token')
    // The vendor already points its webhook at this secret, so it is carried
    // over rather than replaced.
    expect(setup?.credentials.webhookSecret).toBe('existing-webhook-secret')
    expect(setup?.settings.phoneNumber).toBe('+15551234567')

    const created = integrationConnection.upsert.mock.calls[0][0].create
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
    integrationConnection.upsert.mockImplementation(({ create }) => ({
      id: 'conn-2',
      credentials: create.credentials,
      settings: create.settings,
      status: create.status,
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
    expect(integrationConnection.upsert).not.toHaveBeenCalled()
  })

  it('says nothing is set up when nothing ever was', async () => {
    appSetting.findMany.mockResolvedValue([])
    expect(await channelSetup('org-4', 'whatsapp')).toBeNull()
    expect(integrationConnection.upsert).not.toHaveBeenCalled()
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
})
