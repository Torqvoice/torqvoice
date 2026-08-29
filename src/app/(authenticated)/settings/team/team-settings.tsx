'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AppCard } from '@/components/app-card'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useGlassModal } from '@/components/glass-modal'
import { useConfirm } from '@/components/confirm-dialog'
import { createOrganization, removeMember } from '@/features/team/Actions/teamActions'
import { cancelInvitation } from '@/features/team/Actions/cancelInvitation'
import { createRole } from '@/features/team/Actions/createRole'
import { updateRole } from '@/features/team/Actions/updateRole'
import { deleteRole } from '@/features/team/Actions/deleteRole'
import { assignRole } from '@/features/team/Actions/assignRole'
import { setMemberTechnician } from '@/features/team/Actions/setMemberTechnician'
import { createDefaultRoles } from '@/features/team/Actions/createDefaultRoles'
import { AddPersonDialog } from '@/features/team/Components/AddPersonDialog'
import {
  contactFor,
  MEMBER_ROLE_NAME,
  TECHNICIAN_PERMISSIONS,
  TECHNICIAN_ROLE_NAME,
} from '@/features/team/Lib/technicianRole'
import { AppSetupCodeDialog } from '@/features/team/Components/AppSetupCodeDialog'
import { GiveAppDialog } from '@/features/team/Components/GiveAppDialog'
import { removeTechnicianAccess } from '@/features/team/Actions/removeTechnicianAccess'
import { deleteTechnician } from '@/features/workboard/Actions/technicianActions'
import { permissionGroups, PermissionAction } from '@/lib/permissions'

/**
 * Which wording an action gets, since one of them is not generic.
 *
 * "Manage" on the tire hotel means the racking rather than the module, and a
 * role editor that just said "Manage" would leave somebody guessing what they
 * were granting. Keyed here rather than in permissions.ts, which is imported
 * by server code that runs outside a request and has no translations.
 */
const ACTION_LABEL_OVERRIDES: Record<string, string> = {
  'tire_hotel:manage': 'manage_storage',
}

function labelKey(subject: string, action: string): string {
  return ACTION_LABEL_OVERRIDES[`${subject}:${action}`] ?? action
}
import {
  Copy,
  Crown,
  Loader2,
  LogOut,
  Mail,
  Pencil,
  Plus,
  Shield,
  ShieldCheck,
  Smartphone,
  Wrench,
  Trash2,
  User,
  Users,
  X,
} from 'lucide-react'

interface Member {
  id: string
  role: string
  roleId: string | null
  customRoleName: string | null
  user: { id: string; name: string; email: string; phone?: string | null }
}

interface Organization {
  id: string
  name: string
  members: Member[]
}

interface PendingInvitation {
  id: string
  email: string
  role: string
  roleId: string | null
  token: string
  customRole: { name: string } | null
  createdAt: Date
  expiresAt: Date
}

interface RoleData {
  id: string
  name: string
  isAdmin: boolean
  permissions: { action: string; subject: string }[]
  memberCount: number
}

const roleIcons: Record<string, React.ReactNode> = {
  owner: <Crown className="h-3 w-3" />,
  admin: <Shield className="h-3 w-3" />,
  member: <User className="h-3 w-3" />,
}

const roleColors: Record<string, string> = {
  owner: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  admin: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  member: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
}

