/**
 * The screens for leave, opening hours and public holidays, used the way a
 * service advisor would: what they pick is what gets saved.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))
vi.mock('@/components/confirm-dialog', () => ({ useConfirm: () => vi.fn(async () => true) }))
vi.mock('@/components/date-settings-context', () => ({
  useDateSettings: () => ({ dateFormat: 'yyyy-MM-dd', timeFormat: '24h', timezone: 'UTC' }),
}))
vi.mock('@/features/workshop-calendar/Actions/absenceActions', () => ({
  createAbsence: vi.fn(),
  updateAbsence: vi.fn(),
  deleteAbsence: vi.fn(),
  listAbsences: vi.fn(),
}))
vi.mock('@/features/workshop-calendar/Actions/holidayActions', () => ({
  saveOpeningHours: vi.fn(),
  setHolidayChoice: vi.fn(),
  saveHolidayCountry: vi.fn(),
  refreshPublicHolidays: vi.fn(),
  listHolidayCountries: vi.fn(),
}))

import { toast } from 'sonner'
import { createAbsence } from '@/features/workshop-calendar/Actions/absenceActions'
import {
  listHolidayCountries,
  saveOpeningHours,
  setHolidayChoice,
} from '@/features/workshop-calendar/Actions/holidayActions'
import { TimeOffDialog } from '@/features/workshop-calendar/Components/TimeOffDialog'
import { OpeningHoursCard } from '@/features/workshop-calendar/Components/OpeningHoursCard'
import { PublicHolidaysCard } from '@/features/workshop-calendar/Components/PublicHolidaysCard'
import { defaultWeek } from '@/features/workshop-calendar/Lib/calendar'
import type { HolidayRow } from '@/features/workshop-calendar/Lib/holidays'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('setting a technician on leave', () => {
  const technicians = [
    { id: 'kari', name: 'Kari', color: '#f00' },
    { id: 'ola', name: 'Ola', color: '#00f' },
  ]

  it('saves the technician picked from the lane, whole days, as leave by default', async () => {
    vi.mocked(createAbsence).mockResolvedValue({ success: true, data: {} } as never)
    const onSaved = vi.fn()
    render(
      <TimeOffDialog
        open
        onOpenChange={vi.fn()}
        technicians={technicians}
        defaultTechnicianId="kari"
        defaultDate="2026-11-16"
        onSaved={onSaved}
      />
    )
    expect(
      screen.getByRole('heading', { name: 'Set on leave or out of office' })
    ).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Note'), 'Two weeks in Spain')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(createAbsence).toHaveBeenCalledWith({
      technicianId: 'kari',
      reason: 'holiday',
      note: 'Two weeks in Spain',
      startDate: '2026-11-16',
      endDate: '2026-11-16',
      startTime: null,
      endTime: null,
    })
    expect(onSaved).toHaveBeenCalled()
  })

  it('asks for a technician before saving when none was picked', async () => {
    render(
      <TimeOffDialog
        open
        onOpenChange={vi.fn()}
        technicians={technicians}
        defaultDate="2026-11-16"
        onSaved={vi.fn()}
      />
    )
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Pick a technician')
    expect(createAbsence).not.toHaveBeenCalled()
  })

  it('sends times only for part of a day, and refuses times that cross', async () => {
    vi.mocked(createAbsence).mockResolvedValue({ success: true, data: {} } as never)
    render(
      <TimeOffDialog
        open
        onOpenChange={vi.fn()}
        technicians={technicians}
        defaultTechnicianId="ola"
        defaultDate="2026-11-17"
        onSaved={vi.fn()}
      />
    )
    await userEvent.click(screen.getByRole('switch', { name: 'Part of the day' }))
    const from = screen.getByLabelText('From')
    const until = screen.getByLabelText('Until')
    await userEvent.type(from, '15:00')
    await userEvent.type(until, '13:00')
    expect(screen.getByRole('alert')).toHaveTextContent('The end time is before the start time')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(createAbsence).not.toHaveBeenCalled()

    await userEvent.clear(until)
    await userEvent.type(until, '17:00')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(createAbsence).toHaveBeenCalledWith(
      expect.objectContaining({ technicianId: 'ola', startTime: '15:00', endTime: '17:00' })
    )
  })
})

describe('opening hours', () => {
  it('opens Saturday mornings and saves the week', async () => {
    vi.mocked(saveOpeningHours).mockResolvedValue({ success: true, data: {} } as never)
    render(<OpeningHoursCard week={defaultWeek('08:00', '16:00')} canEdit />)
    const saturday = screen.getByTestId('opening-hours-6')
    await userEvent.click(within(saturday).getByRole('switch'))
    const closes = within(saturday).getByLabelText('Saturday: Closes')
    await userEvent.clear(closes)
    await userEvent.type(closes, '12:00')
    await userEvent.click(screen.getByRole('button', { name: 'Save opening hours' }))

    const week = vi.mocked(saveOpeningHours).mock.calls[0][0] as ReturnType<typeof defaultWeek>
    expect(week[6]).toEqual({ open: true, start: '08:00', end: '12:00' })
    expect(week[0].open).toBe(false)
  })

  it('says which day is wrong instead of saving hours that close before they open', async () => {
    render(<OpeningHoursCard week={defaultWeek('08:00', '16:00')} canEdit />)
    const monday = screen.getByTestId('opening-hours-1')
    const closes = within(monday).getByLabelText('Monday: Closes')
    await userEvent.clear(closes)
    await userEvent.type(closes, '07:00')
    await userEvent.click(screen.getByRole('button', { name: 'Save opening hours' }))
    expect(saveOpeningHours).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith(
      'Monday: the closing time must be after the opening time'
    )
  })
})

describe('public holidays', () => {
  const rows: HolidayRow[] = [
    {
      key: 'Christmas Day',
      name: 'Christmas Day',
      localName: 'Christmas Day',
      dates: ['2026-12-25'],
      types: ['Public'],
      regional: false,
      counties: [],
      closed: true,
      closedByDefault: true,
    },
    {
      key: 'Melbourne Cup',
      name: 'Melbourne Cup',
      localName: 'Melbourne Cup',
      dates: ['2026-11-03'],
      types: ['Public'],
      regional: true,
      counties: ['AU-VIC'],
      closed: true,
      closedByDefault: true,
    },
  ]

  it('stays open on a holiday when it is switched off, and forgets that when switched back', async () => {
    vi.mocked(listHolidayCountries).mockResolvedValue({
      success: true,
      data: { countries: ['AU', 'NZ'], error: null },
    } as never)
    vi.mocked(setHolidayChoice).mockResolvedValue({ success: true, data: {} } as never)
    render(
      <PublicHolidaysCard
        country="AU"
        regions={['AU-VIC']}
        availableRegions={['AU-QLD', 'AU-VIC']}
        holidays={rows}
        fetchedAt={null}
        fetchError={null}
        year={2026}
        canEdit
      />
    )
    const cup = screen.getByRole('switch', { name: 'Melbourne Cup: Closed' })
    await userEvent.click(cup)
    expect(setHolidayChoice).toHaveBeenLastCalledWith({ key: 'Melbourne Cup', closed: false })
    expect(screen.getByRole('switch', { name: 'Melbourne Cup: Open' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('switch', { name: 'Melbourne Cup: Open' }))
    expect(setHolidayChoice).toHaveBeenLastCalledWith({ key: 'Melbourne Cup', closed: null })
    expect(screen.getByText('Only in VIC')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'VIC' })).toHaveAttribute('aria-pressed', 'true')
  })
})
