/**
 * @vitest-environment node
 *
 * Storing a pasted perpetual token. It is verified offline against the
 * workshop's registration number, kept even on a mismatch so the License page
 * can say which number to fix, and refused only when it does not verify.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({
  db: {
    appSetting: {
      findUnique: vi.fn(),
      upsert: vi.fn((args: unknown) => ({ op: 'upsert', args })),
      deleteMany: vi.fn((args: unknown) => ({ op: 'deleteMany', args })),
    },
    organizationMember: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  },
}))

vi.mock('@/lib/license/token', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/license/token')>()
  return { ...actual, verifyLicenseToken: vi.fn() }
})

import { db } from '@/lib/db'
import { storePerpetualLicense } from '@/lib/license/revalidate'
import {
  type LicenseTokenVerification,
  type PerpetualLicensePayload,
  verifyLicenseToken,
} from '@/lib/license/token'

const ORG = 'org-1'
const TOKEN = 'tvp1.payload.sig'
const LICENSEE = {
  name: 'Example Workshop AS',
  registrationNumber: 'NO 123 456 789 MVA',
  country: 'NO',
}
const PAYLOAD: PerpetualLicensePayload = {
  v: 1,
  lid: 'lic-p1',
  org: ORG,
  plan: 'white-label',
  maxOrganizations: 1,
  licensee: LICENSEE,
  issuedAt: '2026-10-01T00:00:00.000Z',
}

function perpetual(status: LicenseTokenVerification['status']): LicenseTokenVerification {
  const read = status === 'valid' || status === 'mismatch'
  return {
    status,
    kind: read ? 'perpetual' : null,
    payload: read ? PAYLOAD : null,
    ageDays: read ? 30 : null,
    daysUntilExpiry: null,
    expiresAt: null,
    maxOrganizations: read ? 1 : null,
    licensee: read ? LICENSEE : null,
  }
}

type Write = { op: string; args: { where: Record<string, unknown>; update?: { value: string } } }

function writes(): Write[] {
  const call = vi.mocked(db.$transaction).mock.calls[0]
  return (call?.[0] ?? []) as unknown as Write[]
}

function stored(key: string): string | undefined {
  const write = writes().find(
    (w) =>
      w.op === 'upsert' &&
      (w.args.where.organizationId_key as { key: string } | undefined)?.key === key
  )
  return write?.args.update?.value
}

beforeEach(() => {
  vi.mocked(db.appSetting.upsert).mockClear()
  vi.mocked(db.appSetting.deleteMany).mockClear()
  vi.mocked(db.appSetting.findUnique).mockReset()
  vi.mocked(db.$transaction).mockReset().mockResolvedValue([])
  vi.mocked(db.organizationMember.findFirst)
    .mockReset()
    .mockResolvedValue({ userId: 'u-1' } as never)
  vi.mocked(verifyLicenseToken).mockReset()
  vi.mocked(db.appSetting.findUnique).mockResolvedValue({ value: 'NO123456789MVA' } as never)
})

describe('storePerpetualLicense', () => {
  it('verifies against the workshop registration number', async () => {
    vi.mocked(verifyLicenseToken).mockReturnValue(perpetual('valid'))
    await storePerpetualLicense(ORG, TOKEN, 'u-1')
    expect(db.appSetting.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId_key: { organizationId: ORG, key: 'invoice.orgNumber' } },
      })
    )
    expect(verifyLicenseToken).toHaveBeenCalledWith(TOKEN, ORG, {
      registrationNumber: 'NO123456789MVA',
    })
  })

  it('stores a valid token and drops the subscription key and term', async () => {
    vi.mocked(verifyLicenseToken).mockReturnValue(perpetual('valid'))
    const verification = await storePerpetualLicense(ORG, TOKEN, 'u-1')

    expect(verification.status).toBe('valid')
    expect(db.$transaction).toHaveBeenCalledTimes(1)
    expect(stored('license.token')).toBe(TOKEN)
    expect(stored('license.valid')).toBe('true')
    expect(stored('license.plan')).toBe('white-label')
    expect(Number.isNaN(Date.parse(stored('license.checkedAt') ?? ''))).toBe(false)
    expect(db.appSetting.deleteMany).toHaveBeenCalledWith({
      where: { organizationId: ORG, key: { in: ['license.key', 'license.expiresAt'] } },
    })
    expect(writes().some((w) => w.op === 'deleteMany')).toBe(true)
  })

  it('stores a mismatched token too, marked not valid', async () => {
    vi.mocked(verifyLicenseToken).mockReturnValue(perpetual('mismatch'))
    const verification = await storePerpetualLicense(ORG, TOKEN, 'u-1')

    expect(verification.status).toBe('mismatch')
    expect(verification.licensee).toEqual(LICENSEE)
    expect(stored('license.token')).toBe(TOKEN)
    expect(stored('license.valid')).toBe('false')
    expect(db.appSetting.deleteMany).toHaveBeenCalledWith({
      where: { organizationId: ORG, key: { in: ['license.key', 'license.expiresAt'] } },
    })
  })

  it('stores nothing when the token does not verify', async () => {
    vi.mocked(verifyLicenseToken).mockReturnValue(perpetual('invalid'))
    const verification = await storePerpetualLicense(ORG, TOKEN, 'u-1')

    expect(verification.status).toBe('invalid')
    expect(db.$transaction).not.toHaveBeenCalled()
    expect(db.appSetting.upsert).not.toHaveBeenCalled()
    expect(db.appSetting.deleteMany).not.toHaveBeenCalled()
  })

  it('verifies with no registration number when the workshop has none', async () => {
    vi.mocked(db.appSetting.findUnique).mockResolvedValue(null)
    vi.mocked(verifyLicenseToken).mockReturnValue(perpetual('mismatch'))
    await storePerpetualLicense(ORG, TOKEN, 'u-1')
    expect(verifyLicenseToken).toHaveBeenCalledWith(TOKEN, ORG, { registrationNumber: undefined })
  })
})
