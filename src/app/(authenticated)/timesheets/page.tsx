import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/page-header'
import { getLayoutData } from '@/lib/get-layout-data'
import { getCachedMembership } from '@/lib/cached-session'
import { hasPermission, PermissionAction, PermissionSubject } from '@/lib/permissions'
import { getTimesheet } from '@/features/time-tracking/Actions/timesheetActions'
import TimesheetsClient from './timesheets-client'

/**
 * Who worked when: every technician's clocked time, by day, for a window.
 *
 * Gated by the time tracking subject rather than reports, so a foreman can
 * be given this page without the revenue figures that sit beside it.
 */
export default async function TimesheetsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; tech?: string }>
}) {
  const data = await getLayoutData()
  if (data.status === 'unauthenticated') redirect('/auth/sign-in')
  if (data.status === 'no-organization') redirect('/onboarding')

  const isOwnerOrAdmin =
    data.role === 'owner' || data.role === 'admin' || data.role === 'super_admin'
  if (!isOwnerOrAdmin) {
    const membership = await getCachedMembership(data.userId)
    if (membership?.roleId) {
      const allowed = hasPermission(membership.customRole?.permissions ?? [], {
        action: PermissionAction.READ,
        subject: PermissionSubject.TIME_TRACKING,
      })
      if (!allowed) redirect('/')
    }
  }

  const params = await searchParams
  const initial = await getTimesheet({
    from: params.from,
    to: params.to,
    technicianId: params.tech || null,
  })

  return (
    <>
      <PageHeader />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <TimesheetsClient
          initial={initial.success && initial.data ? initial.data : null}
          initialError={initial.success ? null : (initial.error ?? null)}
        />
      </div>
    </>
  )
}
