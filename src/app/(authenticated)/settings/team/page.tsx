import { getOrganization } from '@/features/team/Actions/teamActions'
import { getRoles } from '@/features/team/Actions/getRoles'
import { getPendingInvitations } from '@/features/team/Actions/getPendingInvitations'
import { getTechnicianUserIds } from '@/features/team/Actions/setMemberTechnician'
import { getWorkshopDialCode } from '@/features/team/Actions/createTechnicianAccount'
import { getStandaloneTechnicians } from '@/features/team/Actions/giveTechnicianTheApp'
import { TeamSettings } from './team-settings'

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ add?: string }>
}) {
  // Quick Add sends people here to add somebody, so land them on the question
  // rather than on a page where they have to find the button again.
  const { add } = await searchParams
  const [result, rolesResult, invitationsResult, technicianResult, dialResult, standaloneResult] =
    await Promise.all([
      getOrganization(),
      getRoles(),
      getPendingInvitations(),
      getTechnicianUserIds(),
      getWorkshopDialCode(),
      getStandaloneTechnicians(),
    ])
  const orgData = result.success ? result.data : null
  const roles = rolesResult.success && rolesResult.data ? rolesResult.data : []
  const pendingInvitations =
    invitationsResult.success && invitationsResult.data ? invitationsResult.data : []
  const technicianUserIds =
    technicianResult.success && technicianResult.data ? technicianResult.data : []

  return (
    <TeamSettings
      organization={orgData?.organization || null}
      currentRole={orgData?.currentRole || null}
      roles={roles}
      pendingInvitations={pendingInvitations}
      technicianUserIds={technicianUserIds}
      startAdding={add === 'true'}
      dialCode={(dialResult.success && dialResult.data?.dialCode) || ''}
      standaloneTechnicians={
        standaloneResult.success && standaloneResult.data ? standaloneResult.data : []
      }
    />
  )
}
