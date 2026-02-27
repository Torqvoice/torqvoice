"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useGlassModal } from "@/components/glass-modal";
import { useConfirm } from "@/components/confirm-dialog";
import {
  createOrganization,
  inviteMember,
  updateMemberRole,
  removeMember,
} from "@/features/team/Actions/teamActions";
import { sendInvitation } from "@/features/team/Actions/sendInvitation";
import { cancelInvitation } from "@/features/team/Actions/cancelInvitation";
import { createRole } from "@/features/team/Actions/createRole";
import { updateRole } from "@/features/team/Actions/updateRole";
import { deleteRole } from "@/features/team/Actions/deleteRole";
import { assignRole } from "@/features/team/Actions/assignRole";
import { permissionGroups } from "@/lib/permissions";
import { Copy, Crown, Loader2, Mail, Pencil, Plus, Shield, ShieldCheck, Trash2, User, Users, X } from "lucide-react";

interface Member {
  id: string;
  role: string;
  roleId: string | null;
  customRoleName: string | null;
  user: { id: string; name: string; email: string };
}

interface Organization {
  id: string;
  name: string;
  members: Member[];
}

interface PendingInvitation {
  id: string;
  email: string;
  role: string;
  roleId: string | null;
  token: string;
  customRole: { name: string } | null;
  createdAt: Date;
  expiresAt: Date;
}

interface RoleData {
  id: string;
  name: string;
  isAdmin: boolean;
  permissions: { action: string; subject: string }[];
  memberCount: number;
}

const roleIcons: Record<string, React.ReactNode> = {
  owner: <Crown className="h-3 w-3" />,
  admin: <Shield className="h-3 w-3" />,
  member: <User className="h-3 w-3" />,
};

const roleColors: Record<string, string> = {
  owner: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  admin: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  member: "bg-gray-500/10 text-gray-500 border-gray-500/20",
};

