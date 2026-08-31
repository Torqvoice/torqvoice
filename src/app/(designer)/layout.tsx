import { redirect } from 'next/navigation'
import { getLayoutData } from '@/lib/get-layout-data'
import { getCachedMembership } from '@/lib/cached-session'
import { hasPermission, PermissionAction, PermissionSubject } from '@/lib/permissions'
import { ServiceTypeProvider } from '@/components/service-type-context'
import { ConfirmProvider } from '@/components/confirm-dialog'
// The faces the PDFs embed, so the canvas measures what the paper prints.
import '@/features/invoice-designer/Render/documentFonts.css'

/**
 * The designer runs full-bleed: no sidebar, no banners, nothing but the tool.
 * It sits outside the dashboard layout for that reason alone, so it repeats the
 * dashboard's guards rather than inheriting them.
 *
 * Settings rights, because what this edits is the sheet every customer of the
 * workshop receives. It is reached from the templates page, which has always
 * been behind that permission, and a full-screen tool on its own URL must not
 * be the way around it.
 */
export default async function DesignerLayout({ children }: { children: React.ReactNode }) {
  const data = await getLayoutData()

  if (data.status === 'unauthenticated') redirect('/auth/sign-in')
  if (data.status === 'no-organization') redirect('/onboarding')

  const isOwnerOrAdmin =
    data.role === 'owner' || data.role === 'admin' || data.role === 'super_admin'
  if (!isOwnerOrAdmin) {
    const membership = await getCachedMembership(data.userId)
    // A member with no custom role keeps full access, as everywhere else.
    if (membership?.roleId) {
      const permissions = membership?.customRole?.permissions ?? []
      const canEdit = hasPermission(permissions, {
        action: PermissionAction.UPDATE,
        subject: PermissionSubject.SETTINGS,
      })
      if (!canEdit) redirect('/')
    }
  }

  return (
    <ServiceTypeProvider serviceType={data.serviceType ?? 'automotive'}>
      <ConfirmProvider>
        <div className="h-screen overflow-hidden bg-[#eceef1] text-[#1a1d21]">{children}</div>
      </ConfirmProvider>
    </ServiceTypeProvider>
  )
}
