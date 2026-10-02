import { redirect } from 'next/navigation'
import { getLayoutData } from '@/lib/get-layout-data'
import { DateSettingsProvider } from '@/components/date-settings-context'
import { ConfirmProvider } from '@/components/confirm-dialog'
import { RealtimeProvider } from '@/features/realtime/RealtimeProvider'

export default async function PresenterLayout({ children }: { children: React.ReactNode }) {
  const data = await getLayoutData()

  if (data.status === 'unauthenticated') redirect('/auth/sign-in')
  if (data.status === 'no-organization') redirect('/onboarding')

  return (
    <DateSettingsProvider
      dateFormat={data.dateFormat}
      timeFormat={data.timeFormat}
      timezone={data.timezone}
    >
      <ConfirmProvider>
        {/* The presenter sits outside the app shell, so it brings its own
            socket: without one the board never hears a change and its live
            light stays red. */}
        <RealtimeProvider>{children}</RealtimeProvider>
      </ConfirmProvider>
    </DateSettingsProvider>
  )
}
