import { getOrganization } from "@/features/team/Actions/teamActions";
import { getRoles } from "@/features/team/Actions/getRoles";
import { getPendingInvitations } from "@/features/team/Actions/getPendingInvitations";
import { TeamSettings } from "./team-settings";

export default async function TeamPage() {
  const [result, rolesResult, invitationsResult] = await Promise.all([
    getOrganization(),
    getRoles(),
    getPendingInvitations(),
  ]);
  const orgData = result.success ? result.data : null;
  const roles = rolesResult.success && rolesResult.data ? rolesResult.data : [];
  const pendingInvitations = invitationsResult.success && invitationsResult.data ? invitationsResult.data : [];

  return (
    <TeamSettings
      organization={orgData?.organization || null}
      currentRole={orgData?.currentRole || null}
      roles={roles}
      pendingInvitations={pendingInvitations}
    />
  );
}
