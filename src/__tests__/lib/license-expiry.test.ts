import { vi, describe, it, expect, beforeEach } from 'vitest'

// Mock dependencies
vi.mock('@/lib/db', () => ({
  db: {
    appSetting: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
    organizationMember: {
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}))

vi.mock('@/lib/email', () => ({
  sendOrgMail: vi.fn().mockResolvedValue(undefined),
  getOrgFromAddress: vi.fn().mockResolvedValue('noreply@test.com'),
}))

vi.mock('@/lib/notify', () => ({
  notify: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/notification-bus', () => ({
  notificationBus: { emit: vi.fn() },
}))

vi.mock('@/lib/license/revalidate', () => ({
  revalidateLicense: vi.fn(),
}))

vi.mock('@/lib/license/token', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/license/token')>()
  return { ...actual, verifyLicenseToken: vi.fn() }
})

import { db } from '@/lib/db'
import { sendOrgMail, getOrgFromAddress } from '@/lib/email'
import { notify } from '@/lib/notify'
import { revalidateLicense } from '@/lib/license/revalidate'
import {
  LICENSE_TOKEN_MAX_AGE_DAYS,
  LICENSE_TOKEN_WARN_AGE_DAYS,
  verifyLicenseToken,
  type LicenseTokenVerification,
} from '@/lib/license/token'
import {
  refreshLicensesMissingTokens,
  revalidateOrganizationLicense,
  sendExpiryWarning,
} from '@/lib/cron/check-licenses'

const ORG_ID = 'org-test-1'
const USER_ID = 'user-test-1'
const LICENSE_KEY = 'test-license-key'

function daysFromNow(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString()
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(db.organizationMember.findFirst).mockResolvedValue({
    userId: USER_ID,
  } as any)
  vi.mocked(db.$transaction).mockResolvedValue(undefined)
  vi.mocked(db.appSetting.upsert).mockResolvedValue({} as any)
})

