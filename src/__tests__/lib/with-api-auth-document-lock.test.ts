/**
 * A locked document surfacing through the technician API.
 *
 * The mobile app cannot read a stack trace: a lock refusal that came back as
 * a generic 500 told the technician to retry a request that can never
 * succeed. It must arrive as a 409 with a code the app can react to and a
 * message that names the rule.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

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
import { withApiAuth, apiOk } from '@/lib/with-api-auth'
import { DocumentLockedError } from '@/lib/document-lock'

function apiRequest() {
  return new Request('https://app.test/api/v1/tech/jobs/rec-1/labor', {
    method: 'POST',
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

describe('a handler that hits a locked document', () => {
  it('returns 409 document_locked with the reason, not a 500', async () => {
    const response = await withApiAuth(apiRequest(), async () => {
      throw new DocumentLockedError('paid')
    })

    expect(response.status).toBe(409)
    const body = await response.json()
    expect(body.error.code).toBe('document_locked')
    expect(body.error.message).toMatch(/locked/i)
    expect(body.error.message).toMatch(/paid/i)
  })

  it('leaves ordinary handlers untouched', async () => {
    const response = await withApiAuth(apiRequest(), async () => apiOk({ ok: true }))
    expect(response.status).toBe(200)
  })
})
