/**
 * @vitest-environment node
 *
 * The Validate button on the License page takes either a licence key or a
 * pasted perpetual token. A key goes to torqvoice.com; a `tvp1.` token is
 * verified and stored offline and never leaves the server.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const deleteMany = vi.hoisted(() => vi.fn())
vi.mock('@/lib/db', () => ({ db: { appSetting: { deleteMany } } }))

const seenOptions = vi.hoisted(() => [] as unknown[])
vi.mock('@/lib/with-auth', () => ({
  withAuth: async (
    action: (ctx: { userId: string; organizationId: string }) => unknown,
    options?: unknown
  ) => {
    seenOptions.push(options)
    return { success: true, data: await action({ userId: 'u-1', organizationId: 'org-1' }) }
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/demo', () => ({ demoGuard: vi.fn() }))
vi.mock('@/lib/license/revalidate', () => ({
  revalidateLicense: vi.fn(),
  storedLicenseVerification: vi.fn(),
  storePerpetualLicense: vi.fn(),
}))

import { validateLicense } from '@/features/settings/Actions/validateLicense'
import { demoGuard } from '@/lib/demo'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import {
  revalidateLicense,
  storedLicenseVerification,
  storePerpetualLicense,
} from '@/lib/license/revalidate'
import type { LicenseTokenVerification } from '@/lib/license/token'

const LICENSEE = {
  name: 'Example Workshop AS',
  registrationNumber: 'NO 123 456 789 MVA',
  country: 'NO',
}

function verification(extra: Partial<LicenseTokenVerification>): LicenseTokenVerification {
  return {
    status: 'valid',
    kind: 'subscription',
    payload: null,
    ageDays: 0,
    daysUntilExpiry: null,
    expiresAt: null,
    maxOrganizations: null,
    licensee: null,
    ...extra,
  }
}

const perpetualPayload = {
  v: 1 as const,
  lid: 'lic-p1',
  org: 'org-1',
  plan: 'white-label',
  maxOrganizations: 1,
  licensee: LICENSEE,
  issuedAt: '2026-10-01T00:00:00.000Z',
}

beforeEach(() => {
  vi.mocked(revalidateLicense).mockReset()
  vi.mocked(storePerpetualLicense).mockReset()
  vi.mocked(demoGuard).mockReset()
  deleteMany.mockReset().mockResolvedValue({ count: 0 })
  seenOptions.length = 0
})

describe('validateLicense', () => {
  it('stores a pasted perpetual token offline', async () => {
    vi.mocked(storePerpetualLicense).mockResolvedValue(
      verification({
        status: 'valid',
        kind: 'perpetual',
        payload: perpetualPayload,
        maxOrganizations: 1,
        licensee: LICENSEE,
      })
    )
    const result = await validateLicense('  tvp1.payload.sig  ')

    expect(storePerpetualLicense).toHaveBeenCalledWith('org-1', 'tvp1.payload.sig', 'u-1')
    expect(revalidateLicense).not.toHaveBeenCalled()
    expect(result).toEqual({
      success: true,
      data: {
        status: 'valid',
        valid: true,
        plan: 'white-label',
        kind: 'perpetual',
        licensee: LICENSEE,
        attempted: 'perpetual',
        accepted: true,
        reachable: true,
      },
    })
  })

  it('keeps the stored licence on screen when a pasted token does not verify', async () => {
    vi.mocked(storePerpetualLicense).mockResolvedValue(
      verification({ status: 'invalid', kind: null })
    )
    vi.mocked(storedLicenseVerification).mockResolvedValue(
      verification({
        status: 'valid',
        kind: 'perpetual',
        payload: perpetualPayload,
        maxOrganizations: 1,
        licensee: LICENSEE,
      })
    )
    const result = await validateLicense('tvp1.garbage.sig')

    expect(storedLicenseVerification).toHaveBeenCalledWith('org-1')
    // Nothing changed, so the banner dismissal and the cache stay as they were.
    expect(deleteMany).not.toHaveBeenCalled()
    expect(result.data).toEqual({
      status: 'valid',
      valid: true,
      plan: 'white-label',
      kind: 'perpetual',
      licensee: LICENSEE,
      attempted: 'perpetual',
      accepted: false,
      reachable: true,
    })
  })

  it('reports a mismatch with the licensee so the page can name the number', async () => {
    vi.mocked(storePerpetualLicense).mockResolvedValue(
      verification({
        status: 'mismatch',
        kind: 'perpetual',
        payload: perpetualPayload,
        maxOrganizations: 1,
        licensee: LICENSEE,
      })
    )
    const result = await validateLicense('tvp1.payload.sig')
    expect(result.data).toMatchObject({
      status: 'mismatch',
      valid: false,
      kind: 'perpetual',
      licensee: LICENSEE,
      attempted: 'perpetual',
      accepted: true,
    })
  })

  it('sends a licence key to torqvoice.com as before', async () => {
    vi.mocked(revalidateLicense).mockResolvedValue({
      remote: { reachable: true, valid: true, plan: 'white-label', expiresAt: '', token: 't' },
      verification: verification({ status: 'valid' }),
    })
    const result = await validateLicense('TQV-ABCD-1234')

    expect(revalidateLicense).toHaveBeenCalledWith('org-1', 'TQV-ABCD-1234', 'u-1', {
      replacePerpetual: true,
    })
    expect(storePerpetualLicense).not.toHaveBeenCalled()
    expect(result.data).toMatchObject({
      status: 'valid',
      valid: true,
      plan: 'white-label',
      reachable: true,
      kind: 'subscription',
      licensee: null,
      attempted: 'subscription',
      accepted: true,
    })
  })

  it('reports a rejected key without touching the offline licence that stays on disk', async () => {
    vi.mocked(revalidateLicense).mockResolvedValue({
      remote: {
        reachable: true,
        valid: false,
        plan: 'free',
        expiresAt: '',
        token: null,
        error: 'License not found',
      },
      verification: verification({
        status: 'valid',
        kind: 'perpetual',
        payload: perpetualPayload,
        licensee: LICENSEE,
      }),
    })
    const result = await validateLicense('TQV-WRONG')

    expect(deleteMany).not.toHaveBeenCalled()
    expect(result.data).toEqual({
      status: 'valid',
      valid: true,
      plan: 'white-label',
      kind: 'perpetual',
      licensee: LICENSEE,
      attempted: 'subscription',
      accepted: false,
      reachable: true,
      reason: 'License not found',
    })
  })

  it('says torqvoice.com was unreachable and reports the licence still on disk', async () => {
    vi.mocked(revalidateLicense).mockResolvedValue({
      remote: { reachable: false, valid: false, plan: 'free', expiresAt: '', token: null },
      verification: verification({ status: 'stale', kind: 'subscription' }),
    })
    const result = await validateLicense('TQV-ABCD-1234')
    expect(result.data).toMatchObject({
      status: 'stale',
      valid: false,
      kind: 'subscription',
      attempted: 'subscription',
      accepted: false,
      reachable: false,
    })
  })

  it('keeps the demo guard and the settings permission on both paths', async () => {
    vi.mocked(storePerpetualLicense).mockResolvedValue(verification({ status: 'invalid' }))
    await validateLicense('tvp1.payload.sig')
    expect(demoGuard).toHaveBeenCalledTimes(1)
    expect(seenOptions[0]).toEqual({
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.SETTINGS },
      ],
    })
  })

  it('lets the expiry banner warn again after a perpetual token is stored', async () => {
    vi.mocked(storePerpetualLicense).mockResolvedValue(verification({ status: 'valid' }))
    await validateLicense('tvp1.payload.sig')
    expect(deleteMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', key: 'license.expiryDismissed' },
    })
  })
})