describe('sendExpiryWarning', () => {
  it('sends notification and email when no warning sent today', async () => {
    vi.mocked(db.appSetting.findUnique).mockResolvedValue(null)
    vi.mocked(db.organizationMember.findFirst).mockResolvedValue({
      userId: USER_ID,
      user: { email: 'owner@test.com' },
    } as any)

    await sendExpiryWarning(ORG_ID, 7)

    // Records today's warning
    expect(db.appSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId_key: {
            organizationId: ORG_ID,
            key: 'license.lastExpiryWarning',
          },
        },
      })
    )

    // Sends in-app notification
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'license_expiring',
        title: 'License expires in 7 days',
        organizationId: ORG_ID,
        entityUrl: '/settings/license',
      })
    )

    // Sends email
    expect(getOrgFromAddress).toHaveBeenCalledWith(ORG_ID)
    expect(sendOrgMail).toHaveBeenCalledWith(
      ORG_ID,
      expect.objectContaining({
        to: 'owner@test.com',
        subject: 'Your license expires in 7 days',
      })
    )
  })

  it("uses singular 'day' when 1 day left", async () => {
    vi.mocked(db.appSetting.findUnique).mockResolvedValue(null)
    vi.mocked(db.organizationMember.findFirst).mockResolvedValue({
      userId: USER_ID,
      user: { email: 'owner@test.com' },
    } as any)

    await sendExpiryWarning(ORG_ID, 1)

    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'License expires in 1 day',
      })
    )
    expect(sendOrgMail).toHaveBeenCalledWith(
      ORG_ID,
      expect.objectContaining({
        subject: 'Your license expires in 1 day',
      })
    )
  })

  it('skips if already warned today', async () => {
    const today = new Date().toISOString().slice(0, 10)
    vi.mocked(db.appSetting.findUnique).mockResolvedValue({
      value: today,
    } as any)

    await sendExpiryWarning(ORG_ID, 7)

    expect(notify).not.toHaveBeenCalled()
    expect(sendOrgMail).not.toHaveBeenCalled()
  })

  it('sends again on a new day', async () => {
    vi.mocked(db.appSetting.findUnique).mockResolvedValue({
      value: '2020-01-01',
    } as any)
    vi.mocked(db.organizationMember.findFirst).mockResolvedValue({
      userId: USER_ID,
      user: { email: 'owner@test.com' },
    } as any)

    await sendExpiryWarning(ORG_ID, 5)

    expect(notify).toHaveBeenCalled()
    expect(sendOrgMail).toHaveBeenCalled()
  })

  it('skips email if no org member found', async () => {
    vi.mocked(db.appSetting.findUnique).mockResolvedValue(null)
    vi.mocked(db.organizationMember.findFirst).mockResolvedValue(null)

    await sendExpiryWarning(ORG_ID, 7)

    expect(notify).not.toHaveBeenCalled()
    expect(sendOrgMail).not.toHaveBeenCalled()
  })

  it('skips email if owner has no email', async () => {
    vi.mocked(db.appSetting.findUnique).mockResolvedValue(null)
    // First call: findFirst for orgMember (to record warning)
    // Second call: findFirst for owner (to send email)
    vi.mocked(db.organizationMember.findFirst)
      .mockResolvedValueOnce({ userId: USER_ID } as any)
      .mockResolvedValueOnce({ user: { email: null } } as any)

    await sendExpiryWarning(ORG_ID, 7)

    // Notification is still sent
    expect(notify).toHaveBeenCalled()
    // Email is skipped
    expect(sendOrgMail).not.toHaveBeenCalled()
  })

  it('does not throw if email sending fails', async () => {
    vi.mocked(db.appSetting.findUnique).mockResolvedValue(null)
    vi.mocked(db.organizationMember.findFirst).mockResolvedValue({
      userId: USER_ID,
      user: { email: 'owner@test.com' },
    } as any)
    vi.mocked(sendOrgMail).mockRejectedValue(new Error('SMTP down'))

    // Should not throw
    await expect(sendExpiryWarning(ORG_ID, 3)).resolves.not.toThrow()
    expect(notify).toHaveBeenCalled()
  })
})

