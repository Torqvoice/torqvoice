import { getTranslations } from 'next-intl/server'
import { getAllReminders } from '@/features/vehicles/Actions/reminderActions'
import { getDisplaySettings } from '@/features/settings/Actions/settingsActions'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { RemindersPageClient } from '@/features/vehicles/Components/RemindersPageClient'
import { PageHeader } from '@/components/page-header'

export default async function RemindersPage() {
  const [remindersResult, settingsResult] = await Promise.all([
    getAllReminders(),
    getDisplaySettings([SETTING_KEYS.UNIT_SYSTEM]),
  ])

  if (!remindersResult.success || !remindersResult.data) {
    const t = await getTranslations('reminders')
    return (
      <>
        <PageHeader />
        <div className="flex h-[50vh] items-center justify-center">
          <p className="text-muted-foreground">{t('error')}</p>
        </div>
      </>
    )
  }

  const settings = settingsResult.success && settingsResult.data ? settingsResult.data : {}
  const unitSystem = (settings[SETTING_KEYS.UNIT_SYSTEM] || 'imperial') as 'metric' | 'imperial'

  return (
    <>
      <PageHeader />
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <RemindersPageClient reminders={remindersResult.data} unitSystem={unitSystem} />
      </div>
    </>
  )
}
