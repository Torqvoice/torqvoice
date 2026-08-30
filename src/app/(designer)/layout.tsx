import { redirect } from 'next/navigation'
import { getLayoutData } from '@/lib/get-layout-data'
import { ServiceTypeProvider } from '@/components/service-type-context'
import { ConfirmProvider } from '@/components/confirm-dialog'
// The faces the PDFs embed, so the canvas measures what the paper prints.
import '@/features/invoice-designer/Render/documentFonts.css'

/**
 * The designer runs full-bleed: no sidebar, no banners, nothing but the tool.
 * It sits outside the dashboard layout for that reason alone, so it repeats the
 * dashboard's two guards rather than inheriting them.
 */
export default async function DesignerLayout({ children }: { children: React.ReactNode }) {
  const data = await getLayoutData()

  if (data.status === 'unauthenticated') redirect('/auth/sign-in')
  if (data.status === 'no-organization') redirect('/onboarding')

  return (
    <ServiceTypeProvider serviceType={data.serviceType ?? 'automotive'}>
      <ConfirmProvider>
        <div className="h-screen overflow-hidden bg-[#eceef1] text-[#1a1d21]">{children}</div>
      </ConfirmProvider>
    </ServiceTypeProvider>
  )
}
