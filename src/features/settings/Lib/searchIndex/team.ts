import type { SettingsEntry } from './types'

/**
 * Team. The members card is titled with the workshop's own name, so its
 * entry uses the page heading. `add=true` opens the add-person dialog, which
 * is where technicians, office staff and board-only names are created.
 */
export const teamEntries: SettingsEntry[] = [
  {
    id: 'team.members',
    page: 'team',
    title: 'team.title',
    description: 'team.orgDescription',
    anchor: 'team-members',
    keywords: ['members', 'team members', 'staff', 'employees', 'users', 'people', 'roles'],
  },
  {
    id: 'team.addPerson',
    page: 'team',
    title: 'team.addPersonTitle',
    anchor: 'team-add-person',
    query: 'add=true',
    keywords: ['add person', 'add user', 'add member', 'new employee', 'invite', 'add staff'],
  },
  {
    id: 'team.addTechnician',
    page: 'team',
    title: 'team.addTechnician',
    description: 'team.addTechnicianHint',
    anchor: 'team-add-person',
    query: 'add=true',
    keywords: ['add technician', 'add mechanic', 'new mechanic', 'technician app'],
  },
  {
    id: 'team.inviteByEmail',
    page: 'team',
    title: 'team.inviteByEmail',
    description: 'team.inviteMemberHint',
    anchor: 'team-add-person',
    query: 'add=true',
    keywords: ['invite', 'invite by email', 'invitation', 'office staff', 'invite user'],
  },
  {
    id: 'team.giveApp',
    page: 'team',
    title: 'team.giveApp',
    anchor: 'team-members',
    keywords: [
      'technician app',
      'mobile app',
      'phone app',
      'setup code',
      'torqvoice tech',
      'qr code',
    ],
  },
  {
    id: 'team.role',
    page: 'team',
    title: 'team.role',
    description: 'team.roleHint',
    anchor: 'team-members',
    keywords: ['assign role', 'change role', 'member role', 'admin', 'permissions'],
  },
  {
    id: 'team.boardOnly',
    page: 'team',
    title: 'team.boardOnly',
    description: 'team.boardOnlyHint',
    anchor: 'team-board-only',
    keywords: ['board only', 'apprentice', 'contractor', 'no account', 'work board', 'schedule'],
  },
  {
    id: 'team.pendingInvitations',
    page: 'team',
    title: 'team.pendingInvitations',
    anchor: 'team-invitations',
    keywords: ['pending invitations', 'invites', 'resend invitation', 'cancel invitation'],
  },
  {
    id: 'team.customRoles',
    page: 'team',
    title: 'team.customRoles',
    anchor: 'team-roles',
    keywords: ['custom roles', 'roles', 'permissions', 'access control', 'rbac', 'rights'],
  },
  {
    id: 'team.newRole',
    page: 'team',
    title: 'team.newRole',
    anchor: 'team-new-role',
    keywords: ['new role', 'create role', 'add role'],
  },
  {
    id: 'team.permissions',
    page: 'team',
    title: 'team.permissions',
    anchor: 'team-roles',
    keywords: ['permissions', 'access', 'read only', 'view only', 'rights'],
  },
  {
    id: 'team.createDefaultRoles',
    page: 'team',
    title: 'team.createDefaultRoles',
    anchor: 'team-roles',
    keywords: ['standard roles', 'default roles', 'technician role'],
  },
  {
    id: 'team.builtInRoles',
    page: 'team',
    title: 'team.builtInRoles',
    anchor: 'team-built-in-roles',
    keywords: ['built-in roles', 'owner', 'admin', 'no role', 'role descriptions'],
  },
]
