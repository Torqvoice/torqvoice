import { describe, expect, it } from 'vitest'
import { TECHNICIAN_ROLE_NAME } from '@/features/team/Lib/technicianRole'

/**
 * Which option the role dropdown shows as selected.
 *
 * The trigger renders blank when the value matches no option, and a blank
 * trigger reads as "this person has no role", which is the one thing it must
 * never say about somebody who does.
 *
 * Mirrors team-settings.tsx. It has been wrong before by drifting: this helper
 * kept deciding from the set of technician user ids long after the component
 * had moved to comparing role ids, so it went on passing while the component
 * shipped the null bug below.
 */
function selectedValue(
  member: { user: { id: string }; role: string; roleId: string | null },
  technicianRoleId: string | null,
  roles: { id: string; name: string }[]
): string {
  const isTechnicianRole = technicianRoleId !== null && member.roleId === technicianRoleId
  if (isTechnicianRole) return 'technician'
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
  const techId = roles.find((r) => r.name === TECHNICIAN_ROLE_NAME)?.id ?? null
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
      const value = selectedValue(member, techId, roles)
      expect(options, `${member.user.id} selected "${value}"`).toContain(value)
    }
  })

  it('shows Technician for somebody holding the technician role', () => {
    expect(
      selectedValue({ user: { id: 'u1' }, role: 'member', roleId: 'role-tech' }, techId, roles)
    ).toBe('technician')
  })

  it('keeps a real custom role selected', () => {
    expect(
      selectedValue({ user: { id: 'u2' }, role: 'member', roleId: 'role-desk' }, techId, roles)
    ).toBe('role-desk')
  })

  /**
   * A workshop that has never added a technician has no technician role, so
   * the id to compare against is null. An ordinary member with no custom role
   * has a null roleId too, and comparing the two directly made null === null
   * true: every plain member rendered as Technician, and setting them back to
   * Member wrote the null already there, so the save succeeded and the
   * dropdown never moved.
   */
  describe('in a workshop with no technician role yet', () => {
    const fresh = [{ id: 'role-desk', name: 'Front desk' }]

    it('does not call a plain member a technician', () => {
      expect(selectedValue({ user: { id: 'u4' }, role: 'member', roleId: null }, null, fresh)).toBe(
        'member'
      )
    })

    it('does not call an admin a technician', () => {
      expect(selectedValue({ user: { id: 'u3' }, role: 'admin', roleId: null }, null, fresh)).toBe(
        'admin'
      )
    })

    it('still resolves a custom role', () => {
      expect(
        selectedValue({ user: { id: 'u2' }, role: 'member', roleId: 'role-desk' }, null, fresh)
      ).toBe('role-desk')
    })
  })
})
