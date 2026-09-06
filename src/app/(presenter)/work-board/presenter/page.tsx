import { Suspense } from 'react'
import { getTranslations } from 'next-intl/server'
import { getTechnicians } from '@/features/workboard/Actions/technicianActions'
import { getBoardJobs, getWorkBoardSettings } from '@/features/workboard/Actions/boardActions'
import { getWorkBays } from '@/features/workboard/Actions/workBayActions'
import { WorkBoardPresenter } from '@/features/workboard/Components/WorkBoardPresenter'
import { getAuthContext } from '@/lib/get-auth-context'
import { zonedDate, zonedParts } from '@/lib/timezone'
import { workshopTimeZone } from '@/lib/workshop-timezone'

export const dynamic = 'force-dynamic'

function getWeekStart(date: Date, weekStartDay: number): string {
  const d = new Date(date)
  const diff = (d.getDay() - weekStartDay + 7) % 7
  d.setDate(d.getDate() - diff)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

export default async function WorkBoardPresenterPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const params = await searchParams
  const techPromise = getTechnicians()
  // Without a date the board opens on the workshop's today, not the server's.
  const ctx = await getAuthContext()
  const timeZone = ctx ? await workshopTimeZone(ctx.organizationId) : 'UTC'
  const today = zonedParts(new Date(), timeZone)
  const baseDate = params.date
    ? new Date(params.date + 'T12:00:00')
    : zonedDate(today.year, today.month, today.day, 12, 0, timeZone)

  const settingsResult = await getWorkBoardSettings()

  const boardSettings =
    settingsResult.success && settingsResult.data
      ? settingsResult.data
      : { weekStartDay: 1, workDayStart: '07:00', workDayEnd: '15:00' }

  const weekStart = getWeekStart(baseDate, boardSettings.weekStartDay)
  const [techResult, assignResult, bayResult] = await Promise.all([
    techPromise,
    getBoardJobs(weekStart),
    getWorkBays(),
  ])

  if (!techResult.success) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-muted-foreground text-lg">
          {techResult.error || (await getTranslations('workBoard.page'))('error')}
        </p>
      </div>
    )
  }

  const technicians = techResult.data ?? []
  const workBays = bayResult.success && bayResult.data ? bayResult.data : []
  const assignments = assignResult.success && assignResult.data ? assignResult.data : []

  return (
    <Suspense>
      <WorkBoardPresenter
        initialTechnicians={
          technicians as Parameters<typeof WorkBoardPresenter>[0]['initialTechnicians']
        }
        initialAssignments={
          assignments as Parameters<typeof WorkBoardPresenter>[0]['initialAssignments']
        }
        initialWorkBays={workBays}
        initialWeekStart={weekStart}
        workDayStart={boardSettings.workDayStart}
        workDayEnd={boardSettings.workDayEnd}
        weekStartDay={boardSettings.weekStartDay}
      />
    </Suspense>
  )
}