describe('revalidateOrganizationLicense', () => {
  function mockRemote(verification: Partial<LicenseTokenVerification>) {
    vi.mocked(revalidateLicense).mockResolvedValue({
      remote: {
        reachable: true,
        valid: true,
        plan: 'white-label',
        expiresAt: '',
        token: 'tvl1.x.y',
      },
      verification: {
        status: 'valid',
        payload: null,
        ageDays: 0,
        daysUntilExpiry: 100,
        ...verification,
      },
    })
  }

  beforeEach(() => {
    vi.mocked(db.appSetting.findUnique).mockResolvedValue(null)
    vi.mocked(db.organizationMember.findFirst).mockResolvedValue({
      userId: USER_ID,
      user: { email: 'owner@test.com' },
    } as any)
  })

  it('refreshes through the shared revalidation and warns when expiry is within 14 days', async () => {
    mockRemote({ daysUntilExpiry: 10 })

    await revalidateOrganizationLicense(ORG_ID, LICENSE_KEY)

    expect(revalidateLicense).toHaveBeenCalledWith(ORG_ID, LICENSE_KEY)
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'license_expiring', organizationId: ORG_ID })
    )
  })

  it('does not warn when expiry is more than 14 days away', async () => {
    mockRemote({ daysUntilExpiry: 30 })
    await revalidateOrganizationLicense(ORG_ID, LICENSE_KEY)
    expect(notify).not.toHaveBeenCalled()
  })

  it('does not warn about expiry when the token is not valid', async () => {
    mockRemote({ status: 'invalid', daysUntilExpiry: 5 })
    await revalidateOrganizationLicense(ORG_ID, LICENSE_KEY)
    expect(notify).not.toHaveBeenCalled()
  })

  it('does not warn about expiry once already expired', async () => {
    mockRemote({ status: 'expired', daysUntilExpiry: -1 })
    await revalidateOrganizationLicense(ORG_ID, LICENSE_KEY)
    expect(notify).not.toHaveBeenCalled()
  })

  it('warns at exactly 14 days and at 1 day', async () => {
    mockRemote({ daysUntilExpiry: 14 })
    await revalidateOrganizationLicense(ORG_ID, LICENSE_KEY)
    expect(notify).toHaveBeenCalledTimes(1)

    vi.mocked(notify).mockClear()
    vi.mocked(db.appSetting.findUnique).mockResolvedValue(null)
    mockRemote({ daysUntilExpiry: 1 })
    await revalidateOrganizationLicense(ORG_ID, LICENSE_KEY)
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'License expires in 1 day' })
    )
  })

  it('warns when the token has not been refreshed for a week', async () => {
    mockRemote({ ageDays: LICENSE_TOKEN_WARN_AGE_DAYS })

    await revalidateOrganizationLicense(ORG_ID, LICENSE_KEY)

    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'license_unverified',
        title: `License could not be verified, branding returns in ${
          LICENSE_TOKEN_MAX_AGE_DAYS - LICENSE_TOKEN_WARN_AGE_DAYS
        } days`,
        entityUrl: '/settings/license',
      })
    )
    expect(sendOrgMail).toHaveBeenCalledWith(
      ORG_ID,
      expect.objectContaining({ to: 'owner@test.com' })
    )
  })

  it('says branding has returned once the token is stale', async () => {
    mockRemote({ status: 'stale', ageDays: LICENSE_TOKEN_MAX_AGE_DAYS + 3 })

    await revalidateOrganizationLicense(ORG_ID, LICENSE_KEY)

    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'license_unverified',
        title: 'License could not be verified, branding has returned',
      })
    )
  })

  it('stays quiet about verification while the token is fresh', async () => {
    mockRemote({ ageDays: 1 })
    await revalidateOrganizationLicense(ORG_ID, LICENSE_KEY)
    expect(notify).not.toHaveBeenCalled()
  })

  it('sends the verification warning once per day', async () => {
    const today = new Date().toISOString().slice(0, 10)
    vi.mocked(db.appSetting.findUnique).mockResolvedValue({ value: today } as any)
    mockRemote({ ageDays: 10 })
    await revalidateOrganizationLicense(ORG_ID, LICENSE_KEY)
    expect(notify).not.toHaveBeenCalled()
  })
})

describe('refreshLicensesMissingTokens', () => {
  it('refreshes only orgs whose stored token does not verify', async () => {
    vi.mocked(db.appSetting.findMany)
      .mockResolvedValueOnce([
        { organizationId: 'org-fresh', value: 'KEY-A' },
        { organizationId: 'org-legacy', value: 'KEY-B' },
        { organizationId: null, value: 'KEY-C' },
      ] as any)
      .mockResolvedValueOnce([{ organizationId: 'org-fresh', value: 'tvl1.good' }] as any)
    vi.mocked(verifyLicenseToken).mockImplementation((token) => ({
      status: token === 'tvl1.good' ? 'valid' : 'missing',
      payload: null,
      ageDays: null,
      daysUntilExpiry: null,
    }))
    vi.mocked(revalidateLicense).mockResolvedValue({
      remote: { reachable: true, valid: true, plan: 'white-label', expiresAt: '', token: 't' },
      verification: { status: 'valid', payload: null, ageDays: 0, daysUntilExpiry: 100 },
    })

    await refreshLicensesMissingTokens()

    expect(revalidateLicense).toHaveBeenCalledTimes(1)
    expect(revalidateLicense).toHaveBeenCalledWith('org-legacy', 'KEY-B')
  })

  it('never throws', async () => {
    vi.mocked(db.appSetting.findMany).mockRejectedValue(new Error('db down'))
    await expect(refreshLicensesMissingTokens()).resolves.toBeUndefined()
  })
})
