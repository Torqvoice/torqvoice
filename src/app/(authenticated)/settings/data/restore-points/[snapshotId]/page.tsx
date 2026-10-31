import { notFound, redirect } from 'next/navigation'
import { RestorePointExplorer } from '@/features/integrations/Components/RestorePointExplorer'
import type { ExploreSource } from '@/features/integrations/Lib/explore-source'
import { getAuthContext } from '@/lib/get-auth-context'

/**
 * A restore point opened read-only: what the workshop held when the backup
 * was taken, record by record. `source` names the repository it is read
 * from, `platform` for Backups by Torqvoice or a destination's connector id.
 * Owners and administrators only; the actions behind the page check again.
 */
export default async function RestorePointPage({
  params,
  searchParams,
}: {
  params: Promise<{ snapshotId: string }>
  searchParams: Promise<{ source?: string }>
}) {
  const ctx = await getAuthContext()
  if (!ctx) redirect('/auth/sign-in')
  if (!ctx.isAdmin) redirect('/settings/data')

  const { snapshotId } = await params
  if (!/^[0-9a-f]{8,64}$/.test(snapshotId)) notFound()

  const { source: from } = await searchParams
  let source: ExploreSource
  if (!from || from === 'platform') source = { kind: 'platform' }
  else if (/^[a-z0-9-]{1,64}$/.test(from)) source = { kind: 'destination', connectorId: from }
  else notFound()

  // Back to where the restore point was listed.
  const backHref =
    source.kind === 'platform' ? '/settings/data' : `/settings/integrations/${source.connectorId}`

  return (
    <RestorePointExplorer
      organizationId={ctx.organizationId}
      snapshotId={snapshotId}
      source={source}
      backHref={backHref}
    />
  )
}
