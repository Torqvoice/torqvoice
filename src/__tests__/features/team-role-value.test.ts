import { describe, expect, it } from 'vitest'
import { TECHNICIAN_ROLE_NAME } from '@/features/team/Lib/technicianRole'

/**
 * Which option the role dropdown shows as selected.
 *
 * The trigger renders blank when the value matches no option, and a blank
 * trigger reads as "this person has no role", which is the one thing it must
 * never say about somebody who does. That happened for a newly added
 * technician: their role id was real but deliberately absent from the list,
 * because the Technician entry above it is what grants it.
 */
function selectedValue(
  member: { user: { id: string }; role: string; roleId: string | null },
  technicians: Set<string>,
  roles: { id: string; name: string }[]
): string {
  if (technicians.has(member.user.id)) return 'technician'
  if (roles.some((r) => r.id === member.roleId && r.name !== TECHNICIAN_ROLE_NAME)) {
    return member.roleId as string
  }
  return member.role
}

const OFFERED = ['admin', 'member', 'technician']

describe('the role dropdown value', () => {
  const roles = [
    { id: 'role-tech', name: TECHNICIAN_ROLE_NAME },
    { id: 'role-desk', name: 'Front desk' },
  ]
  const options = [
    ...OFFERED,
    ...roles.filter((r) => r.name !== TECHNICIAN_ROLE_NAME).map((r) => r.id),
  ]

  it('always matches something the list actually offers', () => {
    const cases = [
      { user: { id: 'u1' }, role: 'member', roleId: 'role-tech' },
      { user: { id: 'u2' }, role: 'member', roleId: 'role-desk' },
      { user: { id: 'u3' }, role: 'admin', roleId: null },
      { user: { id: 'u4' }, role: 'member', roleId: null },
      // A role deleted from under them, which the list no longer carries.
      { user: { id: 'u5' }, role: 'member', roleId: 'role-gone' },
    ]
    for (const member of cases) {
      const value = selectedValue(member, new Set(['u1']), roles)
      expect(options, `${member.user.id} selected "${value}"`).toContain(value)
    }
  })

  it('shows Technician for somebody on the board', () => {
    expect(
      selectedValue(
        { user: { id: 'u1' }, role: 'member', roleId: 'role-tech' },
        new Set(['u1']),
        roles
      )
    ).toBe('technician')
  })

  it('does not fall through to a role id the list hides', () => {
    // The bug: a technician missing from the set fell through to role-tech,
    // which is filtered out of the options, so the trigger rendered empty.
    expect(
      selectedValue({ user: { id: 'u1' }, role: 'member', roleId: 'role-tech' }, new Set(), roles)
    ).toBe('member')
  })

  it('keeps a real custom role selected', () => {
    expect(
      selectedValue({ user: { id: 'u2' }, role: 'member', roleId: 'role-desk' }, new Set(), roles)
    ).toBe('role-desk')
  })
})
