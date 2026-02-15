import { getOrganization } from "@/features/team/Actions/teamActions";
import { getRoles } from "@/features/team/Actions/getRoles";
import { TeamSettings } from "./team-settings";

export default async function TeamPage() {
  const [result, rolesResult] = await Promise.all([
    getOrganization(),
    getRoles(),
  ]);
  const orgData = result.success ? result.data : null;
  const roles = rolesResult.success && rolesResult.data ? rolesResult.data : [];

  return (
    <TeamSettings
      organization={orgData?.organization || null}
      currentRole={orgData?.currentRole || null}
      roles={roles}
    />
  );
}
