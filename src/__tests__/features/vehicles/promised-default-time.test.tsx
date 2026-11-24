/**
 * "Promised to customer" on a work order: picking a day promises a time
 * somebody would actually say, not midnight.
 *
 * The time is the workshop's closing time that day when it has saved opening
 * hours, and 17:00 otherwise, on the workshop's clock. The viewer here is in
 * London and the workshop in Auckland, thirteen hours apart.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// biome-ignore lint/suspicious/noEmptyBlockStatements: a stub that measures nothing
const noop = () => {}
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe = noop
    unobserve = noop
    disconnect = noop
  }
)
Element.prototype.scrollIntoView = noop

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))
vi.mock('@/components/date-settings-context', () => ({
  useDateSettings: () => ({
    dateFormat: 'dd/MM/yyyy',
    timeFormat: '24h',
    timezone: 'Pacific/Auckland',
    weekStartDay: 1,
  }),
}))
vi.mock('@/features/team/Components/AddPersonDialog', () => ({ AddPersonDialog: () => null }))
vi.mock('@/features/workboard/Actions/technicianActions', () => ({ createTechnician: vi.fn() }))
vi.mock('@/features/workboard/Actions/boardActions', () => ({
  addJobHelper: vi.fn(),
  removeJobHelper: vi.fn(),
  assignTechnician: vi.fn(),
  scheduleJob: vi.fn(),
  checkSlotAvailability: vi.fn(),
  findNextSlot: vi.fn(),
  getTechnicianDayLoad: vi.fn(),
  setPromisedTime: vi.fn(),
  updateServiceTimes: vi.fn(),
}))

import {
  checkSlotAvailability,
  getTechnicianDayLoad,
  setPromisedTime,
} from '@/features/workboard/Actions/boardActions'
import { WorkOrderLayoutProvider } from '@/components/work-order-layout-context'
import { ScheduleTimesSection } from '@/features/vehicles/Components/service-edit/ScheduleTimesSection'
import { promiseTimesByWeekday } from '@/features/workshop-calendar/Lib/calendar'
import { zonedDate } from '@/lib/timezone'

const originalTz = process.env.TZ
beforeAll(() => {
  process.env.TZ = 'Europe/London'
})
afterAll(() => {
  process.env.TZ = originalTz
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(checkSlotAvailability).mockResolvedValue({
    success: true,
    data: { conflicts: [], closures: [], closedWeekday: false },
  } as never)
  vi.mocked(getTechnicianDayLoad).mockResolvedValue({
    success: true,
    data: { minutes: {}, away: {} },
  } as never)
  vi.mocked(setPromisedTime).mockResolvedValue({ success: true } as never)
})

/** Weekdays 08:00-16:30, Saturday 09:00-13:00, closed Sunday. */
const OPENING_HOURS = JSON.stringify([
  { open: false, start: '08:00', end: '16:30' },
  { open: true, start: '08:00', end: '16:30' },
  { open: true, start: '08:00', end: '16:30' },
  { open: true, start: '08:00', end: '16:30' },
  { open: true, start: '08:00', end: '16:30' },
  { open: true, start: '08:00', end: '16:30' },
  { open: true, start: '09:00', end: '13:00' },
])

/**
 * The first given weekday of next month, by the viewer's calendar: the picker
 * opens on the viewer's month, and next month is always ahead of today. (A
 * faked clock breaks the day picker's own date formatting, so the real one.)
 */
function nextMonthFirst(weekday: number) {
  const now = new Date()
  const year = now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear()
  const month = (now.getMonth() + 1) % 12
  let day = 1
  while (new Date(Date.UTC(year, month, day)).getUTCDay() !== weekday) day++
  const monthName = new Date(Date.UTC(year, month, 1)).toLocaleString('en-US', {
    month: 'long',
    timeZone: 'UTC',
  })
  return {
    year,
    month: month + 1,
    day,
    label: new RegExp(`${monthName} ${day}(st|nd|rd|th)?,`),
  }
}

async function promiseOn(label: RegExp, rawOpeningHours: string | null) {
  render(
    <WorkOrderLayoutProvider value={true}>
      <ScheduleTimesSection
        serviceRecordId="job-1"
        technicians={[]}
        initialStartDateTime="2026-11-26T20:00:00.000Z"
        initialEndDateTime="2026-11-26T22:00:00.000Z"
        promisedDefaultTimes={promiseTimesByWeekday(rawOpeningHours)}
      />
    </WorkOrderLayoutProvider>
  )
  await userEvent.click(screen.getByRole('button', { name: /Not promised yet/ }))
  await userEvent.click(screen.getByRole('button', { name: /next month/i }))
  // Browsing to another month promises nothing.
  expect(setPromisedTime).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole('button', { name: label }))
  await waitFor(() => expect(setPromisedTime).toHaveBeenCalled())
  return vi.mocked(setPromisedTime).mock.calls[0][0] as { promisedAt: Date }
}

describe('picking the promised day', () => {
  it("promises the workshop's closing time that day", async () => {
    const saturday = nextMonthFirst(6)
    const { promisedAt } = await promiseOn(saturday.label, OPENING_HOURS)
    // Saturdays close at 13:00, in Auckland.
    expect(promisedAt.toISOString()).toBe(
      zonedDate(
        saturday.year,
        saturday.month,
        saturday.day,
        13,
        0,
        'Pacific/Auckland'
      ).toISOString()
    )
  })

  it('promises 17:00 when the workshop has not saved opening hours', async () => {
    const friday = nextMonthFirst(5)
    const { promisedAt } = await promiseOn(friday.label, null)
    expect(promisedAt.toISOString()).toBe(
      zonedDate(friday.year, friday.month, friday.day, 17, 0, 'Pacific/Auckland').toISOString()
    )
  })
})

describe('promiseTimesByWeekday', () => {
  it('closes at the stored time on open days and 17:00 on closed ones', () => {
    expect(promiseTimesByWeekday(OPENING_HOURS)).toEqual([
      '17:00',
      '16:30',
      '16:30',
      '16:30',
      '16:30',
      '16:30',
      '13:00',
    ])
  })

  it('is 17:00 every day with no stored hours', () => {
    expect(promiseTimesByWeekday('')).toEqual(Array(7).fill('17:00'))
  })
})
