/**
 * The technician API while a restore of the workshop runs: the phone app's
 * writes are refused with a 409 it can show, and its reads go on as before.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn() } } }))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: vi.fn(() => null) }))
vi.mock('@/lib/db', () => ({
  db: {
    user: { findUnique: vi.fn() },
    organizationMember: { findFirst: vi.fn() },
    technician: { findMany: vi.fn() },
  },
}))

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { apiOk, withApiAuth } from '@/lib/with-api-auth'
import {
  RESTORE_IN_PROGRESS_MESSAGE,
  freezeOrganization,
  unfreezeOrganization,
} from '@/lib/backup/freeze'

function apiRequest(method: string) {
  return new Request('https://app.test/api/v1/tech/jobs/rec-1/labor', {
    method,
    headers: { authorization: 'Bearer token-1' },
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(auth.api.getSession).mockResolvedValue({ user: { id: 'user-1' } } as any)
  vi.mocked(db.user.findUnique).mockResolvedValue({ isSuperAdmin: false } as any)
  vi.mocked(db.organizationMember.findFirst).mockResolvedValue({
    organizationId: 'org-1',
    role: 'member',
    roleId: null,
    customRole: null,
  } as any)
  vi.mocked(db.technician.findMany).mockResolvedValue([{ id: 'tech-1' }] as any)
})

afterEach(() => {
  unfreezeOrganization('org-1')
})

describe('withApiAuth while the workshop is being restored', () => {
  it('refuses a write with 409 conflict and never runs the handler', async () => {
    freezeOrganization('org-1')
    const handler = vi.fn(async () => apiOk({ ok: true }))

    const response = await withApiAuth(apiRequest('POST'), handler)

    expect(response.status).toBe(409)
    const body = await response.json()
    expect(body.error.code).toBe('conflict')
    expect(body.error.message).toBe(RESTORE_IN_PROGRESS_MESSAGE)
    expect(handler).not.toHaveBeenCalled()
  })

  it('lets a read through', async () => {
    freezeOrganization('org-1')
    const handler = vi.fn(async () => apiOk({ ok: true }))

    const response = await withApiAuth(apiRequest('GET'), handler)

    expect(response.status).toBe(200)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('lets a write through for a workshop that is not frozen', async () => {
    freezeOrganization('org-other')
    const handler = vi.fn(async () => apiOk({ ok: true }))

    const response = await withApiAuth(apiRequest('PATCH'), handler)

    expect(response.status).toBe(200)
    expect(handler).toHaveBeenCalledTimes(1)
    unfreezeOrganization('org-other')
  })
})
