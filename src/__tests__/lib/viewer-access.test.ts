/**
 * @vitest-environment node
 *
 * Asking what a role may read before asking for it.
 *
 * A Member opening the dashboard was refused twelve times per visit, because
 * the page asked for every card and let `withAuth` turn down the ones the role
 * does not carry. Nothing on screen was wrong, so nothing looked broken: the
 * cost was twelve wasted queries and twelve "permission denied" rows in the
 * audit log, every time, for every member. The page now asks here first.
 *
 * Two things have to stay true. This must agree with `withAuth` about who
 * reads what, or it hides a card somebody is entitled to. And the dashboard's
 * gates must name the permission each action really needs, or the refusals
 * come straight back.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getAuthContext = vi.hoisted(() => vi.fn())
const getCachedMembership = vi.hoisted(() => vi.fn())
vi.mock('@/lib/get-auth-context', () => ({ getAuthContext }))
vi.mock('@/lib/cached-session', () => ({ getCachedMembership }))

import { PermissionSubject } from '@/lib/permissions'
import { getViewerAccess, readIfAllowed } from '@/lib/viewer-access'

const person = (over: Record<string, unknown> = {}) => ({
  userId: 'u-1',
  organizationId: 'org-1',
  role: 'member',
  isSuperAdmin: false,
  isAdmin: false,
  ...over,
})
const role = (...granted: [string, string][]) => ({
  customRole: { permissions: granted.map(([action, subject]) => ({ action, subject })) },
})

beforeEach(() => {
  getAuthContext.mockReset()
  getCachedMembership.mockReset().mockResolvedValue(null)
})

describe('who reads what', () => {
  it('is everything for an owner, an admin, an admin role and a super admin', async () => {
    // `isAdmin` on the auth context is exactly the set `withAuth` waves through.
    getAuthContext.mockResolvedValue(person({ isAdmin: true }))
    const access = await getViewerAccess()
    expect(access.reads(PermissionSubject.TIRE_HOTEL)).toBe(true)
    expect(access.reads(PermissionSubject.SETTINGS)).toBe(true)
    // Their role is never even looked up.
    expect(getCachedMembership).not.toHaveBeenCalled()
  })

  it('is what the role was given, for anybody else', async () => {
    getAuthContext.mockResolvedValue(person())
    getCachedMembership.mockResolvedValue(role(['read', 'vehicles'], ['update', 'inspections']))
    const access = await getViewerAccess()

    expect(access.reads(PermissionSubject.VEHICLES)).toBe(true)
    // Being allowed to change something is not being allowed to read it here:
    // the action asks for `read`, so that is what is checked.
    expect(access.reads(PermissionSubject.INSPECTIONS)).toBe(false)
    expect(access.reads(PermissionSubject.TIRE_HOTEL)).toBe(false)
  })

  it('is nothing for a member with no role, and for nobody at all', async () => {
    getAuthContext.mockResolvedValue(person())
    expect((await getViewerAccess()).reads(PermissionSubject.DASHBOARD)).toBe(false)

    getAuthContext.mockResolvedValue(null)
    expect((await getViewerAccess()).reads(PermissionSubject.DASHBOARD)).toBe(false)
  })
})

describe('a card the role may not read', () => {
  it('is not asked for, and answers the way a refusal does', async () => {
    const call = vi.fn(async () => ({ success: true, data: ['a job'] }))
    const result = await readIfAllowed({ reads: () => false }, PermissionSubject.TIRE_HOTEL, call)

    expect(call).not.toHaveBeenCalled()
    expect(result).toEqual({ success: false, error: 'Insufficient permissions', forbidden: true })
  })

  it('is asked for as usual when the role may read it', async () => {
    const call = vi.fn(async () => ({ success: true, data: ['a job'] }))
    const result = await readIfAllowed({ reads: () => true }, PermissionSubject.TIRE_HOTEL, call)
    expect(result).toEqual({ success: true, data: ['a job'] })
  })
})

describe('the dashboard', () => {
  const root = join(process.cwd(), 'src')
  const page = readFileSync(join(root, 'app/(authenticated)/page.tsx'), 'utf8')

  /** Every source file under src/features, read once. */
  const sources: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry)
      if (statSync(path).isDirectory()) walk(path)
      else if (/\.tsx?$/.test(entry)) sources.push(readFileSync(path, 'utf8'))
    }
  }
  walk(join(root, 'features'))

  /** The subject an action's `requiredPermissions` asks to READ, or null when it asks for none. */
  function subjectNeededBy(action: string): string | null {
    for (const source of sources) {
      const at = source.search(new RegExp(`export (async )?function ${action}\\b`))
      if (at < 0) continue
      const next = source.indexOf('\nexport ', at + 1)
      const body = source.slice(at, next < 0 ? undefined : next)
      return (
        body.match(/PermissionAction\.READ,\s*subject:\s*PermissionSubject\.([A-Z_]+)/)?.[1] ?? null
      )
    }
    throw new Error(`${action} was not found under src/features`)
  }

  const gated = [...page.matchAll(/readIfAllowed\(access, S\.([A-Z_]+), \(\) =>\s*(\w+)\(/g)].map(
    ([, subject, action]) => ({ subject, action })
  )

  it('gates each card on the permission its action really needs', () => {
    expect(gated.length).toBeGreaterThan(8)
    const wrong = gated.filter(({ subject, action }) => subjectNeededBy(action) !== subject)
    expect(wrong).toEqual([])
  })

  it('asks for nothing that needs a permission without asking first', () => {
    // Everything called inside the page's Promise.all, gated or not.
    // Up to the line that closes the list, not the first `])`, which belongs
    // to the settings call near the top.
    const start = page.indexOf('await Promise.all([')
    const block = page.slice(start, page.indexOf('\n  ])', start))
    expect(block).toContain('getTireHotelSummary')
    const bare = [...block.matchAll(/^\s{4}(get\w+)\(/gm)].map(([, action]) => action)
    const ungated = bare.filter((action) => subjectNeededBy(action) !== null)
    expect(ungated).toEqual([])
  })
})
