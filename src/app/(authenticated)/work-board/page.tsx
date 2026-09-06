import { getTranslations } from 'next-intl/server'
import { PageHeader } from '@/components/page-header'
import { getTechnicians } from '@/features/workboard/Actions/technicianActions'
import { getWorkBays } from '@/features/workboard/Actions/workBayActions'
import {
  getBoardJobs,
  getUnassignedJobs,
  getWorkBoardSettings,
} from '@/features/workboard/Actions/boardActions'
import { WorkBoardClient } from '@/features/workboard/Components/WorkBoardClient'
import { getAuthContext } from '@/lib/get-auth-context'
import { addZonedDays, zonedDayKey, zonedParts } from '@/lib/timezone'
import { workshopTimeZone } from '@/lib/workshop-timezone'

// The week that holds the workshop's today, on the workshop's clock.
function getWeekStart(date: Date, weekStartDay: number, timeZone: string): string {
  const diff = (zonedParts(date, timeZone).weekday - weekStartDay + 7) % 7
  return zonedDayKey(addZonedDays(date, -diff, timeZone), timeZone)
}

export default async function WorkBoardPage() {
  const settingsResult = await getWorkBoardSettings()
  const boardSettings =
    settingsResult.success && settingsResult.data
      ? settingsResult.data
      : { weekStartDay: 1, workDayStart: '07:00', workDayEnd: '15:00' }

  const ctx = await getAuthContext()
  const timeZone = ctx ? await workshopTimeZone(ctx.organizationId) : 'UTC'
  const weekStart = getWeekStart(new Date(), boardSettings.weekStartDay, timeZone)

  const [techResult, bayResult, assignResult, unassignedResult] = await Promise.all([
    getTechnicians(),
    getWorkBays(),
    getBoardJobs(weekStart),
    getUnassignedJobs(),
  ])

  if (!techResult.success) {
    return (
      <>
        <PageHeader />
        <div className="flex h-[50vh] items-center justify-center">
          <p className="text-muted-foreground">
            {techResult.error || (await getTranslations('workBoard.page'))('error')}
          </p>
        </div>
      </>
    )
  }

  const technicians = techResult.data ?? []
  const workBays = bayResult.success && bayResult.data ? bayResult.data : []
  const assignments = assignResult.success && assignResult.data ? assignResult.data : []
  const unassigned =
    unassignedResult.success && unassignedResult.data
      ? unassignedResult.data
      : { serviceRecords: [], inspections: [] }

  return (
    <>
      <PageHeader />
      <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 pt-0">
        <WorkBoardClient
          initialTechnicians={
            technicians as Parameters<typeof WorkBoardClient>[0]['initialTechnicians']
          }
          initialWorkBays={workBays}
          initialAssignments={
            assignments as Parameters<typeof WorkBoardClient>[0]['initialAssignments']
          }
          initialUnassigned={unassigned}
          initialWeekStart={weekStart}
          boardSettings={boardSettings}
        />
      </div>
    </>
  )
}
