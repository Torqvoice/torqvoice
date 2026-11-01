import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Keys a vendor issues late are saved onto a connection that is already
 * live, and the webhook on it only answers while it is. These hold the
 * save to never taking that connection down: when the new keys fail their
 * check, the row goes back to the sealed credentials and settings it had
 * and stays active, while a connection that was not live goes to error as
 * it always did.
 */

vi.mock('@/lib/with-auth', () => ({
  withAuth: (fn: (ctx: { organizationId: string; userId: string }) => unknown) =>
    fn({ organizationId: 'org-1', userId: 'user-1' }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/demo', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/demo')>()),
  demoGuard: vi.fn(),
}))
vi.mock('@/lib/features', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/features')>()),
  // Every plan flag on: the gate is not what these tests are about.
  getFeatures: vi.fn().mockResolvedValue(new Proxy({}, { get: () => true })),
}))
vi.mock('@/features/integrations/Lib/vault', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/integrations/Lib/vault')>()),
  openCredentials: vi.fn((sealed: string | null | undefined) =>
    sealed ? (JSON.parse(sealed) as Record<string, unknown>) : {}
  ),
}))
vi.mock('@/features/integrations/Lib/connections', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/integrations/Lib/connections')>()),
  loadConnection: vi.fn(),
  setConnectionStatus: vi.fn(),
  storeCredentials: vi.fn(),
  writeLog: vi.fn(),
}))
vi.mock('@/lib/db', () => ({
  db: {
    integrationConnection: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
    },
  },
}))

import { db } from '@/lib/db'
import {
  loadConnection,
  setConnectionStatus,
  storeCredentials,
  writeLog,
} from '@/features/integrations/Lib/connections'
import { saveIntegrationCredentials } from '@/features/integrations/Actions/integrationActions'

const findUnique = vi.mocked(db.integrationConnection.findUnique)
const upsert = vi.mocked(db.integrationConnection.upsert)
const update = vi.mocked(db.integrationConnection.update)

const STORED = JSON.stringify({
  verifyToken: 'verify-me',
  appSecret: 'app-secret',
  webhookSecret: 'hook-secret',
})

function connection(status: 'active' | 'pending') {
  return {
    id: 'conn-1',
    organizationId: 'org-1',
    connectorId: 'whatsapp-meta',
    status,
    credentials: STORED,
    settings: { webhookFingerprint: 'fp-1' },
    state: {},
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  upsert.mockResolvedValue({ id: 'conn-1' } as never)
  update.mockResolvedValue({} as never)
  vi.mocked(loadConnection).mockResolvedValue({
    ctx: {},
    server: { test: vi.fn().mockResolvedValue({ ok: false, message: 'Meta rejected the token' }) },
  } as never)
})

describe('saveIntegrationCredentials when the new keys fail their check', () => {
  it('puts a live connection back as it was and leaves it active', async () => {
    findUnique.mockResolvedValue(connection('active') as never)

    await expect(
      saveIntegrationCredentials('whatsapp-meta', { phoneNumberId: '123', accessToken: 'bad' })
    ).rejects.toThrow('Meta rejected the token')

    // The new keys were written for the check, then the old row came back.
    expect(storeCredentials).toHaveBeenCalledWith(
      'conn-1',
      expect.objectContaining({
        phoneNumberId: '123',
        accessToken: 'bad',
        verifyToken: 'verify-me',
      })
    )
    expect(update).toHaveBeenLastCalledWith({
      where: { id: 'conn-1' },
      data: { credentials: STORED, settings: { webhookFingerprint: 'fp-1' } },
    })
    expect(setConnectionStatus).not.toHaveBeenCalled()
    expect(writeLog).toHaveBeenCalledWith(
      'conn-1',
      'warn',
      expect.stringContaining('Meta rejected the token')
    )
  })

  it('still marks a connection that was not live as errored', async () => {
    findUnique.mockResolvedValue(connection('pending') as never)

    await expect(
      saveIntegrationCredentials('whatsapp-meta', {
        verifyToken: 'verify-me',
        appSecret: 'app-secret',
        phoneNumberId: '123',
        accessToken: 'bad',
      })
    ).rejects.toThrow('Meta rejected the token')

    expect(setConnectionStatus).toHaveBeenCalledWith('conn-1', 'error', 'Meta rejected the token')
    const restored = update.mock.calls.find((c) => c[0].data.credentials === STORED)
    expect(restored).toBeUndefined()
  })
})
