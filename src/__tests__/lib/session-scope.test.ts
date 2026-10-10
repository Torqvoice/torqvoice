import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Sessions a workshop mints without a password (app setup codes, one-time
 * codes) are bound to that workshop. Nothing the caller sends may point them
 * at another one: not the app's `x-org-id` header, not the web app's
 * `active-org-id` cookie, not the switcher.
 */

vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn() } } }))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: vi.fn(() => null) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/headers', () => ({ headers: vi.fn(), cookies: vi.fn() }))
vi.mock('@/lib/db', () => ({
  db: {
    user: { findUnique: vi.fn() },
    organizationMember: { findFirst: vi.fn() },
    technician: { findMany: vi.fn() },
  },
}))

import { cookies, headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { apiOk, withApiAuth } from '@/lib/with-api-auth'
import { getCachedMembership } from '@/lib/cached-session'
import { switchOrganization } from '@/features/team/Actions/switchOrganization'
import {
  SCOPED_SESSION_MESSAGE,
  scopedSessionMayCall,
  sessionOrganizationScope,
  sessionTokensInHeaders,
} from '@/lib/session-scope'

const findMember = vi.mocked(db.organizationMember.findFirst)

function membershipIn(organizationId: string, role = 'member') {
  return { organizationId, role, roleId: null, customRole: null }
}

function session(organizationId?: string | null) {
  return {
    user: { id: 'user-1' },
    session: { id: 'sess-1', token: 'tok', organizationId: organizationId ?? null },
  }
}

/** A membership lookup that answers for whichever workshop it is asked about. */
function memberOf(...organizationIds: string[]) {
  findMember.mockImplementation((async (args: {
    where: { userId: string; organizationId?: string }
  }) => {
    const wanted = args.where.organizationId
    if (wanted) return organizationIds.includes(wanted) ? membershipIn(wanted) : null
    return organizationIds[0] ? membershipIn(organizationIds[0]) : null
  }) as never)
}

function apiRequest(orgHeader?: string) {
  const h: Record<string, string> = { authorization: 'Bearer token-1' }
  if (orgHeader) h['x-org-id'] = orgHeader
  return new Request('https://app.test/api/v1/tech/me', { headers: h })
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(db.user.findUnique).mockResolvedValue({ isSuperAdmin: false } as never)
  vi.mocked(db.technician.findMany).mockResolvedValue([{ id: 'tech-1' }] as never)
})

describe('withApiAuth and a session bound to a workshop', () => {
  it('ignores x-org-id and acts in the bound workshop', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(session('org-a') as never)
    memberOf('org-a', 'org-b')

    let seen: string | undefined
    const res = await withApiAuth(apiRequest('org-b'), async (ctx) => {
      seen = ctx.organizationId
      return apiOk({})
    })

    expect(res.status).toBe(200)
    expect(seen).toBe('org-a')
    for (const [args] of findMember.mock.calls) {
      expect((args as { where: { organizationId?: string } }).where.organizationId).toBe('org-a')
    }
  })

  it('refuses rather than falling back when the person has left the bound workshop', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(session('org-a') as never)
    memberOf('org-b')

    const handler = vi.fn(async () => apiOk({}))
    const res = await withApiAuth(apiRequest('org-b'), handler)

    expect(res.status).toBe(401)
    expect(handler).not.toHaveBeenCalled()
  })

  it('carries none of the account platform rights', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(session('org-a') as never)
    vi.mocked(db.user.findUnique).mockResolvedValue({ isSuperAdmin: true } as never)
    memberOf('org-a')

    let ctx: { isSuperAdmin: boolean; role: string } | undefined
    await withApiAuth(apiRequest(), async (c) => {
      ctx = c
      return apiOk({})
    })

    expect(ctx?.isSuperAdmin).toBe(false)
    expect(ctx?.role).toBe('member')
  })

  it('still lets an ordinary session choose with x-org-id', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(session(null) as never)
    memberOf('org-a', 'org-b')

    let seen: string | undefined
    await withApiAuth(apiRequest('org-b'), async (ctx) => {
      seen = ctx.organizationId
      return apiOk({})
    })

    expect(seen).toBe('org-b')
  })
})

describe('getCachedMembership and a session bound to a workshop', () => {
  function request(orgHeader: string | null, orgCookie: string | null) {
    vi.mocked(headers).mockResolvedValue(
      new Headers(orgHeader ? { 'x-org-id': orgHeader } : {}) as never
    )
    vi.mocked(cookies).mockResolvedValue({
      get: (name: string) =>
        name === 'active-org-id' && orgCookie ? { name, value: orgCookie } : undefined,
    } as never)
  }

  it('ignores both the header and the cookie', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(session('org-a') as never)
    memberOf('org-a', 'org-b')
    request('org-b', 'org-b')

    const membership = await getCachedMembership('user-1')

    expect(membership?.organizationId).toBe('org-a')
  })

  it('is no membership at all once the person has left the bound workshop', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(session('org-a') as never)
    memberOf('org-b')
    request(null, 'org-b')

    expect(await getCachedMembership('user-1')).toBeNull()
  })

  it('still honours the cookie for an ordinary session', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(session(null) as never)
    memberOf('org-a', 'org-b')
    request(null, 'org-b')

    const membership = await getCachedMembership('user-1')

    expect(membership?.organizationId).toBe('org-b')
  })
})

describe('switchOrganization and a session bound to a workshop', () => {
  it('refuses to switch', async () => {
    vi.mocked(headers).mockResolvedValue(new Headers() as never)
    const set = vi.fn()
    vi.mocked(cookies).mockResolvedValue({ set, get: vi.fn() } as never)
    vi.mocked(auth.api.getSession).mockResolvedValue(session('org-a') as never)
    memberOf('org-a', 'org-b')

    const result = await switchOrganization('org-b')

    expect(result).toEqual({ success: false, error: SCOPED_SESSION_MESSAGE })
    expect(set).not.toHaveBeenCalled()
  })
})

describe('session-scope helpers', () => {
  it('reads the scope off a getSession result', () => {
    expect(sessionOrganizationScope(session('org-a'))).toBe('org-a')
    expect(sessionOrganizationScope(session(null))).toBeNull()
    expect(sessionOrganizationScope({ session: {} })).toBeNull()
    expect(sessionOrganizationScope(null)).toBeNull()
  })

  it('lets a bound session read itself and sign out, and nothing else', () => {
    expect(scopedSessionMayCall('/get-session')).toBe(true)
    expect(scopedSessionMayCall('/sign-out')).toBe(true)
    for (const path of [
      '/list-sessions',
      '/passkey/generate-register-options',
      '/change-password',
      '/update-user',
      '/two-factor/enable',
      undefined,
    ]) {
      expect(scopedSessionMayCall(path)).toBe(false)
    }
  })

  it('finds the token in a bearer header and in the session cookie, signed or not', () => {
    const cookieName = 'better-auth.session_token'
    const h = new Headers({
      authorization: 'Bearer abc123.c2lnbmF0dXJl',
      cookie: `other=1; ${cookieName}=def456.c2ln%3D; tail=2`,
    })
    expect(sessionTokensInHeaders(h, cookieName).sort()).toEqual(['abc123', 'def456'])
    expect(
      sessionTokensInHeaders(new Headers({ authorization: 'Bearer plain' }), cookieName)
    ).toEqual(['plain'])
    expect(sessionTokensInHeaders(new Headers(), cookieName)).toEqual([])
    expect(sessionTokensInHeaders(undefined, cookieName)).toEqual([])
  })
})