export function TeamSettings({
  organization,
  currentRole,
  roles = [],
  pendingInvitations = [],
}: {
  organization: Organization | null;
  currentRole: string | null;
  roles?: RoleData[];
  pendingInvitations?: PendingInvitation[];
}) {
  const router = useRouter();
  const t = useTranslations('settings');
  const modal = useGlassModal();
  const confirm = useConfirm();
  const [loading, setLoading] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<string>("member");
  const [inviteRoleId, setInviteRoleId] = useState<string | null>(null);

  // Role form state
  const [showRoleForm, setShowRoleForm] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleData | null>(null);
  const [roleName, setRoleName] = useState("");
  const [roleIsAdmin, setRoleIsAdmin] = useState(false);
  const [selectedPermissions, setSelectedPermissions] = useState<Set<string>>(new Set());

  const isOwner = currentRole === "owner";
  const isAdmin = currentRole === "owner" || currentRole === "admin";

  const togglePermission = (action: string, subject: string) => {
    const key = `${action}:${subject}`;
    setSelectedPermissions((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const openRoleForm = (role?: RoleData) => {
    if (role) {
      setEditingRole(role);
      setRoleName(role.name);
      setRoleIsAdmin(role.isAdmin);
      setSelectedPermissions(
        new Set(role.permissions.map((p) => `${p.action}:${p.subject}`)),
      );
    } else {
      setEditingRole(null);
      setRoleName("");
      setRoleIsAdmin(false);
      setSelectedPermissions(new Set());
    }
    setShowRoleForm(true);
  };

  const closeRoleForm = () => {
    setShowRoleForm(false);
    setEditingRole(null);
    setRoleName("");
    setRoleIsAdmin(false);
    setSelectedPermissions(new Set());
  };

  const handleSaveRole = async () => {
    if (!roleName.trim()) return;
    setLoading(true);

    const permissions = Array.from(selectedPermissions).map((key) => {
      const [action, subject] = key.split(":");
      return { action, subject };
    });

    let result;
    if (editingRole) {
      result = await updateRole({
        roleId: editingRole.id,
        name: roleName,
        isAdmin: roleIsAdmin,
        permissions,
      });
    } else {
      result = await createRole({ name: roleName, isAdmin: roleIsAdmin, permissions });
    }

    if (result.success) {
      toast.success(editingRole ? t('team.roleUpdated') : t('team.roleCreated'));
      closeRoleForm();
      router.refresh();
    } else {
      modal.open("error", "Error", result.error || t('team.failedSaveRole'));
    }
    setLoading(false);
  };

  const handleDeleteRole = async (role: RoleData) => {
    const ok = await confirm({
      title: t('team.deleteRole'),
      description: t('team.deleteRoleDescription', { name: role.name }),
      confirmLabel: t('team.deleteRole'),
      destructive: true,
    });
    if (!ok) return;
    const result = await deleteRole(role.id);
    if (result.success) {
      toast.success(t('team.roleDeleted'));
      router.refresh();
    } else {
      modal.open("error", "Error", result.error || t('team.failedDeleteRole'));
    }
  };

  const handleAssignRole = async (memberId: string, value: string) => {
    let role: "admin" | "member";
    let roleId: string | null;

    if (value === "admin") {
      role = "admin";
      roleId = null;
    } else if (value === "member") {
      role = "member";
      roleId = null;
    } else {
      // Custom role ID
      role = "member";
      roleId = value;
    }

    const result = await assignRole({ memberId, role, roleId });
    if (result.success) {
      toast.success(t('team.roleAssigned'));
      router.refresh();
    } else {
      modal.open("error", "Error", result.error || t('team.failedAssignRole'));
    }
  };

  const handleCreateOrg = async () => {
    if (!orgName.trim()) return;
    setLoading(true);
    const result = await createOrganization({ name: orgName });
    if (result.success) {
      toast.success(t('team.orgCreated'));
      router.refresh();
    } else {
      modal.open("error", "Error", result.error || t('team.failedCreateOrg'));
    }
    setLoading(false);
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setLoading(true);
    const result = await inviteMember({ email: inviteEmail, role: inviteRole, roleId: inviteRoleId || undefined });
    if (result.success) {
      const data = result.data as { invited: boolean; userNotFound?: boolean };
      if (data.userNotFound) {
        // User doesn't exist — ask to send invitation email
        const emailToInvite = inviteEmail;
        const roleToInvite = inviteRole;
        setLoading(false);
        const ok = await confirm({
          title: t('team.userNotFoundTitle'),
          description: t('team.userNotFoundDescription', { email: emailToInvite }),
          confirmLabel: t('team.sendInvitation'),
        });
        if (ok) {
          setLoading(true);
          const sendResult = await sendInvitation({ email: emailToInvite, role: roleToInvite, roleId: inviteRoleId || undefined });
          if (sendResult.success) {
            setInviteEmail("");
            router.refresh();
            modal.open("success", t('team.invitationSentTitle'), t('team.invitationSentDescription', { email: emailToInvite }));
          } else {
            modal.open("error", "Error", sendResult.error || t('team.failedSendInvitation'));
          }
          setLoading(false);
        }
      } else {
        setInviteEmail("");
        router.refresh();
        modal.open("success", t('team.invite'), t('team.invited'));
      }
    } else {
      modal.open("error", "Error", result.error || t('team.failedInvite'));
    }
    setLoading(false);
  };

  const handleCancelInvitation = async (invitation: PendingInvitation) => {
    const ok = await confirm({
      title: t('team.cancelInvitation'),
      description: t('team.cancelInvitationDescription', { email: invitation.email }),
      confirmLabel: t('team.cancelInvitation'),
      destructive: true,
    });
    if (!ok) return;
    const result = await cancelInvitation({ invitationId: invitation.id });
    if (result.success) {
      toast.success(t('team.invitationCancelled'));
      router.refresh();
    } else {
      modal.open("error", "Error", result.error || t('team.failedCancelInvitation'));
    }
  };

  const handleRoleChange = async (memberId: string, role: string) => {
    const result = await updateMemberRole({ memberId, role });
    if (result.success) {
      toast.success(t('team.memberRoleUpdated'));
      router.refresh();
    } else {
      modal.open("error", "Error", result.error || t('team.failedUpdateRole'));
    }
  };

  const handleRemove = async (member: Member) => {
    const ok = await confirm({
      title: t('team.removeMemberTitle'),
      description: t('team.removeMemberDescription', { name: member.user.name }),
      confirmLabel: t('team.removeButton'),
      destructive: true,
    });
    if (!ok) return;
    const result = await removeMember(member.id);
    if (result.success) {
      toast.success(t('team.memberRemoved'));
      router.refresh();
    } else {
      modal.open("error", "Error", result.error || t('team.failedRemoveMember'));
    }
  };

  if (!organization) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold">{t('team.title')}</h2>
          <p className="text-sm text-muted-foreground">
            {t('team.noOrgDescription')}
          </p>
        </div>

        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4" /> {t('team.createOrg')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t('team.createOrgDescription')}
            </p>
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
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">{t('team.title')}</h2>
        <p className="text-sm text-muted-foreground">
          {t('team.orgDescription')}
        </p>
      </div>

      {/* Members Card */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4" /> {organization.name}
            <Badge variant="outline" className="ml-2 text-xs">
              {organization.members.length !== 1 ? t('team.memberCountPlural', { count: organization.members.length }) : t('team.memberCount', { count: organization.members.length })}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            {organization.members.map((member) => (
              <div
                key={member.id}
                className="flex items-center gap-3 rounded-lg border p-3"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-sm font-medium">
                  {member.user.name?.charAt(0)?.toUpperCase() || "?"}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-sm">{member.user.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{member.user.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  {isOwner && member.role !== "owner" ? (
                    <Select
                      value={member.roleId || member.role}
                      onValueChange={(v) => handleAssignRole(member.id, v)}
                    >
                      <SelectTrigger className="h-8 w-36 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">{t('team.admin')}</SelectItem>
                        <SelectItem value="member">{t('team.member')}</SelectItem>
                        {roles.length > 0 && (
                          <>
                            <SelectSeparator />
                            {roles.map((r) => (
                              <SelectItem key={r.id} value={r.id}>
                                {r.name}
                              </SelectItem>
                            ))}
                          </>
                        )}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge variant="outline" className={`text-xs ${roleColors[member.role] || ""}`}>
                      {roleIcons[member.role]}
                      <span className="ml-1 capitalize">{member.customRoleName || member.role}</span>
                    </Badge>
                  )}
                  {isAdmin && member.role !== "owner" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => handleRemove(member)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {isAdmin && (
            <form onSubmit={handleInvite} className="flex items-end gap-3 border-t pt-4">
              <div className="flex-1 space-y-2">
                <Label>{t('team.inviteByEmail')}</Label>
                <Input
                  type="email"
                  placeholder={t('team.inviteEmailPlaceholder')}
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  required
                />
              </div>
              <Select
                value={inviteRoleId ? `custom:${inviteRoleId}` : inviteRole}
                onValueChange={(v) => {
                  if (v.startsWith("custom:")) {
                    const id = v.replace("custom:", "");
                    setInviteRole("member");
                    setInviteRoleId(id);
                  } else {
                    setInviteRole(v);
                    setInviteRoleId(null);
                  }
                }}
              >
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">{t('team.admin')}</SelectItem>
                  <SelectItem value="member">{t('team.member')}</SelectItem>
                  {roles.length > 0 && (
                    <>
                      <SelectSeparator />
                      {roles.map((r) => (
                        <SelectItem key={r.id} value={`custom:${r.id}`}>
                          {r.name}
                        </SelectItem>
                      ))}
                    </>
                  )}
                </SelectContent>
              </Select>
              <Button type="submit" disabled={loading || !inviteEmail.trim()}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />}
                {t('team.invite')}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      {/* Pending Invitations Card */}
      {isAdmin && pendingInvitations.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Mail className="h-4 w-4" /> {t('team.pendingInvitations')}
              <Badge variant="outline" className="ml-2 text-xs">
                {pendingInvitations.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {pendingInvitations.map((invitation) => (
                <div
                  key={invitation.id}
                  className="flex items-center gap-3 rounded-lg border p-3"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-sm">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-sm">{invitation.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {t('team.invitedAs', { role: invitation.customRole?.name || invitation.role })} &middot; {t('team.expires', { date: new Date(invitation.expiresAt).toLocaleDateString() })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs bg-yellow-500/10 text-yellow-600 border-yellow-500/20">
                      {t('team.pending')}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground"
                      title={t('team.copyInviteLink')}
                      onClick={() => {
                        const url = `${window.location.origin}/auth/sign-up?invite=${invitation.token}`;
                        navigator.clipboard.writeText(url);
                        toast.success(t('team.inviteLinkCopied'));
                      }}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => handleCancelInvitation(invitation)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Custom Roles Card */}
      {isAdmin && (
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="h-4 w-4" /> {t('team.customRoles')}
              </CardTitle>
              {!showRoleForm && (
                <Button size="sm" variant="outline" onClick={() => openRoleForm()}>
                  <Plus className="mr-1 h-4 w-4" />
                  {t('team.newRole')}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
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
                    <div className="grid gap-4 sm:grid-cols-2">
                      {permissionGroups.map((group) => (
                        <div key={group.subject} className="space-y-2 rounded-md border p-3">
                          <p className="text-sm font-medium">{group.name}</p>
                          <div className="space-y-1.5">
                            {group.permissions.map((perm) => {
                              const key = `${perm.action}:${group.subject}`;
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
                                    {perm.label}
                                  </Label>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex gap-2">
                  <Button
                    onClick={handleSaveRole}
                    disabled={loading || !roleName.trim()}
                    size="sm"
                  >
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
              <p className="text-sm text-muted-foreground">
                {t('team.noCustomRoles')}
              </p>
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
                          <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-500 border-blue-500/20">
                            {t('team.admin')}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {role.isAdmin
                          ? t('team.fullAccess')
                          : role.permissions.length !== 1 ? t('team.permissionCountPlural', { count: role.permissions.length }) : t('team.permissionCount', { count: role.permissions.length })}
                        {" · "}
                        {role.memberCount !== 1 ? t('team.memberCountPlural', { count: role.memberCount }) : t('team.memberCount', { count: role.memberCount })}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => openRoleForm(role)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDeleteRole(role)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Role Descriptions */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">{t('team.builtInRoles')}</CardTitle>
        </CardHeader>
        <CardContent>
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
            <div className="flex items-center gap-3">
              <Badge variant="outline" className={`${roleColors.member}`}>
                <User className="mr-1 h-3 w-3" /> {t('team.memberLabel')}
              </Badge>
              <span className="text-muted-foreground">{t('team.memberDescription')}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
