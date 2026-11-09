/**
 * Saving the workshop calendar: time off, closed days, opening hours, public
 * holidays and holiday calendars.
 *
 * The parts that would hurt if they broke quietly: time off for another
 * workshop's technician, a holiday fetch that fails and wipes the days
 * already known, a choice that comes back after it was switched off.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/cached-session', () => ({
  getCachedSession: vi.fn(),
  getCachedMembership: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))
vi.mock('@/features/workshop-calendar/Lib/icsFetch.server', () => ({
  fetchIcs: vi.fn(),
}))
vi.mock('@/lib/db', () => ({
  db: {
    user: { findUnique: vi.fn() },
    auditLog: { create: vi.fn() },
    organizationMember: { findFirst: vi.fn() },
    appSetting: { findMany: vi.fn(), findUnique: vi.fn(), upsert: vi.fn() },
    $transaction: vi.fn(),
    $executeRaw: vi.fn(),
    technician: { findFirst: vi.fn() },
    technicianAbsence: {
      create: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
      findMany: vi.fn(),
    },
    workshopClosure: {
      create: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
      findMany: vi.fn(),
    },
  },
}))

import { getCachedMembership, getCachedSession } from '@/lib/cached-session'
import { db } from '@/lib/db'
import { fetchIcs } from '@/features/workshop-calendar/Lib/icsFetch.server'
import { refreshLinkedFeeds } from '@/features/workshop-calendar/Lib/feedSync.server'
import { createAbsence } from '@/features/workshop-calendar/Actions/absenceActions'
import { createClosure } from '@/features/workshop-calendar/Actions/closureActions'
import { getWorkshopCalendar } from '@/features/workshop-calendar/Actions/calendarActions'
import { canEditTimeOff } from '@/features/workshop-calendar/Lib/access.server'
import {
  addHolidayFeed,
  refreshHolidayFeed,
  removeHolidayFeed,
  saveHolidayCountry,
  setHolidayFeedChoice,
  saveOpeningHours,
  setHolidayChoice,
} from '@/features/workshop-calendar/Actions/holidayActions'
import { syncPublicHolidays } from '@/features/workshop-calendar/Lib/holidaySync.server'
import { defaultWeek } from '@/features/workshop-calendar/Lib/calendar'

const ORG = 'org-a'
let settings: Map<string, string>

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(getCachedSession).mockResolvedValue({
    user: { id: 'user-a', email: 'a@x.com' },
  } as never)
  vi.mocked(getCachedMembership).mockResolvedValue({
    organizationId: ORG,
    role: 'owner',
    roleId: null,
    customRole: null,
  } as never)
  vi.mocked(db.user.findUnique).mockResolvedValue({ isSuperAdmin: false } as never)
  // Settings live in a map the mocked table reads from and writes to.
  settings = new Map()
  vi.mocked(db.appSetting.findMany).mockImplementation((async (args: {
    where: { key: { in: string[] } }
  }) =>
    args.where.key.in
      .filter((k) => settings.has(k))
      .map((k) => ({ key: k, value: settings.get(k) }))) as never)
  vi.mocked(db.appSetting.findUnique).mockImplementation((async (args: {
    where: { organizationId_key: { key: string } }
  }) => {
    const key = args.where.organizationId_key.key
    return settings.has(key) ? { value: settings.get(key) } : null
  }) as never)
  // The lock is Postgres's; here a transaction just runs.
  vi.mocked(db.$transaction).mockImplementation((async (fn: (tx: unknown) => unknown) =>
    fn(db)) as never)
  vi.mocked(db.appSetting.upsert).mockImplementation((async (args: {
    where: { organizationId_key: { key: string } }
    update: { value: string }
  }) => {
    settings.set(args.where.organizationId_key.key, args.update.value)
    return {}
  }) as never)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('time off', () => {
  it('refuses a technician from another workshop', async () => {
    vi.mocked(db.technician.findFirst).mockResolvedValue(null)
    const res = await createAbsence({
      technicianId: 'tech-b',
      startDate: '2026-11-16',
      endDate: '2026-11-20',
      reason: 'holiday',
    })
    expect(res.success).toBe(false)
    expect(db.technicianAbsence.create).not.toHaveBeenCalled()
    expect(vi.mocked(db.technician.findFirst).mock.calls[0][0]?.where).toEqual({
      id: 'tech-b',
      organizationId: ORG,
    })
  })

  it('saves whole days without times, and part of a day with them', async () => {
    vi.mocked(db.technician.findFirst).mockResolvedValue({ id: 'tech-a' } as never)
    vi.mocked(db.technicianAbsence.create).mockResolvedValue({
      id: 'a1',
      technicianId: 'tech-a',
      startDate: new Date('2026-11-16T00:00:00Z'),
      endDate: new Date('2026-11-20T00:00:00Z'),
      startTime: null,
      endTime: null,
      reason: 'holiday',
      note: null,
      technician: { name: 'Kari', color: '#000' },
    } as never)

    const res = await createAbsence({
      technicianId: 'tech-a',
      startDate: '2026-11-16',
      endDate: '2026-11-20',
      startTime: '',
      endTime: null,
      reason: 'holiday',
      note: '  ',
    })
    expect(res.success).toBe(true)
    const data = vi.mocked(db.technicianAbsence.create).mock.calls[0][0].data
    expect(data).toMatchObject({
      organizationId: ORG,
      startDate: new Date('2026-11-16T00:00:00Z'),
      endDate: new Date('2026-11-20T00:00:00Z'),
      startTime: null,
      endTime: null,
      note: null,
    })
    expect(res.data).toMatchObject({ startDate: '2026-11-16', technicianName: 'Kari' })
  })

  it('refuses a stretch that ends before it starts or crosses its own times', async () => {
    vi.mocked(db.technician.findFirst).mockResolvedValue({ id: 'tech-a' } as never)
    const backwards = await createAbsence({
      technicianId: 'tech-a',
      startDate: '2026-11-20',
      endDate: '2026-11-16',
    })
    const crossed = await createAbsence({
      technicianId: 'tech-a',
      startDate: '2026-11-16',
      endDate: '2026-11-16',
      startTime: '15:00',
      endTime: '13:00',
    })
    expect(backwards.success).toBe(false)
    expect(crossed.success).toBe(false)
    expect(db.technicianAbsence.create).not.toHaveBeenCalled()
  })
})

describe('who may see and set leave', () => {
  const member = (customRole: unknown) =>
    vi.mocked(getCachedMembership).mockResolvedValue({
      organizationId: ORG,
      role: 'member',
      roleId: customRole ? 'role-1' : null,
      customRole,
    } as never)
  const board = (action: string) => ({ action, subject: 'work_board' })

  it('keeps the board calendar, with its leave notes, from a role without the board', async () => {
    member({ isAdmin: false, permissions: [{ action: 'read', subject: 'customers' }] })
    const res = await getWorkshopCalendar({ from: '2026-11-16', to: '2026-11-22' })
    expect(res).toMatchObject({ success: false, forbidden: true })
    expect(db.technicianAbsence.findMany).not.toHaveBeenCalled()
  })

  it('offers the leave buttons exactly where the actions accept them', async () => {
    member({ isAdmin: true, permissions: [] })
    expect(await canEditTimeOff('user-a', 'member')).toBe(true)

    member({ isAdmin: false, permissions: [board('update')] })
    expect(await canEditTimeOff('user-a', 'member')).toBe(true)

    member({ isAdmin: false, permissions: [board('read')] })
    expect(await canEditTimeOff('user-a', 'member')).toBe(false)

    // A member with no role has no permissions, in withAuth and here.
    member(null)
    expect(await canEditTimeOff('user-a', 'member')).toBe(false)
  })
})

describe('closed days', () => {
  it('saves a closure for this workshop only', async () => {
    vi.mocked(db.workshopClosure.create).mockResolvedValue({
      id: 'c1',
      name: 'Summer shutdown',
      startDate: new Date('2027-07-05T00:00:00Z'),
      endDate: new Date('2027-07-23T00:00:00Z'),
      startTime: null,
      endTime: null,
      repeatsYearly: true,
    } as never)
    const res = await createClosure({
      name: ' Summer shutdown ',
      startDate: '2027-07-05',
      endDate: '2027-07-23',
      repeatsYearly: true,
    })
    expect(res.success).toBe(true)
    expect(vi.mocked(db.workshopClosure.create).mock.calls[0][0].data).toMatchObject({
      organizationId: ORG,
      name: 'Summer shutdown',
      repeatsYearly: true,
    })
  })
})

describe('opening hours', () => {
  it('saves the week and keeps the work day in step for what still reads it', async () => {
    const week = defaultWeek('07:30', '16:00')
    week[6] = { open: true, start: '07:00', end: '12:00' }
    const res = await saveOpeningHours(week)
    expect(res.success).toBe(true)
    expect(JSON.parse(settings.get('workshop.openingHours') as string)[6]).toEqual(week[6])
    expect(settings.get('workboard.workDayStart')).toBe('07:00')
    expect(settings.get('workboard.workDayEnd')).toBe('16:00')
  })

  it('refuses a day that closes before it opens', async () => {
    const week = defaultWeek()
    week[1] = { open: true, start: '16:00', end: '08:00' }
    expect((await saveOpeningHours(week)).success).toBe(false)
    expect(settings.has('workshop.openingHours')).toBe(false)
  })
})

describe('public holidays', () => {
  const holiday = (date: string, name: string) => ({
    date,
    localName: name,
    name,
    countryCode: 'AU',
    global: true,
    counties: null,
    types: ['Public'],
  })

  it('fetches a new country, starts it with its own defaults, and keeps regions of that country', async () => {
    settings.set('holidays.country', 'NO')
    settings.set('holidays.choices', JSON.stringify({ 'Labour Day': false }))
    const fetchMock = vi.fn(async (url: string) => {
      const year = Number(url.match(/PublicHolidays\/(\d{4})/)?.[1])
      return new Response(JSON.stringify([holiday(`${year}-12-25`, 'Christmas Day')]), {
        status: 200,
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const res = await saveHolidayCountry({ country: 'au', regions: ['AU-QLD', 'DE-BY'] })
    expect(res.success).toBe(true)
    expect(settings.get('holidays.country')).toBe('AU')
    expect(JSON.parse(settings.get('holidays.regions') as string)).toEqual(['AU-QLD'])
    expect(settings.get('holidays.choices')).toBe('{}')
    const cache = JSON.parse(settings.get('holidays.cache') as string)
    expect(cache.country).toBe('AU')
    expect(Object.keys(cache.years)).toHaveLength(3)
    expect(
      fetchMock.mock.calls.every(([url]) =>
        String(url).startsWith('https://date.nager.at/api/v3/PublicHolidays/')
      )
    ).toBe(true)
  })

  it('keeps the holidays it had when a fetch fails, and records why', async () => {
    settings.set('holidays.country', 'NZ')
    settings.set(
      'holidays.cache',
      JSON.stringify({
        country: 'NZ',
        fetchedAt: '2026-11-01T00:00:00.000Z',
        years: { '2026': [holiday('2026-12-25', 'Christmas Day')] },
      })
    )
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('down', { status: 503 }))
    )

    const cache = await syncPublicHolidays(ORG, { now: new Date('2026-11-09T00:00:00Z') })
    expect(cache?.error).toContain('503')
    expect(cache?.years['2026']).toHaveLength(1)
    expect(cache?.fetchedAt).toBe('2026-11-01T00:00:00.000Z')
  })

  it('forgets a choice set back to the default', async () => {
    settings.set(
      'holidays.choices',
      JSON.stringify({ 'Christmas Day': false, 'Boxing Day': false })
    )
    await setHolidayChoice({ key: 'Christmas Day', closed: null })
    expect(JSON.parse(settings.get('holidays.choices') as string)).toEqual({ 'Boxing Day': false })
  })
})

describe('holiday calendars', () => {
  const ics = [
    'BEGIN:VCALENDAR',
    'X-WR-CALNAME:Our holidays',
    'BEGIN:VEVENT',
    'DTSTART;VALUE=DATE:20261225',
    'SUMMARY:Christmas Day',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'DTSTART;VALUE=DATE:20270101',
    'SUMMARY:New Year',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')

  it('adds a calendar from a file with its days, named after the calendar', async () => {
    const res = await addHolidayFeed({ fileName: 'ours.ics', text: ics })
    expect(res.success).toBe(true)
    const [feed] = JSON.parse(settings.get('holidays.feeds') as string)
    expect(feed).toMatchObject({ name: 'Our holidays', url: null, fileName: 'ours.ics' })
    expect(feed.events.map((e: { name: string }) => e.name)).toEqual(['Christmas Day', 'New Year'])
  })

  it('refuses a file that is not a calendar', async () => {
    const res = await addHolidayFeed({ fileName: 'notes.ics', text: 'hello' })
    expect(res.success).toBe(false)
    expect(settings.has('holidays.feeds')).toBe(false)
  })

  it('reads a webcal link as https and stores its days', async () => {
    vi.mocked(fetchIcs).mockResolvedValue(ics)
    const res = await addHolidayFeed({ url: 'webcal://example.com/holidays.ics' })
    expect(res.success).toBe(true)
    expect(fetchIcs).toHaveBeenCalledWith('https://example.com/holidays.ics')
    const [feed] = JSON.parse(settings.get('holidays.feeds') as string)
    expect(feed.url).toBe('https://example.com/holidays.ics')
  })

  const stored = () =>
    JSON.parse(settings.get('holidays.feeds') ?? '[]') as {
      id: string
      events: { name: string }[]
      choices: Record<string, boolean>
    }[]

  async function addLinked() {
    vi.mocked(fetchIcs).mockResolvedValue(ics)
    await addHolidayFeed({ url: 'https://example.com/holidays.ics' })
    return stored()[0].id
  }

  it('clears the days of a calendar that has lost its last one', async () => {
    const id = await addLinked()
    vi.mocked(fetchIcs).mockResolvedValue('BEGIN:VCALENDAR\r\nEND:VCALENDAR')
    const res = await refreshHolidayFeed(id)
    expect(res.success).toBe(true)
    expect(stored()[0].events).toEqual([])
  })

  it('keeps a switch made while the calendar was being read', async () => {
    const id = await addLinked()
    vi.mocked(fetchIcs).mockImplementation(async () => {
      await setHolidayFeedChoice({ feedId: id, name: 'Christmas Day', closed: false })
      return ics
    })
    await refreshLinkedFeeds(ORG)
    expect(stored()[0].choices).toEqual({ 'Christmas Day': false })
  })

  it('does not bring back a calendar removed while it was being read', async () => {
    const id = await addLinked()
    vi.mocked(fetchIcs).mockImplementation(async () => {
      await removeHolidayFeed(id)
      return ics
    })
    const res = await refreshHolidayFeed(id)
    expect(res).toMatchObject({ success: false, error: 'Calendar not found' })
    expect(stored()).toEqual([])
  })
})
