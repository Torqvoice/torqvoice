/**
 * @vitest-environment node
 *
 * A perpetual (offline) token on disk is never overwritten by a refresh, a
 * rejected key or an unreachable torqvoice.com. The check happens inside the
 * same transaction as the writes, so a response that was already in flight
 * when the token was pasted cannot land on top of it. Only a key
 * torqvoice.com accepts, typed by the owner, replaces it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const tx = {
  appSetting: {
    findUnique: vi.fn(),
    upsert: vi.fn(async (args: unknown) => args),
    deleteMany: vi.fn(async (args: unknown) => args),
  },
}
vi.mock('@/lib/db', () => ({
  db: {
    appSetting: { findMany: vi.fn(), findUnique: vi.fn() },
    organizationMember: { findFirst: vi.fn() },
    $transaction: vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
  },
}))
vi.mock('@/lib/license/token', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/license/token')>()
  return { ...actual, verifyLicenseToken: vi.fn() }
})
vi.mock('@/lib/torqvoice-com', () => ({ torqvoiceComUrl: () => 'https://torqvoice.test' }))

import { db } from '@/lib/db'
import {
  type RemoteLicenseResult,
  revalidateLicense,
  storeRemoteLicense,
} from '@/lib/license/revalidate'
import { type LicenseTokenVerification, verifyLicenseToken } from '@/lib/license/token'

const ORG = 'org-1'
const USER = 'u-1'

function verification(
  kind: LicenseTokenVerification['kind'],
  status: LicenseTokenVerification['status']
): LicenseTokenVerification {
  return {
    status,
    kind,
    payload: null,
    ageDays: null,
    daysUntilExpiry: null,
    expiresAt: null,
    maxOrganizations: null,
    licensee: null,
  }
}

const REJECTED: RemoteLicenseResult = {
  reachable: true,
  valid: false,
  plan: 'free',
  expiresAt: '',
  token: null,
  error: 'License not found',
}
const ACCEPTED: RemoteLicenseResult = {
  reachable: true,
  valid: true,
  plan: 'white-label',
  expiresAt: '2027-01-01T00:00:00.000Z',
  token: 'tvl1.fresh.sig',
}
const UNREACHABLE: RemoteLicenseResult = {
  reachable: false,
  valid: false,
  plan: 'free',
  expiresAt: '',
  token: null,
}

function upsertedKeys(): string[] {
  return tx.appSetting.upsert.mock.calls.map(
    (c) => (c[0] as { where: { organizationId_key: { key: string } } }).where.organizationId_key.key
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  tx.appSetting.findUnique.mockResolvedValue({ value: 'tvp1.on.disk' })
})

describe('storeRemoteLicense beside a perpetual token', () => {
  beforeEach(() => {
    vi.mocked(verifyLicenseToken).mockReturnValue(verification('perpetual', 'valid'))
  })

  it('writes nothing when torqvoice.com rejects a key, even from the Validate button', async () => {
    const wrote = await storeRemoteLicense(ORG, 'TQV-WRONG', REJECTED, USER, {
      replacePerpetual: true,
    })
    expect(wrote).toBe(false)
    expect(tx.appSetting.upsert).not.toHaveBeenCalled()
    expect(tx.appSetting.deleteMany).not.toHaveBeenCalled()
  })

  it('writes nothing when torqvoice.com is unreachable', async () => {
    expect(await storeRemoteLicense(ORG, 'TQV-ANY', UNREACHABLE, USER)).toBe(false)
    expect(tx.appSetting.upsert).not.toHaveBeenCalled()
  })

  it('ignores an accepted key from a refresh, which never replaces an offline licence', async () => {
    expect(await storeRemoteLicense(ORG, 'TQV-OLD', ACCEPTED, USER)).toBe(false)
    expect(tx.appSetting.upsert).not.toHaveBeenCalled()
  })

  it('lets the owner replace it with a key torqvoice.com accepts', async () => {
    const wrote = await storeRemoteLicense(ORG, 'TQV-NEW', ACCEPTED, USER, {
      replacePerpetual: true,
    })
    expect(wrote).toBe(true)
    expect(upsertedKeys()).toEqual(
      expect.arrayContaining(['license.key', 'license.token', 'license.valid', 'license.expiresAt'])
    )
  })

  it('reads the token inside the transaction, so an in-flight response sees the pasted token', async () => {
    await storeRemoteLicense(ORG, 'TQV-OLD', ACCEPTED, USER)
    expect(tx.appSetting.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId_key: { organizationId: ORG, key: 'license.token' } },
      })
    )
    expect(db.appSetting.findUnique).not.toHaveBeenCalled()
  })
})

describe('storeRemoteLicense with a subscription or no token on disk', () => {
  it('stores an accepted key and token as before', async () => {
    vi.mocked(verifyLicenseToken).mockReturnValue(verification('subscription', 'stale'))
    expect(await storeRemoteLicense(ORG, 'TQV-OK', ACCEPTED, USER)).toBe(true)
    expect(upsertedKeys()).toEqual(
      expect.arrayContaining(['license.key', 'license.checkedAt', 'license.token'])
    )
  })

  it('drops a subscription token torqvoice.com no longer vouches for', async () => {
    vi.mocked(verifyLicenseToken).mockReturnValue(verification('subscription', 'valid'))
    expect(await storeRemoteLicense(ORG, 'TQV-OLD', REJECTED, USER)).toBe(true)
    expect(tx.appSetting.deleteMany).toHaveBeenCalledWith({
      where: { organizationId: ORG, key: 'license.token' },
    })
  })

  it('only records the check when torqvoice.com is unreachable', async () => {
    vi.mocked(verifyLicenseToken).mockReturnValue(verification(null, 'missing'))
    tx.appSetting.findUnique.mockResolvedValue(null)
    expect(await storeRemoteLicense(ORG, 'TQV-ANY', UNREACHABLE, USER)).toBe(true)
    expect(upsertedKeys()).toEqual(['license.key', 'license.checkedAt'])
  })
})

describe('revalidateLicense', () => {
  it('does not even call torqvoice.com for a refresh when a perpetual token is on disk', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    vi.mocked(db.appSetting.findMany).mockResolvedValue([
      { key: 'license.token', value: 'tvp1.on.disk' },
      { key: 'invoice.orgNumber', value: 'NO 123 456 789 MVA' },
    ] as never)
    vi.mocked(verifyLicenseToken).mockReturnValue(verification('perpetual', 'valid'))

    const result = await revalidateLicense(ORG, 'TQV-LEFTOVER')

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(result.remote).toBeNull()
    expect(result.verification.kind).toBe('perpetual')
    // Verified against the workshop's own number, as the feature gate does.
    expect(verifyLicenseToken).toHaveBeenCalledWith('tvp1.on.disk', ORG, {
      registrationNumber: 'NO 123 456 789 MVA',
    })
    expect(db.$transaction).not.toHaveBeenCalled()
  })
})