export function TeamSettings({
  organization,
  currentRole,
  roles = [],
  technicianUserIds = [],
  startAdding = false,
  dialCode = '',
  standaloneTechnicians = [],
  pendingInvitations = [],
}: {
  organization: Organization | null
  currentRole: string | null
  roles?: RoleData[]
  /** User ids that already have an active technician record. */
  technicianUserIds?: string[]
  /** Arrived from Quick Add, so open the dialog rather than the page. */
  startAdding?: boolean
  /** The workshop's country code, empty until somebody has supplied one. */
  dialCode?: string
  /** On the board, with nobody behind them. */
  standaloneTechnicians?: { id: string; name: string; color: string }[]
  pendingInvitations?: PendingInvitation[]
}) {
  const router = useRouter()
  const t = useTranslations('settings')
  const tPerm = useTranslations('permissions')
  const modal = useGlassModal()
  const confirm = useConfirm()
  const [loading, setLoading] = useState(false)
  const [orgName, setOrgName] = useState('')

  // Role form state
  const [showRoleForm, setShowRoleForm] = useState(false)
  const [editingRole, setEditingRole] = useState<RoleData | null>(null)
  // Tracked locally so the switch answers the tap immediately. A revalidate
  // round trip is a long time to sit on a toggle that has already moved.
  /**
   * Who is a technician, read from the server rather than remembered.
   *
   * This was useState seeded from the prop, which only runs on mount. Adding
   * somebody refreshed the page, the prop arrived with them in it, and the set
   * ignored it: the new technician's role dropdown then fell through to a role
   * id with no matching option and rendered blank until a manual reload.
   */
  const technicians = useMemo(() => new Set(technicianUserIds), [technicianUserIds])
  /** The workshop's technician role, if it has one yet. */
  const technicianRoleId = roles.find((r) => r.name === TECHNICIAN_ROLE_NAME)?.id ?? null
  /**
   * Whether a member holds the technician role.
   *
   * The null check is the whole point. A workshop that has never added a
   * technician has no technician role, so `technicianRoleId` is null, and an
   * ordinary member with no custom role has a null `roleId` too. Comparing the
   * two directly made `null === null` true, so every plain member rendered as
   * Technician, and setting them back to Member wrote the null that was
   * already there: the save succeeded and the dropdown never moved.
   */
  const isTechnicianRole = (roleId: string | null | undefined) =>
    technicianRoleId !== null && roleId === technicianRoleId
  /** The member whose app is being set up, and their name for the copy. */
  const [settingUp, setSettingUp] = useState<{ userId: string; name: string } | null>(null)
  const [adding, setAdding] = useState(startAdding)
  const [givingApp, setGivingApp] = useState<{ id: string; name: string } | null>(null)

  /**
   * The address the technician's app should connect to.
   *
   * Configured first, current origin second. They agree in production; in
   * development the origin is localhost, which is an address the technician's
   * phone cannot reach.
   */
  const workshopUrl =
    process.env.NEXT_PUBLIC_APP_URL || (typeof window === 'undefined' ? '' : window.location.origin)

  const [roleName, setRoleName] = useState('')
  const [roleIsAdmin, setRoleIsAdmin] = useState(false)
  const [selectedPermissions, setSelectedPermissions] = useState<Set<string>>(new Set())

  const isOwner = currentRole === 'owner'
  const isAdmin = currentRole === 'owner' || currentRole === 'admin'

  const togglePermission = (action: string, subject: string) => {
    const key = `${action}:${subject}`
    setSelectedPermissions((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  const openRoleForm = (role?: RoleData) => {
    if (role) {
      setEditingRole(role)
      setRoleName(role.name)
      setRoleIsAdmin(role.isAdmin)
      setSelectedPermissions(new Set(role.permissions.map((p) => `${p.action}:${p.subject}`)))
    } else {
      setEditingRole(null)
      setRoleName('')
      setRoleIsAdmin(false)
      setSelectedPermissions(new Set())
    }
    setShowRoleForm(true)
  }

  const closeRoleForm = () => {
    setShowRoleForm(false)
    setEditingRole(null)
    setRoleName('')
    setRoleIsAdmin(false)
    setSelectedPermissions(new Set())
  }

  const handleSaveRole = async () => {
    if (!roleName.trim()) return
    setLoading(true)

    const permissions = Array.from(selectedPermissions).map((key) => {
      const [action, subject] = key.split(':')
      return { action, subject }
    })

    let result
    if (editingRole) {
      result = await updateRole({
        roleId: editingRole.id,
        name: roleName,
        isAdmin: roleIsAdmin,
        permissions,
      })
    } else {
      result = await createRole({ name: roleName, isAdmin: roleIsAdmin, permissions })
    }

    if (result.success) {
      toast.success(editingRole ? t('team.roleUpdated') : t('team.roleCreated'))
      closeRoleForm()
      router.refresh()
    } else {
      modal.open('error', 'Error', result.error || t('team.failedSaveRole'))
    }
    setLoading(false)
  }

  const handleDeleteRole = async (role: RoleData) => {
    const ok = await confirm({
      title: t('team.deleteRole'),
      description: t('team.deleteRoleDescription', { name: role.name }),
      confirmLabel: t('team.deleteRole'),
      destructive: true,
    })
    if (!ok) return
    const result = await deleteRole(role.id)
    if (result.success) {
      toast.success(t('team.roleDeleted'))
      router.refresh()
    } else {
      modal.open('error', 'Error', result.error || t('team.failedDeleteRole'))
    }
  }

  /**
   * Changes what somebody may do. Never what they work on.
   *
   * This used to revoke the technician app as a side effect of a role change,
   * behind a confirmation, because role and board membership were the same
   * decision. They are two now: the switch beside the dropdown owns the board,
   * and it carries that confirmation.
   */
  const handleAssignRole = async (memberId: string, value: string) => {
    let role: 'admin' | 'member'
    let roleId: string | null

    if (value === 'admin') {
      role = 'admin'
      roleId = null
    } else if (value === 'none') {
      // A real state, and the one that refuses every screen, so it is offered
      // by name rather than reached by accident.
      role = 'member'
      roleId = null
    } else {
      role = 'member'
      roleId = value
    }

    const result = await assignRole({ memberId, role, roleId })
    if (result.success) {
      toast.success(t('team.roleAssigned'))
      router.refresh()
    } else {
      modal.open('error', 'Error', result.error || t('team.failedAssignRole'))
    }
  }

  /**
   * Whether this person's role can actually work a job from the phone.
   *
   * The app enforces the same permissions as the web, so an account whose role
   * does not carry them signs in and is refused by every screen. Answering the
   * question here means the button can say so instead of handing somebody a
   * setup code that leads nowhere.
   */
  const canUseApp = (member: Member) => {
    if (member.role === 'owner' || member.role === 'admin') return true
    const role = roles.find((r) => r.id === member.roleId)
    if (!role) return false
    if (role.isAdmin) return true
    return TECHNICIAN_PERMISSIONS.every((needed) =>
      role.permissions.some((p) => p.action === needed.action && p.subject === needed.subject)
    )
  }

  /**
   * Puts the app on somebody's phone.
   *
   * Being on the board is part of having the app rather than a separate
   * switch beside it: the API refuses anybody without a technician record, so
   * a code issued to somebody who has none is a code that cannot be redeemed.
   * This makes the record first if it is missing, then hands over the code.
   */
  const handleSetUpApp = async (member: Member) => {
    if (!technicians.has(member.user.id)) {
      const result = await setMemberTechnician({ userId: member.user.id, enabled: true })
      if (!result.success) {
        modal.open('error', 'Error', result.error || t('team.technicianFailed'))
        return
      }
      router.refresh()
    }
    setSettingUp({ userId: member.user.id, name: member.user.name || member.user.email })
  }

  /**
   * Takes the app back off somebody's phone, and them off the board.
   *
   * Deactivates rather than deletes: past jobs, inspections and clocked hours
   * all point at the technician record, and removing it would rewrite history
   * to say nobody did the work.
   */
  const handleRevokeApp = async (member: Member) => {
    const ok = await confirm({
      title: t('team.revokeTechnicianTitle'),
      description: t('team.revokeTechnicianBody', {
        name: member.user.name || member.user.email,
      }),
      confirmLabel: t('team.revokeTechnicianConfirm'),
      destructive: true,
    })
    if (!ok) return

    await removeTechnicianAccess({ userId: member.user.id })
    const result = await setMemberTechnician({ userId: member.user.id, enabled: false })
    if (result.success) {
      toast.success(t('team.revokeTechnicianDone', { name: member.user.name || member.user.email }))
      router.refresh()
    } else {
      modal.open('error', 'Error', result.error || t('team.technicianFailed'))
    }
  }

  /**
   * True while the workshop is missing one of the two roles nearly every
   * workshop wants. Nothing is created automatically: an install that has
   * carefully narrowed its own roles should not find two more appearing.
   */
  const missingDefaultRoles =
    !roles.some((r) => r.name === MEMBER_ROLE_NAME) ||
    !roles.some((r) => r.name === TECHNICIAN_ROLE_NAME)

  const handleCreateDefaultRoles = async () => {
    setLoading(true)
    const result = await createDefaultRoles()
    if (result.success) {
      toast.success(t('team.defaultRolesCreated'))
      router.refresh()
    } else {
      modal.open('error', 'Error', result.error || t('team.failedSaveRole'))
    }
    setLoading(false)
  }

  const handleCreateOrg = async () => {
    if (!orgName.trim()) return
    setLoading(true)
    const result = await createOrganization({ name: orgName })
    if (result.success) {
      toast.success(t('team.orgCreated'))
      router.refresh()
    } else {
      modal.open('error', 'Error', result.error || t('team.failedCreateOrg'))
    }
    setLoading(false)
  }

  const handleCancelInvitation = async (invitation: PendingInvitation) => {
    const ok = await confirm({
      title: t('team.cancelInvitation'),
      description: t('team.cancelInvitationDescription', { email: invitation.email }),
      confirmLabel: t('team.cancelInvitation'),
      destructive: true,
    })
    if (!ok) return
    const result = await cancelInvitation({ invitationId: invitation.id })
    if (result.success) {
      toast.success(t('team.invitationCancelled'))
      router.refresh()
    } else {
      modal.open('error', 'Error', result.error || t('team.failedCancelInvitation'))
    }
  }

  const handleRemove = async (member: Member) => {
    const ok = await confirm({
      title: t('team.removeMemberTitle'),
      description: t('team.removeMemberDescription', { name: member.user.name }),
      confirmLabel: t('team.removeButton'),
      destructive: true,
    })
    if (!ok) return
    const result = await removeMember(member.id)
    if (result.success) {
      toast.success(t('team.memberRemoved'))
      router.refresh()
    } else {
      modal.open('error', 'Error', result.error || t('team.failedRemoveMember'))
    }
  }

  /**
   * Takes a board-only technician off the board.
   *
   * The same action the work board uses, rather than a second path: it
   * deactivates rather than deletes, because TimeEntry cascades from
   * Technician and a hard delete would take every hour they ever clocked.
   * Adding somebody happens here, so removing them should too, instead of
   * sending people to a scheduling screen to finish the job.
   */
  const handleRemoveStandalone = async (tech: { id: string; name: string }) => {
    const ok = await confirm({
      title: t('team.removeBoardOnlyTitle', { name: tech.name }),
      description: t('team.removeBoardOnlyBody', { name: tech.name }),
      confirmLabel: t('team.removeButton'),
      destructive: true,
    })
    if (!ok) return
    const result = await deleteTechnician(tech.id)
    if (result.success) {
      toast.success(t('team.removeBoardOnlyDone', { name: tech.name }))
      router.refresh()
    } else {
      modal.open('error', 'Error', result.error || t('team.failedRemoveMember'))
    }
  }

  if (!organization) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold">{t('team.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('team.noOrgDescription')}</p>
        </div>

        <AppCard icon={Users} title={t('team.createOrg')} contentClassName="space-y-4">
          <p className="text-sm text-muted-foreground">{t('team.createOrgDescription')}</p>
          <div className="flex items-end gap-3">
            <div className="flex-1 space-y-2">
              <Label>{t('team.orgName')}</Label>
              <Input
                placeholder={t('team.orgNamePlaceholder')}
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
              />
            </div>
            <Button onClick={handleCreateOrg} disabled={loading || !orgName.trim()}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('team.create')}
            </Button>
          </div>
        </AppCard>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">{t('team.title')}</h2>
        <p className="text-sm text-muted-foreground">{t('team.orgDescription')}</p>
      </div>

      {/* Members Card */}
      <AppCard
        icon={Users}
        title={
          <>
            {organization.name}{' '}
            <Badge variant="outline" className="ml-2 text-xs">
              {' '}
              {organization.members.length !== 1
                ? t('team.memberCountPlural', { count: organization.members.length })
                : t('team.memberCount', { count: organization.members.length })}{' '}
            </Badge>
          </>
        }
        contentClassName="space-y-4"
        action={
          isAdmin ? (
            <Button size="sm" onClick={() => setAdding(true)}>
              <Plus className="mr-1 h-4 w-4" />
              {t('team.addPerson')}
            </Button>
          ) : undefined
        }
      >
        <div className="space-y-2">
          {organization.members.map((member) => (
            <div key={member.id} className="flex items-center gap-3 rounded-lg border p-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-sm font-medium">
                {member.user.name?.charAt(0)?.toUpperCase() || '?'}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-sm">{member.user.name}</p>
                {/* The mobile for a mechanic set up at the counter, whose
                    address is a placeholder nobody can act on, and the email
                    for everybody else. Whichever one identifies them. */}
                <p className="truncate text-xs text-muted-foreground">{contactFor(member.user)}</p>
              </div>
              <div className="flex items-center gap-2">
                {technicians.has(member.user.id) && (
                  <Badge variant="outline" className="text-xs">
                    <Wrench className="mr-1 h-3 w-3" />
                    {t('team.worksOnJobs')}
                  </Badge>
                )}
                {/* The way back off. Setting somebody up and signing them out
                    are both one click, and neither hides inside the other. */}
                {isAdmin && member.role !== 'owner' && technicians.has(member.user.id) && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => handleRevokeApp(member)}
                        aria-label={t('team.revokeTechnicianTitle')}
                      >
                        <LogOut className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t('team.revokeTechnicianTitle')}</TooltipContent>
                  </Tooltip>
                )}
                {isAdmin && member.role !== 'owner' && (
                  /* Shown for everybody, because "can this person have the
                     app" is a question about their role, and hiding the
                     button left no way to find out the answer. Disabled with
                     the reason rather than absent. */
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          disabled={!canUseApp(member)}
                          onClick={() => handleSetUpApp(member)}
                          aria-label={t('team.giveApp')}
                        >
                          <Smartphone className="h-4 w-4" />
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      {canUseApp(member) ? t('team.giveApp') : t('team.cannotUseApp')}
                    </TooltipContent>
                  </Tooltip>
                )}
                {isOwner && member.role !== 'owner' ? (
                  <Select
                    value={
                      /**
                       * Only ever a value the list actually offers.
                       *
                       * The list used to mix Better Auth's membership tiers
                       * with this product's roles, so "Member" sat beside real
                       * permission sets while granting nothing at all. Now it
                       * offers Admin, every role the workshop has, and an
                       * explicit "No role" for somebody who genuinely has
                       * none, which is a state that has to be nameable
                       * because it is the one that refuses every screen.
                       */
                      member.role === 'admin'
                        ? 'admin'
                        : roles.some((r) => r.id === member.roleId)
                          ? (member.roleId as string)
                          : 'none'
                    }
                    onValueChange={(v) => handleAssignRole(member.id, v)}
                  >
                    <SelectTrigger className="h-8 w-40 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {/* A real tier: it short-circuits every permission
                          check, so it grants something on its own. */}
                      <SelectItem value="admin">{t('team.admin')}</SelectItem>
                      {roles.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.name}
                        </SelectItem>
                      ))}
                      <SelectSeparator />
                      <SelectItem value="none">{t('team.noRole')}</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <Badge variant="outline" className={`text-xs ${roleColors[member.role] || ''}`}>
                    {roleIcons[member.role]}
                    <span className="ml-1 capitalize">{member.customRoleName || member.role}</span>
                  </Badge>
                )}
                {isAdmin && member.role !== 'owner' && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => handleRemove(member)}
                    aria-label={t('team.removeMember')}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* On the board with nobody behind them.
            The Add flow creates these, so the page has to show them, or the
            desk adds somebody and watches them vanish. */}
        {standaloneTechnicians.length > 0 && (
          <div className="space-y-2 border-t pt-4">
            <p className="font-medium text-sm">{t('team.boardOnly')}</p>
            <p className="text-muted-foreground text-xs">{t('team.boardOnlyHint')}</p>
            {standaloneTechnicians.map((tech) => (
              <div key={tech.id} className="flex items-center gap-3 rounded-lg border p-3">
                <div
                  className="h-9 w-9 shrink-0 rounded-full"
                  style={{ backgroundColor: tech.color }}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-sm">{tech.name}</p>
                  <p className="truncate text-muted-foreground text-xs">
                    {t('team.boardOnlyNoAccount')}
                  </p>
                </div>
                {isAdmin && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setGivingApp({ id: tech.id, name: tech.name })}
                    >
                      <Smartphone className="mr-1 h-4 w-4" />
                      {t('team.giveApp')}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t('team.removeButton')}
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => handleRemoveStandalone(tech)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </AppCard>

      {/* Pending Invitations Card */}
      {isAdmin && pendingInvitations.length > 0 && (
        <AppCard
          icon={Mail}
          title={
            <>
              {t('team.pendingInvitations')}{' '}
              <Badge variant="outline" className="ml-2 text-xs">
                {' '}
                {pendingInvitations.length}{' '}
              </Badge>
            </>
          }
        >
          <div className="space-y-2">
            {pendingInvitations.map((invitation) => (
              <div key={invitation.id} className="flex items-center gap-3 rounded-lg border p-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-sm">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-sm">{invitation.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {t('team.invitedAs', { role: invitation.customRole?.name || invitation.role })}{' '}
                    &middot;{' '}
                    {t('team.expires', {
                      date: new Date(invitation.expiresAt).toLocaleDateString(),
                    })}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className="text-xs bg-yellow-500/10 text-yellow-600 border-yellow-500/20"
                  >
                    {t('team.pending')}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground"
                    title={t('team.copyInviteLink')}
                    aria-label={t('team.copyInviteLink')}
                    onClick={() => {
                      const url = `${window.location.origin}/auth/sign-up?invite=${invitation.token}`
                      navigator.clipboard.writeText(url)
                      toast.success(t('team.inviteLinkCopied'))
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => handleCancelInvitation(invitation)}
                    aria-label={t('team.cancelInvite')}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </AppCard>
      )}

      {/* Custom Roles Card */}
      {isAdmin && (
        <AppCard
          icon={ShieldCheck}
          title={t('team.customRoles')}
          action={
            !showRoleForm && (
              <div className="flex gap-2">
                {/* Only while one of them is missing. A workshop that has both,
                    or has renamed them, is left alone. */}
                {missingDefaultRoles && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleCreateDefaultRoles}
                    disabled={loading}
                  >
                    <ShieldCheck className="mr-1 h-4 w-4" />
                    {t('team.createDefaultRoles')}
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => openRoleForm()}>
                  <Plus className="mr-1 h-4 w-4" />
                  {t('team.newRole')}
                </Button>
              </div>
            )
          }
          contentClassName="space-y-4"
        >
          {showRoleForm && (
            <div className="space-y-4 rounded-lg border p-4">
              <div className="space-y-2">
                <Label>{t('team.roleName')}</Label>
                <Input
                  placeholder={t('team.roleNamePlaceholder')}
                  value={roleName}
                  onChange={(e) => setRoleName(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="role-admin"
                  checked={roleIsAdmin}
                  onCheckedChange={(v) => setRoleIsAdmin(v === true)}
                />
                <Label htmlFor="role-admin" className="text-sm">
                  {t('team.fullAdminAccess')}
                </Label>
              </div>
              {!roleIsAdmin && (
                <div className="space-y-3">
                  <Label className="text-sm font-medium">{t('team.permissions')}</Label>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const all = new Set<string>()
                        for (const g of permissionGroups) {
                          for (const p of g.permissions) {
                            all.add(`${p.action}:${g.subject}`)
                          }
                        }
                        setSelectedPermissions(all)
                      }}
                    >
                      {t('team.presetAll')}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const keys = new Set<string>()
                        for (const g of permissionGroups) {
                          for (const p of g.permissions) {
                            if (p.action === PermissionAction.READ) {
                              keys.add(`${p.action}:${g.subject}`)
                            }
                          }
                        }
                        setSelectedPermissions(keys)
                      }}
                    >
                      {t('team.presetViewOnly')}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const keys = new Set<string>()
                        for (const g of permissionGroups) {
                          for (const p of g.permissions) {
                            if (
                              p.action === PermissionAction.READ ||
                              p.action === PermissionAction.CREATE ||
                              p.action === PermissionAction.UPDATE
                            ) {
                              keys.add(`${p.action}:${g.subject}`)
                            }
                          }
                        }
                        setSelectedPermissions(keys)
                      }}
                    >
                      {t('team.presetWriteAll')}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedPermissions(new Set())}
                    >
                      {t('team.presetNone')}
                    </Button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {permissionGroups.map((group) => (
                      <div key={group.subject} className="space-y-2 rounded-md border p-3">
                        <p className="text-sm font-medium">{tPerm(`subjects.${group.subject}`)}</p>
                        <div className="space-y-1.5">
                          {group.permissions.map((perm) => {
                            const key = `${perm.action}:${group.subject}`
                            return (
                              <div key={key} className="flex items-center gap-2">
                                <Checkbox
                                  id={key}
                                  checked={selectedPermissions.has(key)}
                                  onCheckedChange={() =>
                                    togglePermission(perm.action, group.subject)
                                  }
                                />
                                <Label htmlFor={key} className="text-xs">
                                  {tPerm(`actions.${labelKey(group.subject, perm.action)}`)}
                                </Label>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex gap-2">
                <Button onClick={handleSaveRole} disabled={loading || !roleName.trim()} size="sm">
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {editingRole ? t('team.updateRole') : t('team.createRole')}
                </Button>
                <Button variant="outline" size="sm" onClick={closeRoleForm}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {roles.length === 0 && !showRoleForm && (
            <p className="text-sm text-muted-foreground">{t('team.noCustomRoles')}</p>
          )}

          {roles.length > 0 && (
            <div className="space-y-2">
              {roles.map((role) => (
                <div
                  key={role.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{role.name}</p>
                      {role.isAdmin && (
                        <Badge
                          variant="outline"
                          className="text-xs bg-blue-500/10 text-blue-500 border-blue-500/20"
                        >
                          {t('team.admin')}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {role.isAdmin
                        ? t('team.fullAccess')
                        : role.permissions.length !== 1
                          ? t('team.permissionCountPlural', { count: role.permissions.length })
                          : t('team.permissionCount', { count: role.permissions.length })}
                      {' · '}
                      {role.memberCount !== 1
                        ? t('team.memberCountPlural', { count: role.memberCount })
                        : t('team.memberCount', { count: role.memberCount })}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => openRoleForm(role)}
                      aria-label={t('team.editRole')}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => handleDeleteRole(role)}
                      aria-label={t('team.deleteRole')}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </AppCard>
      )}

      {/* Role Descriptions */}
      <AppCard title={t('team.builtInRoles')}>
        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-3">
            <Badge variant="outline" className={`${roleColors.owner}`}>
              <Crown className="mr-1 h-3 w-3" /> {t('team.ownerLabel')}
            </Badge>
            <span className="text-muted-foreground">{t('team.ownerDescription')}</span>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className={`${roleColors.admin}`}>
              <Shield className="mr-1 h-3 w-3" /> {t('team.adminLabel')}
            </Badge>
            <span className="text-muted-foreground">{t('team.adminDescription')}</span>
          </div>
          {/* Not "Member". That was Better Auth's membership tier listed as
              though it were a role, while granting nothing at all. What it
              actually describes is the absence of a role, so it says so. */}
          <div className="flex items-center gap-3">
            <Badge variant="outline" className={`${roleColors.member}`}>
              <User className="mr-1 h-3 w-3" /> {t('team.noRole')}
            </Badge>
            <span className="text-muted-foreground">{t('team.noRoleDescription')}</span>
          </div>
        </div>
      </AppCard>

      {/* Configured address first, current origin second. They agree in
          production; in development the origin is localhost, which is an
          address the technician's phone cannot reach. */}
      <AddPersonDialog
        open={adding}
        onOpenChange={setAdding}
        workshopUrl={workshopUrl}
        dialCode={dialCode}
        roles={roles}
        onChanged={() => router.refresh()}
      />

      <GiveAppDialog
        technician={givingApp}
        workshopUrl={workshopUrl}
        dialCode={dialCode}
        onClose={() => setGivingApp(null)}
        onChanged={() => router.refresh()}
      />

      <AppSetupCodeDialog
        userId={settingUp?.userId ?? null}
        memberName={settingUp?.name ?? ''}
        workshopUrl={workshopUrl}
        onClose={() => setSettingUp(null)}
      />
    </div>
  )
}
