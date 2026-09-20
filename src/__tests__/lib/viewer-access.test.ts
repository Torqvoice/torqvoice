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

import { MEMBER_PERMISSIONS } from '@/features/team/Lib/technicianRole'
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

describe('every page that asks first', () => {
  const root = join(process.cwd(), 'src')

  const sources: string[] = []
  const pages: { path: string; source: string }[] = []
  const walk = (dir: string, into: (path: string, source: string) => void) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry)
      if (statSync(path).isDirectory()) walk(path, into)
      else if (/\.tsx?$/.test(entry)) into(path, readFileSync(path, 'utf8'))
    }
  }
  walk(join(root, 'features'), (_path, source) => sources.push(source))
  walk(join(root, 'app'), (path, source) => {
    if (source.includes('readIfAllowed(access,'))
      pages.push({ path: path.slice(root.length + 1), source })
  })

  /** The subject an action must be allowed to READ, or null when it asks for none. */
  function subjectNeededBy(action: string): string | null {
    for (const source of sources) {
      const at = source.search(new RegExp(`export (async )?function ${action}\\b`))
      if (at < 0) continue
      // Up to the end of this function, not the next export: a helper that
      // follows it may need something this action does not.
      const end = source.indexOf('\n}\n', at)
      const body = source.slice(at, end < 0 ? undefined : end)
      const inline = body.match(
        /PermissionAction\.READ,\s*subject:\s*PermissionSubject\.([A-Z_]+)/
      )?.[1]
      if (inline) return inline
      // Some files name the permission once and refer to it:
      // `requiredPermissions: READ`, with `const READ = [{ … }]` elsewhere.
      const named = body.match(/requiredPermissions:\s*([A-Za-z_]\w*)\b/)?.[1]
      if (!named) return null
      return (
        source.match(
          new RegExp(
            `const ${named} = \\[\\s*\\{\\s*action:\\s*PermissionAction\\.READ,\\s*subject:\\s*PermissionSubject\\.([A-Z_]+)`
          )
        )?.[1] ?? null
      )
    }
    throw new Error(`${action} was not found under src/features`)
  }

  it('covers the dashboard and the vehicle page', () => {
    expect(pages.map((page) => page.path).sort()).toEqual([
      'app/(authenticated)/page.tsx',
      'app/(authenticated)/vehicles/[id]/page.tsx',
    ])
  })

  it('gates each call on the permission its action really needs', () => {
    const wrong = pages.flatMap(({ path, source }) =>
      [...source.matchAll(/readIfAllowed\(access, S\.([A-Z_]+), \(\) =>\s*(\w+)\(/g)]
        .filter(([, subject, action]) => subjectNeededBy(action) !== subject)
        .map(([, subject, action]) => `${path}: ${action} is gated on ${subject}`)
    )
    expect(wrong).toEqual([])
  })

  it('asks for nothing outside what a Member reads without asking first', () => {
    // The built-in Member role reads these and nothing else. A call that needs
    // any other subject is one a Member is refused, so it has to be gated.
    const memberReads = new Set<string>(
      MEMBER_PERMISSIONS.filter((p) => p.action === 'read').map((p) => p.subject)
    )
    const ungated = pages.flatMap(({ path, source }) => {
      // Up to the line that closes the list, not the first `])`, which can
      // belong to a call inside it.
      const start = source.indexOf('await Promise.all([')
      const block = source.slice(start, source.indexOf('\n  ])', start))
      return [...block.matchAll(/^\s{4}(get\w+)\(/gm)]
        .map(([, action]) => ({ action, subject: subjectNeededBy(action) }))
        .filter(
          ({ subject }) => subject !== null && !memberReads.has(String(subject).toLowerCase())
        )
        .map(({ action, subject }) => `${path}: ${action} needs ${subject} and is not gated`)
    })
    expect(ungated).toEqual([])
  })
})
