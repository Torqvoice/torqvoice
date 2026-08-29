import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  MEMBER_PERMISSIONS,
  MEMBER_ROLE_NAME,
  TECHNICIAN_ROLE_NAME,
} from '@/features/team/Lib/technicianRole'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf-8')

/**
 * The two roles a workshop is offered, and the promise that offering them
 * cannot lock anybody out.
 *
 * Nothing seeded roles when an organization was created, so every workshop
 * began with none and "Member" in the role dropdown granted nothing: `member`
 * is Better Auth's membership tier, not a permission set. These are the roles
 * that word should have meant. They are created on request, never in a
 * migration, because an install that has carefully narrowed its own roles must
 * not find two more appearing or, far worse, its existing ones rewritten.
 */
describe('the standard roles', () => {
  it('give the desk enough to run the day', () => {
    const has = (action: PermissionAction, subject: PermissionSubject) =>
      MEMBER_PERMISSIONS.some((p) => p.action === action && p.subject === subject)

    expect(has(PermissionAction.READ, PermissionSubject.CUSTOMERS)).toBe(true)
    expect(has(PermissionAction.CREATE, PermissionSubject.WORK_ORDERS)).toBe(true)
    expect(has(PermissionAction.UPDATE, PermissionSubject.SERVICES)).toBe(true)
  })

  it('keeps the owner’s business out of the desk role', () => {
    // Settings carries team management, which is how a member would promote
    // themselves. Billing and reports are the owner's to see.
    const reserved = [
      PermissionSubject.SETTINGS,
      PermissionSubject.BILLING,
      PermissionSubject.REPORTS,
    ]
    const leaked = MEMBER_PERMISSIONS.filter((p) =>
      reserved.includes(p.subject as PermissionSubject)
    )
    expect(
      leaked,
      `The desk role must not carry ${leaked.map((p) => p.subject).join(', ')}`
    ).toEqual([])
  })

  it('never grants admin through a flag', () => {
    const lib = read('src/features/team/Lib/technicianRole.ts')
    // isAdmin bypasses every permission check, which hides what an account can
    // reach behind a boolean. Both roles are ordinary sets of permissions.
    expect(lib.match(/isAdmin: false/g)?.length).toBe(2)
    expect(lib).not.toMatch(/isAdmin: true/)
  })

  describe('are safe to add to a workshop that already has roles', () => {
    const lib = read('src/features/team/Lib/technicianRole.ts')
    const action = read('src/features/team/Actions/createDefaultRoles.ts')

    it('creates, and never edits or removes, an existing role', () => {
      for (const [name, src] of [
        ['technicianRole.ts', lib],
        ['createDefaultRoles.ts', action],
      ] as const) {
        expect(src, `${name} must not update a role`).not.toMatch(/role\.update/)
        expect(src, `${name} must not delete a role`).not.toMatch(/role\.delete/)
        expect(src, `${name} must not touch permissions of an existing role`).not.toMatch(
          /permission\.(delete|update)/
        )
      }
    })

    it('returns the role already there rather than a second one', () => {
      // Both helpers look the role up by name first and return early.
      for (const name of [MEMBER_ROLE_NAME, TECHNICIAN_ROLE_NAME]) {
        expect(lib).toContain(
          `name: ${name === MEMBER_ROLE_NAME ? 'MEMBER' : 'TECHNICIAN'}_ROLE_NAME`
        )
      }
      expect(lib.match(/if \(existing\) return existing\.id/g)?.length).toBe(2)
    })
  })

  /**
   * The guard rail for the bug this replaced: choosing any role other than
   * Technician deactivated that person's technician record, so a desk person
   * who also works on cars could not exist, and a role change silently took
   * somebody's phone away.
   */
  it('does not let a role change take somebody off the board', () => {
    const src = read('src/features/team/Actions/assignRole.ts')
    const calls = src.match(/setTechnicianStanding\([\s\S]*?\)/g) ?? []
    expect(calls.length, 'assignRole should set technician standing once').toBe(1)
    expect(calls[0], 'assignRole may only ever activate, never deactivate').toContain('true')
    expect(calls[0]).not.toMatch(/false|asTechnician,/)
  })
})
